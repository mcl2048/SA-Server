package world

import (
	"sa/server/internal/data"
	"sa/server/internal/proto"
	"testing"
)

func TestBackgroundViewSkipsDiffsAndRebuildsOnAttach(t *testing.T) {
	w, db, _ := setup(t)
	h := data.Hometowns[0]
	ca := newChar(t, db, "viewidle", h.Floor, h.X, h.Y)
	cb := newChar(t, db, "viewlive", h.Floor, h.X, h.Y)
	a, b := &fakeClient{}, &fakeClient{}
	w.Enter(ca, a)
	w.Enter(cb, b)
	w.Detach(int(ca.ID), a)
	a.take()
	b.take()
	w.Do(func() {
		idle, live := w.players[int(ca.ID)], w.players[int(cb.ID)]
		w.refreshView(idle)
		w.broadcastMove(live)
		w.announce(live)
	})
	if len(a.take()) != 0 {
		t.Fatal("background actor received unnecessary view diffs")
	}
	fresh := &fakeClient{}
	if !w.Attach(int(ca.ID), a, fresh) {
		t.Fatal("reattach failed")
	}
	appeared, ok := find[*proto.ObjAppear](fresh.take())
	if !ok {
		t.Fatal("reattach did not rebuild view")
	}
	found := false
	for _, obj := range appeared.Objs {
		if obj.ID == int(cb.ID) {
			found = true
		}
	}
	if !found {
		t.Fatal("nearby live player missing after resume")
	}
}

// Model a crowded floor without loading artwork or running a server. Benchmark
// both consumers so offline optimization remains measurable with -benchmem.
func BenchmarkRefreshViewConsumer(b *testing.B) {
	for _, connected := range []bool{true, false} {
		name := "detached"
		if connected {
			name = "attached"
		}
		b.Run(name, func(b *testing.B) {
			client := &fakeClient{}
			e := &entity{id: 1, kind: "player", connected: connected, client: client, floor: 1, visible: map[int]bool{}}
			w := &World{floors: map[int]map[int]*entity{1: {1: e}}}
			for i := 2; i <= 1001; i++ {
				w.floors[1][i] = &entity{id: i, floor: 1, x: i % 100, y: i / 100}
				e.visible[i] = true
			}
			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				w.refreshView(e)
				client.take()
			}
		})
	}
}
