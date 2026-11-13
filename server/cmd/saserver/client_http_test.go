package main

import (
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"sa/server/webclient"
)

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
