package world

import (
	"fmt"
	"testing"
)

// The sink deliberately discards messages, isolating world fanout allocations
// from JSON encoding and socket buffering. Visibility starts fully populated,
// so this measures steady movement, not a login/appear burst.
func BenchmarkBroadcastMoveFanout(b *testing.B) {
	for _, count := range []int{100, 1000, 5000} {
		b.Run(fmt.Sprint(count), func(b *testing.B) {
			mover := &entity{id: 1, kind: "player", floor: 1, client: nopClient{}, connected: true, visible: map[int]bool{}}
			floor := map[int]*entity{1: mover}
			for id := 2; id <= count+1; id++ {
				floor[id] = &entity{id: id, kind: "player", floor: 1, client: nopClient{}, connected: true, visible: map[int]bool{1: true}}
				mover.visible[id] = true
			}
			w := &World{floors: map[int]map[int]*entity{1: floor}}
			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				w.broadcastMove(mover)
			}
		})
	}
}
