package world

import (
	"context"
	"io"
	"log/slog"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"sa/server/internal/data"
	"sa/server/internal/store"
)

// Hold the real world's saver while all Flush fences are admitted. Do calls
// then race cancellation, and late calls exercise a world with no consumer.
// Compile time is outside these deadlines; each timer bounds a reached phase.
func TestWorldShutdownConcurrentFlushAndDo(t *testing.T) {
	const callers = 32
	db, err := store.OpenSQLite(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	w := New(&data.Game{}, db, slog.New(slog.NewTextHandler(io.Discard, nil)), 1)
	ctx, cancel := context.WithCancel(context.Background())
	runDone := make(chan struct{})
	go func() { w.Run(ctx); close(runDone) }()
	started, release := make(chan struct{}), make(chan struct{})
	var releaseOnce sync.Once
	releaseSaver := func() { releaseOnce.Do(func() { close(release) }) }
	t.Cleanup(func() {
		releaseSaver()
		cancel()
		select {
		case <-runDone:
		case <-time.After(3 * time.Second):
			t.Error("world did not drain during cleanup")
		}
		if err := db.Close(); err != nil {
			t.Error(err)
		}
	})
	w.Do(func() { w.saves <- func() { close(started); <-release } })
	select {
	case <-started:
	case <-time.After(2 * time.Second):
		t.Fatal("saver hold was not reached")
	}

	var wg sync.WaitGroup
	var flushReturned, doReturned atomic.Int32
	for i := 0; i < callers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if w.Flush(5 * time.Second) {
				flushReturned.Add(1)
			}
		}()
	}
	// The held saver has dequeued its blocking job, so these entries can only
	// be the accepted Flush fences. This seam prevents scheduling a late Flush
	// against an already closed baseline queue and hiding the Do timeout.
	deadline := time.Now().Add(2 * time.Second)
	for len(w.saves) < callers && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	if len(w.saves) < callers {
		t.Fatal("Flush fences were not admitted behind the held saver")
	}
	startCalls := make(chan struct{})
	for i := 0; i < callers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-startCalls
			w.Do(func() {})
			doReturned.Add(1)
		}()
	}
	close(startCalls)
	cancel()
	select {
	case <-w.stopping:
	case <-time.After(2 * time.Second):
		t.Fatal("world did not enter its cancellation fence")
	}
	releaseSaver()
	select {
	case <-runDone:
	case <-time.After(3 * time.Second):
		t.Fatal("world did not join its accepted writes")
	}
	t.Logf("SHUTDOWN_CONCURRENCY_REACHED: world stopped; Flush=%d/%d Do=%d/%d", flushReturned.Load(), callers, doReturned.Load(), callers)
	callsDone := make(chan struct{})
	go func() { wg.Wait(); close(callsDone) }()
	select {
	case <-callsDone:
	case <-time.After(2 * time.Second):
		t.Fatalf("Do/Flush remained blocked after the world stopped: Flush=%d/%d Do=%d/%d", flushReturned.Load(), callers, doReturned.Load(), callers)
	}
	if flushReturned.Load() != callers || doReturned.Load() != callers {
		t.Fatalf("accepted calls did not finish: Flush=%d/%d Do=%d/%d", flushReturned.Load(), callers, doReturned.Load(), callers)
	}

	// Even when every racing call happened to execute before cancellation,
	// this call has no remaining world consumer and must return on stopping.
	lateDone := make(chan struct{})
	go func() { w.Do(func() {}); close(lateDone) }()
	select {
	case <-lateDone:
	case <-time.After(time.Second):
		t.Fatal("late Do remained blocked on a world that had already stopped")
	}
	if !w.Flush(time.Second) {
		t.Fatal("joined character persistence did not satisfy late Flush")
	}
	select {
	case <-w.Families().saveDone:
	default:
		t.Fatal("standalone world left its owned family writer running")
	}
}
