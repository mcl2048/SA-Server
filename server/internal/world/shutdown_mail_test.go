package world

import (
	"context"
	"io"
	"log/slog"
	"path/filepath"
	"testing"
	"time"

	"sa/server/internal/store"
)

type heldMailStore struct {
	store.Store
	taken   chan struct{}
	release chan struct{}
}

func (s *heldMailStore) TakeMails(ctx context.Context, id int64) ([]string, error) {
	list, err := s.Store.TakeMails(ctx, id)
	close(s.taken)
	<-s.release
	return list, err
}

// Hold the real SQLite dequeue precisely between the transaction and its world
// callback. Cancelling here must restore the original letter before Run returns,
// rather than strand a callback behind the stopped world's command channel.
func TestShutdownRestoresDequeuedMail(t *testing.T) {
	_, _, game := setup(t)
	db, err := store.OpenSQLite(filepath.Join(t.TempDir(), "shutdown-mail.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := db.Close(); err != nil {
			t.Error(err)
		}
	}()
	c := newChar(t, db, "shutdown-mail", 1000, 47, 82)
	const letter = `{"from":900,"name":"sender","date":"11/13","text":"retain this letter"}`
	if err := db.PutMail(context.Background(), c.ID, letter); err != nil {
		t.Fatal(err)
	}
	held := &heldMailStore{Store: db, taken: make(chan struct{}), release: make(chan struct{})}
	w := New(game, held, slog.New(slog.NewTextHandler(io.Discard, nil)), 1)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	runDone := make(chan struct{})
	go func() { w.Run(ctx); close(runDone) }()
	w.Enter(c, &fakeClient{})
	select {
	case <-held.taken:
	case <-time.After(3 * time.Second):
		t.Fatal("real mailbox transaction did not execute")
	}
	w.Do(cancel)
	deadline := time.Now().Add(3 * time.Second)
	for len(w.saves) == 0 && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	if len(w.saves) == 0 {
		close(held.release)
		t.Fatal("shutdown did not enqueue its save fence")
	}
	close(held.release)
	select {
	case <-runDone:
	case <-time.After(5 * time.Second):
		t.Fatal("shutdown did not finish after releasing SQLite")
	}
	letters, err := db.TakeMails(context.Background(), c.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(letters) != 1 || letters[0] != letter {
		t.Fatalf("shutdown must retain its dequeued letter: %q", letters)
	}
}
