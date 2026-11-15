package world

import (
	"encoding/json"
	"strings"
	"testing"

	"sa/server/internal/data"
	"sa/server/internal/proto"
)

// Check the public response against the loaded game's effective warp table,
// including NPC-created and overwritten points, rather than a copied catalogue.
func TestNpcListIncludesAllPlayableWarpEntrances(t *testing.T) {
	w, db, g := setup(t)
	h := data.Hometowns[0]
	p := newChar(t, db, "mapplaces", h.Floor, h.X, h.Y)
	cl := &fakeClient{}
	w.Enter(p, cl)
	cl.take()
	total, places, floors := 0, 0, 0
	for floor, warps := range g.Warps {
		expected := map[[3]int]data.Warp{}
		f := g.Floors[floor]
		if f == nil {
			continue
		}
		for xy, wp := range warps {
			if !g.Tiles.Walkable(f, xy[0], xy[1]) {
				continue
			}
			add := func(to [3]int) {
				if target := g.Floors[to[0]]; target != nil && to[0] != floor && target.In(to[1], to[2]) {
					expected[[3]int{to[0], xy[0], xy[1]}] = wp
				}
			}
			add([3]int{wp.ToFloor, wp.ToX, wp.ToY})
			if wp.Free != "" {
				for _, segment := range strings.Split(wp.Free, "OVER") {
					if _, ok := data.ArgField(segment, "FREE"); ok {
						for _, to := range data.FreeWarpPoints(segment) {
							add(to)
						}
					}
				}
			}
		}
		if len(expected) == 0 {
			continue
		}
		w.NpcList(int(p.ID), floor)
		msg, ok := find[*proto.NpcList](cl.take())
		if !ok {
			t.Fatalf("no NpcList for %d", floor)
		}
		raw, err := json.Marshal(msg)
		if err != nil {
			t.Fatal(err)
		}
		var response struct {
			Places []struct {
				Name        string
				Floor       int
				Conditional bool
				Entrances   []struct{ X, Y int }
			}
		}
		if err := json.Unmarshal(raw, &response); err != nil {
			t.Fatal(err)
		}
		seen := map[[3]int]bool{}
		for _, place := range response.Places {
			if g.Floors[place.Floor] == nil || place.Name != g.Floors[place.Floor].Name {
				t.Fatalf("wrong floor name: %s", raw)
			}
			for _, entry := range place.Entrances {
				xy := [3]int{place.Floor, entry.X, entry.Y}
				wp, ok := expected[xy]
				if !ok || seen[xy] {
					t.Fatalf("unexpected/duplicate entry on %d: %s", floor, raw)
				}
				if wp.Free != "" && !place.Conditional {
					t.Fatalf("conditional warp presented as unconditional: %s", raw)
				}
				seen[xy] = true
			}
		}
		if len(seen) != len(expected) {
			t.Fatalf("floor %d: got %d entries, expected %d (catalogue must cover effective walkable warps)", floor, len(seen), len(expected))
		}
		total += len(seen)
		places += len(response.Places)
		floors++
	}
	t.Logf("catalogue coverage: %d entrances in %d places across %d floors", total, places, floors)
}

