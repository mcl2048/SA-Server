package world

import (
	"cmp"
	"fmt"
	"slices"
	"strings"

	"sa/server/internal/data"
	"sa/server/internal/proto"
)

// navigationComponents computes ordinary eight-way walking regions. Warp tiles
// can be corner supports but never interior nodes: entering one invokes its
// server action. A warp arrival can leave its tile without immediately bouncing.
// The grid and flood queue are transient; only portal endpoint IDs are cached.
func (w *World) navigationComponents(floor int) []int32 {
	f := w.game.Floors[floor]
	if f == nil {
		return nil
	}
	c := make([]int32, f.W*f.H)
	for y := 0; y < f.H; y++ {
		for x := 0; x < f.W; x++ {
			if w.game.Tiles.Walkable(f, x, y) {
				c[y*f.W+x] = -1
				if _, ok := w.game.WarpAt(floor, x, y); ok {
					c[y*f.W+x] = -2
				}
			}
		}
	}
	var id int32
	queue := []int{}
	for start, v := range c {
		if v != -1 {
			continue
		}
		id++
		c[start] = id
		queue = append(queue[:0], start)
		for i := 0; i < len(queue); i++ {
			k := queue[i]
			x, y := k%f.W, k/f.W
			for _, d := range MOVE {
				nx, ny := x+d[0], y+d[1]
				if !f.In(nx, ny) {
					continue
				}
				nk := ny*f.W + nx
				if c[nk] != -1 || d[0] != 0 && d[1] != 0 && (c[y*f.W+nx] == 0 || c[ny*f.W+x] == 0) {
					continue
				}
				c[nk] = id
				queue = append(queue, nk)
			}
		}
	}
	return c
}

func (w *World) navigationRegions(floor, x, y int) []int32 {
	f := w.game.Floors[floor]
	if f == nil || !f.In(x, y) {
		return nil
	}
	if endpoints, ok := w.navigationFloors[floor]; ok {
		return endpoints[[2]int{x, y}]
	}
	if w.navigationPoints == nil {
		w.navigationPoints = map[int]map[[2]int]bool{}
		add := func(fl, x, y int) {
			if w.navigationPoints[fl] == nil {
				w.navigationPoints[fl] = map[[2]int]bool{}
			}
			w.navigationPoints[fl][[2]int{x, y}] = true
		}
		for fl, warps := range w.game.Warps {
			for xy, wp := range warps {
				add(fl, xy[0], xy[1])
				add(wp.ToFloor, wp.ToX, wp.ToY)
			}
		}
	}
	c := w.navigationComponents(floor)
	endpoints := map[[2]int][]int32{}
	for xy := range w.navigationPoints[floor] {
		if f.In(xy[0], xy[1]) {
			endpoints[xy] = navigationPointRegions(f, c, xy[0], xy[1])
		}
	}
	if w.navigationFloors == nil {
		w.navigationFloors = map[int]map[[2]int][]int32{}
	}
	w.navigationFloors[floor] = endpoints
	return endpoints[[2]int{x, y}]
}

func navigationPointRegions(f *data.Floor, c []int32, x, y int) []int32 {
	v := c[y*f.W+x]
	if v > 0 {
		return []int32{v}
	}
	if v == 0 {
		return nil
	}
	out := []int32{}
	for _, d := range MOVE {
		nx, ny := x+d[0], y+d[1]
		if !f.In(nx, ny) {
			continue
		}
		if d[0] != 0 && d[1] != 0 && (c[y*f.W+nx] == 0 || c[ny*f.W+x] == 0) {
			continue
		}
		if n := c[ny*f.W+nx]; n > 0 && !slices.Contains(out, n) {
			out = append(out, n)
		}
	}
	slices.Sort(out)
	return out
}

func (w *World) safeNavigationWarp(wp data.Warp) bool {
	f, to := w.game.Floors[wp.Floor], w.game.Floors[wp.ToFloor]
	return wp.Free == "" && f != nil && to != nil && w.game.Tiles.Walkable(f, wp.X, wp.Y) && w.game.Tiles.Walkable(to, wp.ToX, wp.ToY)
}

// A bounded return passage joins two regions of the original floor through one
// neighbouring floor. Every leg is an effective unconditional native warp; the
// middle walk is proved connected without crossing any other warp. No global
// route search or remote live-NPC enumeration is performed on map reopen.
func (w *World) transfersForFloor(floor int) []proto.MapTransfer {
	if out, ok := w.mapTransferCache[floor]; ok {
		return out
	}
	out := mapTransfers(w.game, floor)
	for xy, first := range w.game.Warps[floor] {
		if first.ToFloor == floor || !w.safeNavigationWarp(first) {
			continue
		}
		// Many exits have no unconditional return passage. Reject those before
		// allocating either floor's transient component grid on the world loop.
		returns := []data.Warp{}
		for _, last := range w.game.Warps[first.ToFloor] {
			if last.ToFloor == floor && w.safeNavigationWarp(last) && (first.ToX != last.X || first.ToY != last.Y) {
				returns = append(returns, last)
			}
		}
		if len(returns) == 0 {
			continue
		}
		source := w.navigationRegions(floor, xy[0], xy[1])
		middle := w.navigationRegions(first.ToFloor, first.ToX, first.ToY)
		if len(source) == 0 || len(middle) == 0 {
			continue
		}
		best := map[string]proto.MapTransfer{}
		for _, last := range returns {
			entry := w.navigationRegions(first.ToFloor, last.X, last.Y)
			connected := false
			for _, id := range middle {
				if slices.Contains(entry, id) {
					connected = true
					break
				}
			}
			if !connected {
				continue
			}
			destination := w.navigationRegions(floor, last.ToX, last.ToY)
			different := false
			for _, a := range source {
				for _, b := range destination {
					if a != b {
						different = true
					}
				}
			}
			if !different {
				continue
			}
			edge := proto.MapTransfer{X: first.X, Y: first.Y, ToX: last.ToX, ToY: last.ToY, Via: []proto.MapTransferStep{
				{Floor: floor, X: first.X, Y: first.Y, ToFloor: first.ToFloor, ToX: first.ToX, ToY: first.ToY},
				{Floor: last.Floor, X: last.X, Y: last.Y, ToFloor: floor, ToX: last.ToX, ToY: last.ToY},
			}}
			key := fmt.Sprint(destination)
			// Return tiles in one walking region are interchangeable for reachability.
			// Keep the closest deterministic middle exit to avoid a quadratic payload.
			old, exists := best[key]
			distance := max(abs(last.X-first.ToX), abs(last.Y-first.ToY))
			oldDistance := 0
			if exists {
				p := old.Via[1]
				oldDistance = max(abs(p.X-first.ToX), abs(p.Y-first.ToY))
			}
			if !exists || distance < oldDistance || distance == oldDistance && (last.Y < old.Via[1].Y || last.Y == old.Via[1].Y && last.X < old.Via[1].X) {
				best[key] = edge
			}
		}
		for _, edge := range best {
			out = append(out, edge)
		}
	}
	slices.SortFunc(out, func(a, b proto.MapTransfer) int {
		for _, pair := range [][2]int{{a.Y, b.Y}, {a.X, b.X}, {a.ToY, b.ToY}, {a.ToX, b.ToX}} {
			if c := cmp.Compare(pair[0], pair[1]); c != 0 {
				return c
			}
		}
		return strings.Compare(fmt.Sprint(a.Via), fmt.Sprint(b.Via))
	})
	if w.mapTransferCache == nil {
		w.mapTransferCache = map[int][]proto.MapTransfer{}
	}
	w.mapTransferCache[floor] = out
	return out
}
