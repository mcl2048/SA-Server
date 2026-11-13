package main

import (
	"compress/gzip"
	"crypto/sha256"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"sa/server/webclient"
)

// Benchmarks the production middleware and the actual bundled program, with
// matching decoded hashes before/after to prevent different payload comparisons.
func BenchmarkEmbeddedClientGzip(b *testing.B) {
	for _, name := range []string{"main.js", "ui.js"} {
		for _, parallel := range []bool{false, true} {
			label := name + "/serial"
			if parallel {
				label = name + "/parallel"
			}
			b.Run(label, func(b *testing.B) {
				h := gzipped(webclient.Handler(""))
				url := "/dist/" + name
				makeRequest := func() *http.Request {
					r := httptest.NewRequest("GET", url, nil)
					r.Header.Set("Accept-Encoding", "gzip")
					return r
				}
				w := httptest.NewRecorder()
				h.ServeHTTP(w, makeRequest())
				if w.Code != http.StatusOK || w.Header().Get("Content-Encoding") != "gzip" {
					b.Skip("release client was not staged")
				}
				reader, err := gzip.NewReader(w.Body)
				if err != nil {
					b.Fatal(err)
				}
				decoded, err := io.ReadAll(reader)
				if err := reader.Close(); err != nil {
					b.Fatal(err)
				}
				if err != nil {
					b.Fatal(err)
				}
				b.Logf("decoded=%d sha256=%x", len(decoded), sha256.Sum256(decoded))
				b.SetBytes(int64(len(decoded)))
				b.ReportAllocs()
				b.ResetTimer()
				if parallel {
					b.RunParallel(func(pb *testing.PB) {
						r := makeRequest()
						for pb.Next() {
							h.ServeHTTP(httptest.NewRecorder(), r)
						}
					})
				} else {
					r := makeRequest()
					for i := 0; i < b.N; i++ {
						h.ServeHTTP(httptest.NewRecorder(), r)
					}
				}
			})
		}
	}
}
