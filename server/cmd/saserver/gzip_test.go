package main

import (
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"sa/server/webclient"
)

func TestGzipNegotiationAndClientValidators(t *testing.T) {
	dir := t.TempDir()
	if err := os.Mkdir(filepath.Join(dir, "dist"), 0700); err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(dir, "dist", "main.js")
	body := strings.Repeat("export const value = 1;\n", 40)
	if err := os.WriteFile(file, []byte(body), 0600); err != nil {
		t.Fatal(err)
	}
	h := gzipped(webclient.Handler(dir))
	request := func(method, encoding, tag string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, "/dist/main.js?v=untrusted-version", nil)
		r.Header.Set("Accept-Encoding", encoding)
		if tag != "" {
			r.Header.Set("If-None-Match", tag)
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w
	}
	tag := request("GET", "", "").Header().Get("ETag")
	for _, tc := range []struct {
		encoding string
		gzip     bool
	}{
		{"", false}, {"br", false}, {"gzip;q=0", false}, {"br, gzip;q=0, identity;q=1", false},
		{"gzip;q=0, *;q=1", false}, {"notgzip", false}, {"gzip;q=NaN", false}, {"gzip;q=2", false},
		{"gzip", true}, {"GZip", true}, {"br, gzip;q=0.5", true}, {"*;q=0.5", true},
	} {
		t.Run(tc.encoding, func(t *testing.T) {
			w := request("GET", tc.encoding, "")
			if w.Code != http.StatusOK || (w.Header().Get("Content-Encoding") == "gzip") != tc.gzip {
				t.Fatalf("encoding %q: %d %v", tc.encoding, w.Code, w.Header())
			}
			if !strings.Contains(w.Header().Get("Vary"), "Accept-Encoding") || w.Header().Get("ETag") != tag || tag == "" {
				t.Fatalf("cache headers: %v", w.Header())
			}
			if tc.gzip {
				reader, err := gzip.NewReader(w.Body)
				if err != nil {
					t.Fatal(err)
				}
				decoded, err := io.ReadAll(reader)
				reader.Close()
				if err != nil || string(decoded) != body {
					t.Fatalf("gzip body differs: %v", err)
				}
			} else if w.Body.String() != body {
				t.Fatal("identity body differs")
			}
			for _, method := range []string{"GET", "HEAD"} {
				conditional := request(method, tc.encoding, tag)
				if conditional.Code != http.StatusNotModified || conditional.Body.Len() != 0 || conditional.Header().Get("ETag") != tag || !strings.Contains(conditional.Header().Get("Vary"), "Accept-Encoding") {
					t.Fatalf("%s conditional: %d %v body=%d", method, conditional.Code, conditional.Header(), conditional.Body.Len())
				}
			}
			head := request("HEAD", tc.encoding, "")
			if head.Body.Len() != 0 || (head.Header().Get("Content-Encoding") == "gzip") != tc.gzip {
				t.Fatalf("HEAD metadata: %v body=%d", head.Header(), head.Body.Len())
			}
		})
	}
	// An external edit must invalidate even when a browser reuses an old query.
	if err := os.WriteFile(file, []byte(strings.ReplaceAll(body, "1;", "2;")), 0600); err != nil {
		t.Fatal(err)
	}
	updated := request("GET", "gzip", tag)
	if updated.Code != http.StatusOK || updated.Header().Get("ETag") == tag {
		t.Fatalf("stale external validator: %d %v", updated.Code, updated.Header())
	}
	// Check actual wire responses too: net/http strips forbidden 304 metadata,
	// and pooled writers must never append a gzip trailer after HEAD or 304.
	srv := httptest.NewServer(h)
	defer srv.Close()
	transport := &http.Transport{DisableCompression: true}
	defer transport.CloseIdleConnections()
	for _, encoding := range []string{"identity", "gzip"} {
		for _, method := range []string{"GET", "HEAD"} {
			req, _ := http.NewRequest(method, srv.URL+"/dist/main.js", nil)
			req.Header.Set("Accept-Encoding", encoding)
			req.Header.Set("If-None-Match", updated.Header().Get("ETag"))
			res, err := transport.RoundTrip(req)
			if err != nil {
				t.Fatal(err)
			}
			body, err := io.ReadAll(res.Body)
			res.Body.Close()
			if err != nil || res.StatusCode != http.StatusNotModified || len(body) != 0 || res.Header.Get("Content-Encoding") != "" || !strings.Contains(res.Header.Get("Vary"), "Accept-Encoding") {
				t.Fatalf("wire %s %s: %d %v bytes=%d err=%v", method, encoding, res.StatusCode, res.Header, len(body), err)
			}
		}
	}
}

// 文字类文件按 Accept-Encoding 压缩、内容不变；WebP 不压；不带 Accept-Encoding 时原样；目录不列出来。
func TestGzipStatic(t *testing.T) {
	dir := t.TempDir()
	big := strings.Repeat(`{"tiles":[1,2,3,4,5,6,7,8]}`, 2000)
	os.WriteFile(filepath.Join(dir, "tiles.json"), []byte(big), 0o644)
	os.WriteFile(filepath.Join(dir, "page.webp"), []byte("RIFFxxxxWEBP"), 0o644)
	os.MkdirAll(filepath.Join(dir, "sub"), 0o755)
	h := gzipped(http.FileServer(noListing{http.Dir(dir)}))
	srv := httptest.NewServer(h)
	defer srv.Close()
	get := func(p, enc string) *http.Response {
		req, _ := http.NewRequest("GET", srv.URL+p, nil)
		if enc != "" {
			req.Header.Set("Accept-Encoding", enc)
		}
		res, err := http.DefaultTransport.RoundTrip(req) // 不让 Go 自己解压
		if err != nil {
			t.Fatal(err)
		}
		return res
	}
	res := get("/tiles.json", "gzip")
	raw, _ := io.ReadAll(res.Body)
	if res.Header.Get("Content-Encoding") != "gzip" || len(raw) >= len(big)/10 {
		t.Fatalf("tiles.json 应 gzip：encoding=%q size=%d", res.Header.Get("Content-Encoding"), len(raw))
	}
	zr, err := gzip.NewReader(strings.NewReader(string(raw)))
	if err != nil {
		t.Fatal(err)
	}
	if body, _ := io.ReadAll(zr); string(body) != big {
		t.Fatal("解压后内容不同")
	}
	if res := get("/tiles.json", ""); res.Header.Get("Content-Encoding") != "" {
		t.Fatal("没要 gzip 就不该压")
	}
	if res := get("/page.webp", "gzip"); res.Header.Get("Content-Encoding") != "" {
		t.Fatal("WebP 不该压")
	}
	if res := get("/sub/", "gzip"); res.StatusCode != http.StatusNotFound {
		t.Fatalf("目录不该列出来：%d", res.StatusCode)
	}
	if res := get("/missing.json", "gzip"); res.StatusCode != http.StatusNotFound || res.Header.Get("Content-Encoding") != "" {
		t.Fatalf("404 不该压：%d %q", res.StatusCode, res.Header.Get("Content-Encoding"))
	}
}
