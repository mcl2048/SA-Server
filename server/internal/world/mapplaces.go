package world

import (
	"cmp"
	"slices"
	"strings"

	"sa/server/internal/data"
	"sa/server/internal/proto"
)

// Only deterministic, effective same-floor warps can join navigation regions.
// Conditional FREEMORE fallbacks and cross-floor travel stay server-owned and
// must never become automatic shortcuts in an otherwise local route.
func mapTransfers(g *data.Game, floor int) []proto.MapTransfer {
	f := g.Floors[floor]
	if f == nil {
		return nil
	}
	out := []proto.MapTransfer{}
	for xy, wp := range g.Warps[floor] {
		if wp.Free != "" || wp.ToFloor != floor || xy == [2]int{wp.ToX, wp.ToY} ||
			!g.Tiles.Walkable(f, xy[0], xy[1]) || !g.Tiles.Walkable(f, wp.ToX, wp.ToY) {
			continue
		}
		out = append(out, proto.MapTransfer{X: xy[0], Y: xy[1], ToX: wp.ToX, ToY: wp.ToY})
	}
	slices.SortFunc(out, func(a, b proto.MapTransfer) int {
		if c := cmp.Compare(a.Y, b.Y); c != 0 {
			return c
		}
		return cmp.Compare(a.X, b.X)
	})
	return out
}

// mapPlaces uses the effective warp table after mapwarp/NPC overrides. Adjacent
// tiles leading to the same floor form one doorway; all tiles remain available
// to the client so it can route to a reachable edge rather than an interior
// warp. Distant entrances remain distinct, even if their destination is equal.
// Conditions stay server-authoritative: displaying an entry never unlocks it.
func mapPlaces(g *data.Game, floor int) []proto.MapPlace {
	f := g.Floors[floor]
	if f == nil {
		return nil
	}
	// A FREEMORE warp's fallback points at itself. Its actual destinations live
	// in conditional FREE/TO branches, and one source may lead to several floors.
	// Group per destination, not solely per source coordinate, to retain all of
	// those choices. The server still chooses the branch when the tile is entered.
	destinations := map[int]map[[2]int]bool{}
	for xy, wp := range g.Warps[floor] {
		if !g.Tiles.Walkable(f, xy[0], xy[1]) {
			continue
		}
		add := func(to [3]int) {
			if target := g.Floors[to[0]]; target == nil || to[0] == floor || !target.In(to[1], to[2]) {
				return
			}
			if destinations[to[0]] == nil {
				destinations[to[0]] = map[[2]int]bool{}
			}
			destinations[to[0]][xy] = wp.Free != ""
		}
		add([3]int{wp.ToFloor, wp.ToX, wp.ToY})
		if wp.Free != "" {
			for _, segment := range strings.Split(wp.Free, "OVER") {
				if _, ok := data.ArgField(segment, "FREE"); !ok {
					continue
				}
				for _, point := range data.FreeWarpPoints(segment) {
					add(point)
				}
			}
		}
	}
	out := []proto.MapPlace{}
	for target, pending := range destinations {
		for xy := range pending {
			delete(pending, xy)
			place := proto.MapPlace{Name: g.Floors[target].Name, Floor: target}
			queue := [][2]int{xy}
			for i := 0; i < len(queue); i++ {
				p := queue[i]
				place.Entrances = append(place.Entrances, proto.MapPoint{X: p[0], Y: p[1]})
				if g.Warps[floor][p].Free != "" {
					place.Conditional = true
				}
				for _, d := range MOVE {
					next := [2]int{p[0] + d[0], p[1] + d[1]}
					if _, ok := pending[next]; ok {
						delete(pending, next)
						queue = append(queue, next)
					}
				}
			}
			slices.SortFunc(place.Entrances, func(a, b proto.MapPoint) int {
				if c := cmp.Compare(a.Y, b.Y); c != 0 {
					return c
				}
				return cmp.Compare(a.X, b.X)
			})
			out = append(out, place)
		}
	}
	slices.SortFunc(out, func(a, b proto.MapPlace) int {
		if c := cmp.Compare(a.Name, b.Name); c != 0 {
			return c
		}
		if c := cmp.Compare(a.Floor, b.Floor); c != 0 {
			return c
		}
		if c := cmp.Compare(a.Entrances[0].Y, b.Entrances[0].Y); c != 0 {
			return c
		}
		return cmp.Compare(a.Entrances[0].X, b.Entrances[0].X)
	})
	return out
}

// placesForFloor lazily reuses only the static resource projection. Game floors,
// tile rules and effective warps are immutable after data.Load; a new process /
// World owns a fresh cache on resource reload. Never cache the whole NpcList:
// live buses, NPC coordinates and time-based visibility are world state.
// The world loop owns both cache reads and writes; no shared Game mutation or
// cross-line lock is introduced. Empty catalogues are cached as well.
func (w *World) placesForFloor(floor int) []proto.MapPlace {
	if places, ok := w.mapPlaceCache[floor]; ok {
		return places
	}
	places := mapPlaces(w.game, floor)
	if w.mapPlaceCache == nil {
		w.mapPlaceCache = map[int][]proto.MapPlace{}
	}
	w.mapPlaceCache[floor] = places
	return places
}
