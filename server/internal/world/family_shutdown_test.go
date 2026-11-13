package world

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"sa/server/internal/data"
	"sa/server/internal/store"
)

type blockedFamilyStore struct {
	store.Store
	started chan struct{}
	release chan struct{}
	once    sync.Once
}

func (s *blockedFamilyStore) SaveFamily(ctx context.Context, id int, data string) error {
	s.once.Do(func() { close(s.started) })
	select {
	case <-s.release:
	case <-ctx.Done():
		return ctx.Err()
	}
	return s.Store.SaveFamily(ctx, id, data)
}

func testFamilyCloser(t *testing.T, f *Families) func() {
	t.Helper()
	closer, ok := any(f).(interface{ Close() })
	if !ok {
		close(f.saves) // The old worker has no pending jobs at this point.
		t.Fatal("family queue has no drain/join lifecycle")
	}
	t.Cleanup(closer.Close)
	return closer.Close
}

func shutdownFamilySnapshot(id int, name string, gold int) *family {
	fm := &family{ID: id, Name: name, Gold: gold}
	fm.Members[0] = &fmMember{ID: int64(id), Name: "test-leader", Level: 30, Duty: fmDutyLeader}
	return fm
}

func TestFamiliesCloseDrainsSnapshotsAndKV(t *testing.T) {
	db, err := store.OpenSQLite(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := db.Close(); err != nil {
			t.Error(err)
		}
	})
	blocked := &blockedFamilyStore{Store: db, started: make(chan struct{}), release: make(chan struct{})}
	f := NewFamilies(blocked, slog.New(slog.NewTextHandler(io.Discard, nil)))
	closeQueue := testFamilyCloser(t, f)
	var releaseOnce sync.Once
	release := func() { releaseOnce.Do(func() { close(blocked.release) }) }
	t.Cleanup(release)
	f.mu.Lock()
	f.save(shutdownFamilySnapshot(1, "first", 0))
	f.save(shutdownFamilySnapshot(1, "final", 12345))
	f.save(shutdownFamilySnapshot(2, "removed", 0))
	f.remove(&family{ID: 2})
	f.saveKV("fmsmemo", []string{"preserved"})
	f.mu.Unlock()
	select {
	case <-blocked.started:
	case <-time.After(time.Second):
		t.Fatal("family writer did not begin its first accepted save")
	}
	done := make(chan struct{})
	go func() { closeQueue(); close(done) }()
	select {
	case <-done:
		t.Fatal("family Close returned while an accepted save was blocked")
	case <-time.After(20 * time.Millisecond):
	}
	release()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("family Close did not join its completed writer")
	}
	rows, err := db.LoadFamilies(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	var saved family
	if err := json.Unmarshal([]byte(rows[1]), &saved); err != nil || len(rows) != 1 || saved.Name != "final" || saved.Gold != 12345 {
		t.Fatalf("accepted family saves/remove lost their final order: rows=%v value=%+v err=%v", rows, saved, err)
	}
	if value, err := db.GetKV(context.Background(), "fmsmemo"); err != nil || value != `["preserved"]` {
		t.Fatalf("accepted family KV update was not drained: %q %v", value, err)
	}
}

func TestFamiliesConcurrentCloseAndSubmission(t *testing.T) {
	db, err := store.OpenSQLite(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := db.Close(); err != nil {
			t.Error(err)
		}
	})
	f := NewFamilies(db, slog.New(slog.NewTextHandler(io.Discard, nil)))
	closeQueue := testFamilyCloser(t, f)
	f.mu.Lock()
	f.save(shutdownFamilySnapshot(99, "accepted-before-close", 77))
	f.mu.Unlock()
	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := 0; i < 32; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			f.mu.Lock()
			f.save(shutdownFamilySnapshot(i+1, "racing-final-save", 0))
			f.mu.Unlock()
		}(i)
	}
	for i := 0; i < 4; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); <-start; closeQueue() }()
	}
	close(start)
	wg.Wait()
	// Repeated Close and a late producer must be safe, and must not restart a
	// writer against a database that its owner is now free to close.
	closeQueue()
	f.mu.Lock()
	f.save(shutdownFamilySnapshot(1000, "too-late", 0))
	f.mu.Unlock()
	rows, err := db.LoadFamilies(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	var before family
	if err := json.Unmarshal([]byte(rows[99]), &before); err != nil || before.Name != "accepted-before-close" || before.Gold != 77 {
		t.Fatalf("save accepted before concurrent Close was lost: %v %v", rows[99], err)
	}
	if _, ok := rows[1000]; ok {
		t.Fatal("a late producer restarted a stopped family queue")
	}
}

