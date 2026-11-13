package main

import (
	"bytes"
	"compress/gzip"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"sa/server/webclient"
)

type disconnectedGzipResponse struct{ header http.Header }

func (w *disconnectedGzipResponse) Header() http.Header { return w.header }
func (*disconnectedGzipResponse) WriteHeader(int)       {}
func (*disconnectedGzipResponse) Write([]byte) (int, error) {
	return 0, errors.New("test transport disconnected")
}

func TestGzipTransportFailureAbortsResponse(t *testing.T) {
	h := gzipped(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		// The transport is intentionally broken below the real compression
		// middleware; an incomplete gzip stream must not return normal EOF.
		_, _ = w.Write([]byte("export const scene = 'stoneage';"))
	}))
	r := httptest.NewRequest("GET", "/dist/main.js", nil)
	r.Header.Set("Accept-Encoding", "gzip")
	defer func() {
		if reason := recover(); reason != http.ErrAbortHandler {
			t.Fatalf("failed gzip transport must abort the HTTP response, got %v", reason)
		}
	}()
	h.ServeHTTP(&disconnectedGzipResponse{header: make(http.Header)}, r)
}

func TestGzipCleanupPreservesHandlerPanic(t *testing.T) {
	const original = "test handler failed"
	h := gzipped(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("export const scene = 'stoneage';"))
		panic(original)
	}))
	r := httptest.NewRequest("GET", "/dist/main.js", nil)
	r.Header.Set("Accept-Encoding", "gzip")
	defer func() {
		if reason := recover(); reason != original {
			t.Fatalf("cleanup must retain the handler's original failure, got %v", reason)
		}
	}()
	h.ServeHTTP(&disconnectedGzipResponse{header: make(http.Header)}, r)
}

func TestGzipEmptySuccessHasValidStream(t *testing.T) {
	h := gzipped(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
		w.WriteHeader(http.StatusOK)
	}))
	r := httptest.NewRequest("GET", "/dist/empty.js", nil)
	r.Header.Set("Accept-Encoding", "gzip")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	reader, err := gzip.NewReader(w.Body)
	if err != nil {
		t.Fatalf("empty successful gzip representation must still have a valid stream: %v", err)
	}
	body, err := io.ReadAll(reader)
	if closeErr := reader.Close(); closeErr != nil {
		t.Error(closeErr)
	}
	if err != nil || len(body) != 0 || w.Header().Get("Content-Encoding") != "gzip" {
		t.Fatalf("empty decoded representation changed: bytes=%d headers=%v err=%v", len(body), w.Header(), err)
	}
}

func TestPrecompressedClientAvoidsDoubleGzip(t *testing.T) {
	const program = "export const battle = 'stoneage';"
	var encoded bytes.Buffer
	writer := gzip.NewWriter(&encoded)
	if _, err := writer.Write([]byte(program)); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	h := gzipped(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
		w.Header().Set("Content-Encoding", "gzip")
		if _, err := w.Write(encoded.Bytes()); err != nil {
			t.Error(err)
		}
	}))
	r := httptest.NewRequest("GET", "/dist/main.js", nil)
	r.Header.Set("Accept-Encoding", "gzip")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	reader, err := gzip.NewReader(w.Body)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := io.ReadAll(reader)
	if err := reader.Close(); err != nil {
		t.Error(err)
	}
	if err != nil || string(decoded) != program {
		t.Fatalf("one gzip decode must yield the program, got %q: %v", decoded, err)
	}
}

func TestLoginArtworkThroughHTTPMiddleware(t *testing.T) {
	dir := t.TempDir()
	if err := os.Mkdir(filepath.Join(dir, "art"), 0700); err != nil {
		t.Fatal(err)
	}
	content := []byte{137, 80, 78, 71, 13, 10, 26, 10, 1}
	if err := os.WriteFile(filepath.Join(dir, "art", "login.png"), content, 0600); err != nil {
		t.Fatal(err)
	}
	h := gzipped(webclient.Handler(dir))
	r := httptest.NewRequest("GET", "/art/login.png?v=test", nil)
	r.Header.Set("Accept-Encoding", "gzip")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 200 || w.Header().Get("Content-Type") != "image/png" || w.Header().Get("Content-Encoding") != "" || w.Header().Get("Cache-Control") != "no-cache" || string(content) != w.Body.String() {
		t.Fatalf("PNG middleware response %d %v %v", w.Code, w.Header(), w.Body.Bytes())
	}
	tag := w.Header().Get("ETag")
	if tag == "" {
		t.Fatal("missing PNG validator")
	}
	for _, method := range []string{"GET", "HEAD"} {
		r = httptest.NewRequest(method, "/art/login.png", nil)
		r.Header.Set("If-None-Match", tag)
		r.Header.Set("Accept-Encoding", "gzip")
		w = httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != 304 || w.Body.Len() != 0 || w.Header().Get("Content-Encoding") != "" {
			t.Fatalf("PNG conditional %s: %d %v", method, w.Code, w.Header())
		}
	}
}

func TestClientGzipHEAD(t *testing.T) {
	dir := t.TempDir()
	if err := os.Mkdir(filepath.Join(dir, "dist"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "dist", "main.js"), []byte("console.log('release');"), 0600); err != nil {
		t.Fatal(err)
	}
	r := httptest.NewRequest("HEAD", "/dist/main.js?v=test", nil)
	r.Header.Set("Accept-Encoding", "gzip")
	w := httptest.NewRecorder()
	gzipped(webclient.Handler(dir)).ServeHTTP(w, r)
	if w.Code != 200 || w.Body.Len() != 0 {
		t.Fatalf("HEAD status=%d body bytes=%d", w.Code, w.Body.Len())
	}
	if w.Header().Get("Cache-Control") != "no-cache" {
		t.Fatalf("cache headers: %v", w.Header())
	}
}