func TestMapPlacesGroupsOnlyAdjacentEntriesWithSameDestination(t *testing.T) {
	f := &data.Floor{ID: 1, Name: "World", W: 8, H: 4, Tiles: make([]uint16, 32), Objs: make([]uint16, 32)}
	for i := range f.Tiles {
		f.Tiles[i] = 100
	}
	f.Tiles[24] = 0
	g := &data.Game{Floors: map[int]*data.Floor{1: f, 2: {ID: 2, Name: "Village", W: 10, H: 10}, 3: {ID: 3, Name: "Cave", W: 10, H: 10}}, Tiles: data.TileSet{0: {Walkable: 1}, 100: {Walkable: 1}}, Warps: map[int]map[[2]int]data.Warp{1: {
		{1, 1}: {ToFloor: 2}, {1, 2}: {ToFloor: 2, Free: "LV>10"}, {7, 3}: {ToFloor: 2}, {2, 1}: {ToFloor: 3}, {4, 0}: {ToFloor: 1}, {0, 3}: {ToFloor: 2}, {10, 10}: {ToFloor: 2}, {5, 0}: {ToFloor: 999},
	}}}
	got := mapPlaces(g, 1)
	if len(got) != 3 {
		t.Fatalf("expected one cave and two separate village entrances: %+v", got)
	}
	if got[0].Name != "Cave" || got[1].Name != "Village" || len(got[1].Entrances) != 2 || !got[1].Conditional || len(got[2].Entrances) != 1 {
		t.Fatalf("wrong groups: %+v", got)
	}
	original, _ := json.Marshal(got)
	for i := 0; i < 30; i++ {
		next, _ := json.Marshal(mapPlaces(g, 1))
		if string(next) != string(original) {
			t.Fatal("catalogue order must not depend on Go map iteration")
		}
	}
}

func TestMapPlacesWorldFloorSummary(t *testing.T) {
	_, _, g := setup(t)
	for _, floor := range []int{100, 200, 300, 400, 700, 701, 702, 703, 704, 705} {
		places := mapPlaces(g, floor)
		if len(places) == 0 {
			continue
		}
		t.Logf("world floor %d %s: %d places", floor, g.Floors[floor].Name, len(places))
		if floor == 100 {
			for _, place := range places {
				t.Logf("  %s -> %d (%d,%d), %d entry tiles, conditional=%t", place.Name, place.Floor, place.Entrances[0].X, place.Entrances[0].Y, len(place.Entrances), place.Conditional)
			}
		}
	}
}

func TestMapPlacesIncludesEffectiveConditionalBranchDestinations(t *testing.T) {
	_, _, g := setup(t)
	wp, ok := g.WarpAt(703, 334, 182)
	if !ok || wp.Free == "" || wp.ToFloor != 703 {
		t.Fatal("expected native lumberjack FREEMORE fallback to its own source floor")
	}
	places := mapPlaces(g, 703)
	found := map[int]bool{}
	for _, place := range places {
		for _, entry := range place.Entrances {
			if entry.X == 334 && entry.Y == 182 && (place.Floor == 7453 || place.Floor == 7454) {
				if !place.Conditional {
					t.Fatal("conditional route advertised as unconditional")
				}
				found[place.Floor] = true
			}
		}
	}
	if !found[7453] || !found[7454] {
		t.Fatalf("both native FREE/TO branches must be listed; got %v", found)
	}
}

func TestMapPlacesConditionalTargetsValidateAndDeduplicateWithoutEvaluatingGates(t *testing.T) {
	f := &data.Floor{ID: 1, Name: "World", W: 4, H: 4, Tiles: make([]uint16, 16), Objs: make([]uint16, 16)}
	for i := range f.Tiles {
		f.Tiles[i] = 100
	}
	g := &data.Game{Floors: map[int]*data.Floor{1: f, 2: {ID: 2, Name: "Village", W: 10, H: 10}, 3: {ID: 3, Name: "Cave", W: 10, H: 10}}, Tiles: data.TileSet{0: {Walkable: 1}, 100: {Walkable: 1}}, Warps: map[int]map[[2]int]data.Warp{1: {
		{1, 1}: {ToFloor: 1, ToX: 1, ToY: 1, Free: "FREEMORE|FREE:LV>999|TO:2,0,7&999,1,1&3,100,100|OVER|FREE:LV>0|TO:3,0,7&2,1,1&bad&3,2,2|OVER"},
	}}}
	got := mapPlaces(g, 1)
	if len(got) != 2 {
		t.Fatalf("expected two valid destinations, no nonexistent/out-of-bounds/duplicate source rows: %+v", got)
	}
	for _, place := range got {
		if !place.Conditional || len(place.Entrances) != 1 || place.Entrances[0].X != 1 || place.Entrances[0].Y != 1 {
			t.Fatalf("wrong conditional doorway: %+v", place)
		}
	}
}
