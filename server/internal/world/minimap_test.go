package world

import (
	"sa/server/internal/data"
	"sa/server/internal/proto"
	"testing"
	"time"
)

func TestMinimapAuthorityRejectsDiagonalCorner(t *testing.T) {
	for _, blocked := range []int{1, 3, 4} {
		f := &data.Floor{ID: 1, W: 3, H: 3, Tiles: []uint16{1, 1, 1, 1, 1, 1, 1, 1, 1}, Objs: make([]uint16, 9)}
		// Start (0,0), target (1,1), either side or target is blocked.
		f.Tiles[blocked] = 2
		w := &World{game: &data.Game{Floors: map[int]*data.Floor{1: f}, Tiles: data.TileSet{0: {Walkable: 1}, 1: {Walkable: 1}, 2: {Walkable: 0}}}, now: time.Now}
		cl := &fakeClient{}
		e := &entity{floor: 1, x: 0, y: 0, client: cl, stepTokens: 3}
		if w.automationStepAllowed(e, 6) {
			t.Fatal("background automation must respect the same wall corner")
		}
		w.move(e, 0, 0, 6)
		if e.x != 0 || e.y != 0 {
			t.Fatal("crossed obstacle")
		}
		if _, ok := find[*proto.PosCorrect](cl.take()); !ok {
			t.Fatal("missing authority correction")
		}
	}
}

func TestMinimapVersionIncludesDimensions(t *testing.T) {
	f := &data.Floor{ID: 1, W: 2, H: 3, Tiles: make([]uint16, 6), Objs: make([]uint16, 6)}
	w := &World{game: &data.Game{Floors: map[int]*data.Floor{1: f}}}
	before := w.floorVer(1)
	f.W, f.H = 3, 2
	w.floorVers = nil
	if w.floorVer(1) == before {
		t.Fatal("different dimensions must invalidate cached path grid")
	}
}
