package webclient

import (
	"strconv"
	"strings"
)

// AcceptsGzip honors an explicit gzip exclusion over a wildcard. The embedded
// client and the streaming assets middleware share this negotiation so cached
// representations cannot bypass a browser's gzip;q=0 preference.
func AcceptsGzip(value string) bool {
	gzipQ, wildcardQ := -1.0, -1.0
	for _, item := range strings.Split(value, ",") {
		parts := strings.Split(item, ";")
		coding := strings.ToLower(strings.TrimSpace(parts[0]))
		if coding != "gzip" && coding != "*" {
			continue
		}
		q := 1.0
		for _, param := range parts[1:] {
			name, value, ok := strings.Cut(strings.TrimSpace(param), "=")
			if strings.EqualFold(name, "q") {
				parsed, err := strconv.ParseFloat(strings.TrimSpace(value), 64)
				if !ok || err != nil || !(parsed >= 0 && parsed <= 1) {
					q = 0
				} else {
					q = parsed
				}
			}
		}
		if coding == "gzip" {
			gzipQ = q
		} else {
			wildcardQ = q
		}
	}
	if gzipQ >= 0 {
		return gzipQ > 0
	}
	return wildcardQ > 0
}