type countedFamilyReads struct {
	store.Store
	reads atomic.Int64
}

func (s *countedFamilyReads) LoadFamilies(ctx context.Context) (map[int]string, error) {
	s.reads.Add(1)
	return s.Store.LoadFamilies(ctx) // Instrument the real SQLite operation.
}

func runFamilyWorld(t *testing.T, w *World) func() {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { w.Run(ctx); close(done) }()
	stop := func() {
		cancel()
		select {
		case <-done:
		case <-time.After(3 * time.Second):
			t.Error("world failed to stop and drain its owned persistence")
		}
	}
	t.Cleanup(stop)
	return stop
}

func TestSharedFamiliesSurviveIndividualWorldShutdown(t *testing.T) {
	db, err := store.OpenSQLite(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := db.Close(); err != nil {
			t.Error(err)
		}
	})
	counted := &countedFamilyReads{Store: db}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	shared := NewFamilies(counted, log)
	t.Cleanup(shared.Close)
	var worlds []*World
	var stops []func()
	for i := 0; i < 3; i++ {
		w := New(&data.Game{}, counted, log, int64(i+1), shared)
		w.ShareFamilies(shared)
		worlds = append(worlds, w)
		stops = append(stops, runFamilyWorld(t, w))
	}
	if counted.reads.Load() != 1 || worlds[1].Families() != shared || worlds[2].Families() != shared {
		t.Fatalf("shared worlds must reuse the real loaded manager: reads=%d", counted.reads.Load())
	}
	stops[0]()
	shared.mu.Lock()
	shared.save(shutdownFamilySnapshot(71, "after-first-world", 333))
	shared.mu.Unlock()
	stops[1]()
	shared.mu.Lock()
	shared.save(shutdownFamilySnapshot(72, "after-second-world", 444))
	shared.mu.Unlock()
	stops[2]()
	shared.Close()
	rows, err := db.LoadFamilies(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	for id, gold := range map[int]int{71: 333, 72: 444} {
		var saved family
		if err := json.Unmarshal([]byte(rows[id]), &saved); err != nil || saved.Gold != gold {
			t.Errorf("an individual world stopped shared persistence: id=%d value=%q err=%v", id, rows[id], err)
		}
	}
}

func TestOwnedFamiliesJoinAndReplacement(t *testing.T) {
	db, err := store.OpenSQLite(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := db.Close(); err != nil {
			t.Error(err)
		}
	})
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	w := New(&data.Game{}, db, log, 1)
	owned := w.Families()
	owned.mu.Lock()
	owned.save(shutdownFamilySnapshot(91, "owned-final", 99))
	owned.mu.Unlock()
	runFamilyWorld(t, w)()
	select {
	case <-owned.saveDone:
	default:
		t.Fatal("a standalone world left its family writer running")
	}

	replacementWorld := New(&data.Game{}, db, log, 2)
	old := replacementWorld.Families()
	old.mu.Lock()
	old.save(shutdownFamilySnapshot(92, "before-replacement", 222))
	old.mu.Unlock()
	shared := NewFamilies(db, log)
	t.Cleanup(shared.Close)
	replacementWorld.ShareFamilies(shared)
	select {
	case <-old.saveDone:
	default:
		t.Fatal("replacing an owned manager left its old writer running")
	}
	runFamilyWorld(t, replacementWorld)()
	shared.mu.Lock()
	shared.save(shutdownFamilySnapshot(93, "shared-owner-final", 333))
	shared.mu.Unlock()
	shared.Close()
	rows, err := db.LoadFamilies(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	for id, gold := range map[int]int{91: 99, 92: 222, 93: 333} {
		var saved family
		if err := json.Unmarshal([]byte(rows[id]), &saved); err != nil || saved.Gold != gold {
			t.Errorf("owned/replaced/shared final snapshot was lost: id=%d value=%q err=%v", id, rows[id], err)
		}
	}
}
