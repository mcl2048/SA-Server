package main

import (
	"compress/gzip"
	"io"
	"net/http"
	"path"
	"strings"
	"sync"

	"sa/server/webclient"
)

// gzipTypes 是值得压缩的静态文件（文字类）。图集 WebP、音频 Opus、index.bin.gz 本来就是压缩过的，不再压。
var gzipTypes = map[string]bool{".js": true, ".json": true, ".html": true, ".css": true, ".txt": true, ".sab": true, ".mjs": true, ".map": true}

var gzipPool = sync.Pool{New: func() any { w, _ := gzip.NewWriterLevel(nil, gzip.BestSpeed); return w }}

// acceptsGzip honors an explicit gzip exclusion over a wildcard. Coding names
// and q parameter names are case-insensitive; malformed qualities are rejected.
func acceptsGzip(value string) bool {
	return webclient.AcceptsGzip(value)
}

// gzipped 把文字类的静态文件按请求的 Accept-Encoding 用 gzip 送出（客户端脚本与 tiles.json 等约 1 MB → 290 KB）。
// 为了简单不处理 Range 请求：要压缩的文件把 Range 拿掉，整个送。
func gzipped(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !gzipTypes[strings.ToLower(path.Ext(r.URL.Path))] {
			next.ServeHTTP(w, r)
			return
		}
		// Include Vary for identity, gzip, HEAD and 304 alike: a shared cache
		// must never reuse the identity response for a gzip-only request.
		w.Header().Add("Vary", "Accept-Encoding")
		if !acceptsGzip(strings.Join(r.Header.Values("Accept-Encoding"), ",")) {
			next.ServeHTTP(w, r)
			return
		}
		r.Header.Del("Range")
		z := &gzipWriter{ResponseWriter: w, head: r.Method == http.MethodHead}
		completed := false
		// Allocate the pooled compressor on the first unencoded body write.
		// Embedded programs are precompressed; HEAD/304/404 need no writer.
		defer func() {
			if z.on && !z.head && z.gz == nil {
				// A successful empty body still advertised gzip. Complete a
				// valid empty stream instead of returning a decoding-error EOF.
				z.gz = gzipPool.Get().(*gzip.Writer)
				z.gz.Reset(z.ResponseWriter)
			}
			if z.gz != nil {
				closeErr := z.gz.Close()
				z.gz.Reset(io.Discard) // Do not retain a completed HTTP connection.
				gzipPool.Put(z.gz)
				if closeErr != nil && completed {
					// The status/body may already be on the wire. net/http's
					// documented abort sentinel closes the incomplete response
					// without logging a panic stack or pretending a valid EOF.
					panic(http.ErrAbortHandler)
				}
				// If next already panicked, its original failure must propagate;
				// a late transport error must not replace it during cleanup.
			}
		}()
		next.ServeHTTP(z, r)
		completed = true
	})
}

// gzipWriter 在第一次写出时决定要不要压：只有 200 的回应压（304 / 404 照原样），并去掉 Content-Length。
type gzipWriter struct {
	http.ResponseWriter
	gz      *gzip.Writer
	on      bool
	head    bool
	started bool
}

func (z *gzipWriter) WriteHeader(code int) {
	if !z.started {
		z.started = true
		h := z.Header()
		if code == http.StatusOK && h.Get("Content-Encoding") == "" {
			z.on = true
			h.Set("Content-Encoding", "gzip")
			h.Del("Content-Length")
		}
	}
	z.ResponseWriter.WriteHeader(code)
}

func (z *gzipWriter) Write(b []byte) (int, error) {
	if !z.started {
		z.WriteHeader(http.StatusOK)
	}
	if z.head {
		return len(b), nil
	}
	if z.on {
		if z.gz == nil {
			z.gz = gzipPool.Get().(*gzip.Writer)
			z.gz.Reset(z.ResponseWriter)
		}
		return z.gz.Write(b)
	}
	return z.ResponseWriter.Write(b)
}
