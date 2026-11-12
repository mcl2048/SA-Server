package main

import (
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"sa/server/webclient"
)

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
