package main

import (
	"net/http"
	"os"
	"path/filepath"
	"testing"
)

type trackedFile struct {
	http.File
	closed bool
}

func (f *trackedFile) Close() error { f.closed = true; return f.File.Close() }

type trackedFS struct {
	http.FileSystem
	probes []*trackedFile
}

func (fs *trackedFS) Open(name string) (http.File, error) {
	f, err := fs.FileSystem.Open(name)
	if err != nil {
		return nil, err
	}
	tracked := &trackedFile{File: f}
	fs.probes = append(fs.probes, tracked)
	return tracked, nil
}

// A busy assets server must not exhaust descriptors by probing directory indexes.
func TestNoListingClosesIndexProbe(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("ok"), 0600); err != nil {
		t.Fatal(err)
	}
	fs := &trackedFS{FileSystem: http.Dir(dir)}
	f, err := (noListing{fs}).Open("/")
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if len(fs.probes) != 2 || !fs.probes[1].closed || fs.probes[0].closed {
		t.Fatal("index probe must close while directory stays readable")
	}
}
