package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestClientSelectionBeforePathNormalization(t *testing.T) {
	for _, tc := range []struct{ name, base, local, want string }{
		{"omitted", "", "", ""},
		{"legacy default", "client: client\n", "", ""},
		{"explicit embedded", "client: embedded\n", "", ""},
		{"external default directory", "client: ./client\n", "", "client"},
		{"custom external", "client: published\n", "", "published"},
		{"local override", "client: client\n", "client: ./client\n", "client"},
		{"local embedded", "client: published\n", "client: embedded\n", ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir()
			t.Chdir(dir)
			if err := os.WriteFile("config.yaml", []byte(tc.base), 0600); err != nil {
				t.Fatal(err)
			}
			if tc.local != "" {
				if err := os.WriteFile("config.local.yaml", []byte(tc.local), 0600); err != nil {
					t.Fatal(err)
				}
			}
			cfg, _, err := loadConfig()
			if err != nil {
				t.Fatal(err)
			}
			want := tc.want
			if want != "" {
				want = filepath.Join(dir, want)
			}
			if cfg.Client != want {
				t.Fatalf("client = %q, want %q", cfg.Client, want)
			}
		})
	}
}
