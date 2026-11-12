package webclient

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
)

func TestBuiltRoutes(t *testing.T) {
	h := handler(fstest.MapFS{
		"index.html":       {Data: []byte("<!doctype html>release")},
		"dist/main.js":     {Data: []byte("console.log('release');")},
		"src/private.ts":   {Data: []byte("secret")},
		"dist/private.map": {Data: []byte("secret")},
	})
	for _, tc := range []struct {
		method, path string
		code         int
		mime, cache  string
	}{
		{"GET", "/", 200, "text/html", "no-store"},
		{"GET", "/index.html", 200, "text/html", "no-store"},
		{"GET", "/dist/main.js?v=release", 200, "text/javascript", "no-cache"},
		{"HEAD", "/dist/main.js", 200, "text/javascript", "no-cache"},
		{"GET", "/src/private.ts", 404, "", ""},
		{"GET", "/dist/private.map", 404, "", ""},
		{"GET", "/dist/../index.html", 404, "", ""},
		{"GET", "/dist/%2e%2e/index.html", 404, "", ""},
		{"GET", "/dist/.private.js", 404, "", ""},
		{"GET", "/dist/", 404, "", ""},
		{"GET", "/config.yaml", 404, "", ""},
		{"GET", "/dist/missing.js", 404, "", ""},
		{"POST", "/", 405, "", ""},
	} {
		t.Run(tc.method+tc.path, func(t *testing.T) {
			w := httptest.NewRecorder()
			h.ServeHTTP(w, httptest.NewRequest(tc.method, tc.path, nil))
			if w.Code != tc.code {
				t.Fatalf("status = %d, want %d", w.Code, tc.code)
			}
			if tc.mime != "" && !strings.HasPrefix(w.Header().Get("Content-Type"), tc.mime) {
				t.Fatalf("MIME: %v", w.Header())
			}
			if tc.cache != "" && w.Header().Get("Cache-Control") != tc.cache {
				t.Fatalf("cache: %v", w.Header())
			}
			if tc.method == "HEAD" && w.Body.Len() != 0 {
				t.Fatal("HEAD returned body")
			}
			if w.Header().Get("X-Content-Type-Options") != "nosniff" {
				t.Fatal("missing nosniff")
			}
		})
	}
}

func TestMissingBuildAndExplicitExternal(t *testing.T) {
	w := httptest.NewRecorder()
	handler(fstest.MapFS{}).ServeHTTP(w, httptest.NewRequest("GET", "/", nil))
	if w.Code != http.StatusServiceUnavailable || !strings.Contains(w.Body.String(), "build-linux.sh") {
		t.Fatalf("unbuilt client: %d %s", w.Code, w.Body)
	}
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("external release"), 0600); err != nil {
		t.Fatal(err)
	}
	w = httptest.NewRecorder()
	Handler(dir).ServeHTTP(w, httptest.NewRequest("GET", "/", nil))
	if w.Code != 200 || w.Body.String() != "external release" {
		t.Fatalf("external override: %d %s", w.Code, w.Body)
	}
}
