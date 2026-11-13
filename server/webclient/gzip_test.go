package webclient

import (
	"compress/gzip"
	"io"
	"math/rand/v2"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"testing/fstest"
)

// A snapshot must negotiate its cached representation itself. Its decoded ETag
// identifies the same program for identity, gzip, HEAD and conditional requests.
func TestSnapshotGzipRepresentations(t *testing.T) {
	body := strings.Repeat("export const scene = 'stoneage';\n", 1200)
	files := fstest.MapFS{"dist/main.js": {Data: []byte(body)}, "index.html": {Data: []byte(strings.Repeat("<p>StoneAge</p>", 100))}}
	h := handler(files, true)
	get := func(method, path, encoding, tag, ranges string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, path, nil)
		r.Header.Set("Accept-Encoding", encoding)
		if tag != "" {
			r.Header.Set("If-None-Match", tag)
		}
		if ranges != "" {
			r.Header.Set("Range", ranges)
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w
	}
	tag := get("GET", "/dist/main.js", "identity", "", "").Header().Get("ETag")
	for _, tc := range []struct {
		encoding   string
		compressed bool
	}{
		{"gzip", true}, {"GZip;q=0.5", true}, {"*;q=0.5", true},
		{"gzip;q=0", false}, {"gzip;q=0,*;q=1", false}, {"gzip;q=NaN", false}, {"identity", false},
	} {
		t.Run(tc.encoding, func(t *testing.T) {
			for _, method := range []string{"GET", "HEAD"} {
				w := get(method, "/dist/main.js?v=old-query", tc.encoding, "", "")
				if w.Code != http.StatusOK || (w.Header().Get("Content-Encoding") == "gzip") != tc.compressed || w.Header().Get("ETag") != tag || tag == "" {
					t.Fatalf("%s representation: code=%d headers=%v", method, w.Code, w.Header())
				}
				if method == "HEAD" {
					if w.Body.Len() != 0 {
						t.Fatal("HEAD emitted a representation body")
					}
				} else if tc.compressed {
					reader, err := gzip.NewReader(w.Body)
					if err != nil {
						t.Fatal(err)
					}
					decoded, err := io.ReadAll(reader)
					if err := reader.Close(); err != nil {
						t.Error(err)
					}
					if err != nil || string(decoded) != body {
						t.Fatalf("gzip decoded program changed: %v", err)
					}
				} else if w.Body.String() != body {
					t.Fatal("identity program changed")
				}
				conditional := get(method, "/dist/main.js", tc.encoding, tag, "")
				if conditional.Code != http.StatusNotModified || conditional.Body.Len() != 0 || conditional.Header().Get("Content-Encoding") != "" || !strings.Contains(conditional.Header().Get("Vary"), "Accept-Encoding") {
					t.Fatalf("%s conditional: code=%d headers=%v bytes=%d", method, conditional.Code, conditional.Header(), conditional.Body.Len())
				}
			}
		})
	}
	// Gzip disables byte ranges over the decoded program. Identity still supports
	// the original range contract, and a cached startup program remains immutable.
	if w := get("GET", "/dist/main.js", "identity", "", "bytes=0-5"); w.Code != http.StatusPartialContent || w.Body.String() != "export" {
		t.Fatalf("identity range changed: %d %q", w.Code, w.Body.String())
	}
	if w := get("GET", "/dist/main.js", "gzip", "", "bytes=0-5"); w.Code != http.StatusOK || w.Header().Get("Content-Encoding") != "gzip" {
		t.Fatalf("gzip range was partially encoded: %d %v", w.Code, w.Header())
	}
	files["dist/main.js"].Data = []byte("updated external data")
	if w := get("GET", "/dist/main.js", "gzip", tag, ""); w.Code != http.StatusNotModified {
		t.Fatal("an immutable client changed after startup")
	}
	if w := get("GET", "/", "gzip", "", ""); w.Code != http.StatusOK || w.Header().Get("Content-Encoding") != "gzip" || w.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("embedded entry page: %d %v", w.Code, w.Header())
	}
}

func TestSnapshotGzipCacheIsBounded(t *testing.T) {
	random := rand.New(rand.NewPCG(9, 13))
	files := fstest.MapFS{}
	for _, name := range []string{"a", "b", "c", "d", "e", "f", "g", "h", "i"} {
		// A limited ASCII alphabet compresses at BestSpeed but keeps each
		// retained stream substantial enough to exhaust the shared budget.
		// Always use a fixed seed so the allocation boundary is reproducible.
		content := make([]byte, 1<<20)
		for i := range content {
			content[i] = "0123456789abcdef"[random.IntN(16)]
		}
		files["dist/"+name+".js"] = &fstest.MapFile{Data: content}
	}
	files["dist/large.js"] = &fstest.MapFile{Data: []byte(strings.Repeat("export const oversized = 1;\n", 100000))}
	h := handler(files, true)
	retained, compressed := 0, 0
	for name, file := range files {
		r := httptest.NewRequest("GET", "/"+name, nil)
		r.Header.Set("Accept-Encoding", "gzip")
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != http.StatusOK {
			t.Fatalf("published program %s: %d", name, w.Code)
		}
		if w.Header().Get("Content-Encoding") == "gzip" {
			if name == "dist/large.js" {
				t.Fatal("an oversized input exceeded the per-file compression limit")
			}
			retained += w.Body.Len()
			compressed++
		} else if w.Body.String() != string(file.Data) {
			t.Fatalf("uncached identity program %s changed", name)
		}
	}
	if retained > 4<<20 || compressed == 0 || compressed == len(files)-1 {
		t.Fatalf("compressed cache must be useful and bounded: bytes=%d files=%d", retained, compressed)
	}
}

func TestSnapshotGzipConcurrentRequests(t *testing.T) {
	body := strings.Repeat("export const pet = 'Uli';\n", 1000)
	h := handler(fstest.MapFS{"dist/main.js": {Data: []byte(body)}}, true)
	var wg sync.WaitGroup
	for i := 0; i < 32; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			r := httptest.NewRequest("GET", "/dist/main.js", nil)
			r.Header.Set("Accept-Encoding", "gzip")
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			if w.Code != http.StatusOK || w.Header().Get("Content-Encoding") != "gzip" {
				t.Errorf("concurrent representation: %d %v", w.Code, w.Header())
				return
			}
			reader, err := gzip.NewReader(w.Body)
			if err != nil {
				t.Error(err)
				return
			}
			decoded, err := io.ReadAll(reader)
			if err := reader.Close(); err != nil {
				t.Error(err)
			}
			if err != nil || string(decoded) != body {
				t.Errorf("concurrent program changed: %v", err)
			}
		}()
	}
	wg.Wait()
}
