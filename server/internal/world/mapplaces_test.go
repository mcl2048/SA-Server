package world

import (
	"encoding/json"
	"fmt"
	"slices"
	"sort"
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

// This budget covers the public request on the serialized world loop, not only
// a helper. Immutable map resources must not be regrouped on every map reopen;
// the live NPC projection must still be rebuilt for moving buses and NPCs.
func TestNpcListRepeatedRequestsKeepStaticWorkBoundedAndNPCsLive(t *testing.T) {
	w, db, _ := setup(t)
	p := newChar(t, db, "maprepeat", 100, 633, 491)
	cl := &fakeClient{}
	w.Enter(p, cl)
	cl.take()
	w.NpcList(int(p.ID), 100)
	initial, ok := find[*proto.NpcList](cl.take())
	if !ok || len(initial.Places) == 0 {
		t.Fatal("expected real world map catalogue")
	}
	var npc *entity
	var oldX, oldY int
	var name string
	w.Do(func() {
		for _, e := range w.floors[100] {
			if e.kind == "npc" && e.name != "" && !e.hidden() && e.bus == nil && e.npc.Function != "TimeMan" {
				npc = e
				oldX, oldY, name = e.x, e.y, e.name
				break
			}
		}
	})
	if npc == nil {
		t.Fatal("world floor requires a live named NPC")
	}
	w.Do(func() { npc.x++ })
	t.Cleanup(func() { w.Do(func() { npc.x = oldX }) })
	w.NpcList(int(p.ID), 100)
	moved, ok := find[*proto.NpcList](cl.take())
	if !ok {
		t.Fatal("missing repeated response")
	}
	live := false
	for _, e := range moved.Npcs {
		if e.Name == name && e.X == oldX+1 && e.Y == oldY {
			live = true
		}
	}
	if !live {
		t.Fatal("static catalogue reuse froze live NPC positions")
	}
	allocations := testing.AllocsPerRun(30, func() {
		w.NpcList(int(p.ID), 100)
		cl.take()
	})
	if allocations > 20 {
		t.Fatalf("reopening floor 100 allocates %.0f objects/request; static catalogue work must be bounded (budget 20)", allocations)
	}
	t.Logf("repeated real NpcList request: %.0f allocations", allocations)
}

func TestMapPlacesResourceExclusionAudit(t *testing.T) {
	w, _, g := setup(t)
	floors := make([]int, 0, len(g.Floors))
	for floor := range g.Floors {
		floors = append(floors, floor)
	}
	sort.Ints(floors)
	sourceCount, blocked, sameFloor, missing, outside, pairs, physical := 0, 0, 0, 0, 0, 0, 0
	maxBytes, maxFloor, maxPlaces := 0, 0, 0
	for _, floor := range floors {
		f := g.Floors[floor]
		for xy, wp := range g.Warps[floor] {
			sourceCount++
			if !g.Tiles.Walkable(f, xy[0], xy[1]) {
				blocked++
				continue
			}
			candidates := [][3]int{{wp.ToFloor, wp.ToX, wp.ToY}}
			if wp.Free != "" {
				for _, segment := range strings.Split(wp.Free, "OVER") {
					if _, ok := data.ArgField(segment, "FREE"); ok {
						candidates = append(candidates, data.FreeWarpPoints(segment)...)
					}
				}
			}
			for _, to := range candidates {
				target := g.Floors[to[0]]
				switch {
				case target == nil:
					missing++
				case to[0] == floor:
					sameFloor++
				case !target.In(to[1], to[2]):
					outside++
				}
			}
		}
		places := mapPlaces(g, floor)
		unique := map[[2]int]bool{}
		for _, p := range places {
			pairs += len(p.Entrances)
			for _, e := range p.Entrances {
				unique[[2]int{e.X, e.Y}] = true
			}
		}
		physical += len(unique)
		b, err := json.Marshal(&proto.NpcList{Floor: floor, Places: places})
		if err != nil {
			t.Fatal(err)
		}
		if len(b) > maxBytes {
			maxBytes, maxFloor, maxPlaces = len(b), floor, len(places)
		}
	}
	t.Logf("resource audit: %d loaded floors, %d effective physical warp sources, %d source-blocked; rejected target candidates: same-floor=%d nonexistent=%d out-of-bounds=%d", len(floors), sourceCount, blocked, sameFloor, missing, outside)
	t.Logf("catalogue: %d unique physical sources, %d source/destination pairs; largest JSON catalogue=%d bytes on floor %d (%d places)", physical, pairs, maxBytes, maxFloor, maxPlaces)
	npcCount, named, visible, moving, invalid := 0, 0, 0, 0, 0
	maxSceneNPCs, maxSceneNPCFloor, maxSceneBytes, maxSceneBytesFloor := 0, 0, 0, 0
	w.Do(func() {
		for floor, actors := range w.floors {
			sceneNpcs := []proto.NpcPos{}
			for _, npc := range actors {
				if npc.kind != "npc" {
					continue
				}
				npcCount++
				if npc.name == "" {
					continue
				}
				named++
				if npc.hidden() {
					continue
				}
				visible++
				if g.Floors[floor].In(npc.x, npc.y) {
					sceneNpcs = append(sceneNpcs, proto.NpcPos{Name: npc.name, X: npc.x, Y: npc.y})
				}
				if floor == 10001 || floor == 11001 || floor == 10701 {
					plain := g.Tiles.Walkable(g.Floors[floor], npc.x, npc.y)
					_, warp := g.WarpAt(floor, npc.x, npc.y)
					t.Logf("cave NPC browser candidate: floor=%d name=%s point=(%d,%d) plain-walkable=%t", floor, npc.name, npc.x, npc.y, plain && !warp)
					for _, d := range MOVE {
						x, y := npc.x+d[0], npc.y+d[1]
						if !g.Tiles.Walkable(g.Floors[floor], x, y) {
							continue
						}
						if _, warp := g.WarpAt(floor, x, y); warp {
							continue
						}
						t.Logf("  adjacent approach cell=(%d,%d)", x, y)
						break
					}
				}
				if npc.bus != nil {
					moving++
				}
				if !g.Floors[floor].In(npc.x, npc.y) {
					invalid++
					t.Logf("out-of-bounds NPC resource: floor=%d name=%s point=(%d,%d)", floor, npc.name, npc.x, npc.y)
				}
			}
			raw, err := json.Marshal(&proto.NpcList{Floor: floor, Npcs: sceneNpcs, Places: w.placesForFloor(floor)})
			if err != nil {
				t.Error(err)
				continue
			}
			if len(sceneNpcs) > maxSceneNPCs {
				maxSceneNPCs, maxSceneNPCFloor = len(sceneNpcs), floor
			}
			if len(raw) > maxSceneBytes {
				maxSceneBytes, maxSceneBytesFloor = len(raw), floor
			}
			if floor == 10001 {
				t.Logf("cave floor10001 actual scene response: %d visible in-bounds NPC, %d bytes JSON including static places", len(sceneNpcs), len(raw))
			}
		}
	})
	t.Logf("scene cost bounds in current resources: max=%d visible NPCs on floor%d; max=%d bytes JSON incl Places on floor%d", maxSceneNPCs, maxSceneNPCFloor, maxSceneBytes, maxSceneBytesFloor)
	t.Logf("NPC scene projection: %d live NPCs, %d named, %d currently visible named, %d moving transports, %d out-of-bounds", npcCount, named, visible, moving, invalid)
	if maxBytes > 128*1024 {
		t.Fatalf("catalogue payload exceeds 128KiB: %d", maxBytes)
	}
}

func BenchmarkMapPlaceCatalogue(b *testing.B) {
	gameOnce.Do(func() { gameOnce.g, gameOnce.err = data.Load("../../../gamedata") })
	if gameOnce.err != nil {
		b.Fatal(gameOnce.err)
	}
	for _, floor := range []int{100, 200, 300, 400, 703} {
		b.Run(fmt.Sprint(floor), func(b *testing.B) {
			b.ReportAllocs()
			for b.Loop() {
				mapPlaces(gameOnce.g, floor)
			}
		})
	}
}

func BenchmarkMapPlaceCachedCatalogue(b *testing.B) {
	gameOnce.Do(func() { gameOnce.g, gameOnce.err = data.Load("../../../gamedata") })
	if gameOnce.err != nil {
		b.Fatal(gameOnce.err)
	}
	for _, floor := range []int{100, 200, 300, 400, 703} {
		b.Run(fmt.Sprint(floor), func(b *testing.B) {
			w := &World{game: gameOnce.g}
			w.placesForFloor(floor)
			b.ReportAllocs()
			for b.Loop() {
				w.placesForFloor(floor)
			}
		})
	}
}

func TestNpcListProjectsOnlyVisibleNamedNPCsFromCurrentWorld(t *testing.T) {
	w, db, _ := setup(t)
	p := newChar(t, db, "mapvisibility", 1000, 20, 20)
	cl := &fakeClient{}
	w.Enter(p, cl)
	cl.take()
	w.Do(func() {
		// These are isolated world entities, not modifications of shared Game data.
		w.addToFloor(&entity{id: 9000011, kind: "npc", name: "Visible fixture", floor: 1000, x: 12, y: 13, npc: &data.NPC{}})
		w.addToFloor(&entity{id: 9000012, kind: "npc", name: "Hidden fixture", floor: 1000, x: 14, y: 15, sprite: timeManHidden, npc: &data.NPC{Function: "TimeMan"}})
		w.addToFloor(&entity{id: 9000013, kind: "npc", floor: 1000, x: 16, y: 17, npc: &data.NPC{}})
		w.addToFloor(&entity{id: 9000014, kind: "pet", name: "Pet fixture", floor: 1000, x: 18, y: 19})
		w.addToFloor(&entity{id: 9000015, kind: "player", name: "Player fixture", floor: 1000, x: 20, y: 21})
		w.addToFloor(&entity{id: 9000016, kind: "npc", name: "Outside fixture", floor: 1000, x: -1, y: 10, npc: &data.NPC{}})
	})
	w.NpcList(int(p.ID), 1000)
	m, ok := find[*proto.NpcList](cl.take())
	if !ok {
		t.Fatal("missing scene catalogue")
	}
	found := false
	for _, e := range m.Npcs {
		switch e.Name {
		case "Visible fixture":
			found = e.X == 12 && e.Y == 13
		case "Hidden fixture", "Pet fixture", "Player fixture", "Outside fixture", "":
			t.Fatalf("non-NPC or hidden actor entered scene catalogue: %+v", e)
		}
	}
	if !found {
		t.Fatal("visible named NPC missing from actual scene catalogue")
	}
}

func TestNpcListDuplicateNamesHaveStableCoordinateOrder(t *testing.T) {
	w, db, _ := setup(t)
	p := newChar(t, db, "maporder", 1000, 20, 20)
	cl := &fakeClient{}
	w.Enter(p, cl)
	cl.take()
	w.Do(func() {
		for i, xy := range [][2]int{{12, 10}, {10, 12}, {10, 10}} {
			w.addToFloor(&entity{id: 9000020 + i, kind: "npc", name: "Duplicate fixture", floor: 1000, x: xy[0], y: xy[1], npc: &data.NPC{}})
		}
	})
	for range 20 {
		w.NpcList(int(p.ID), 1000)
		m, ok := find[*proto.NpcList](cl.take())
		if !ok {
			t.Fatal("missing NPC list")
		}
		got := [][2]int{}
		for _, e := range m.Npcs {
			if e.Name == "Duplicate fixture" {
				got = append(got, [2]int{e.X, e.Y})
			}
		}
		want := [][2]int{{10, 10}, {12, 10}, {10, 12}}
		if !slices.Equal(got, want) {
			t.Fatalf("same-name NPC list order must be stable by y/x across refreshes: got=%v want=%v", got, want)
		}
	}
}

func TestNpcListRemoteFloorRetainsStaticPlacesWithoutEnumeratingActors(t *testing.T) {
	w, db, _ := setup(t)
	h := data.Hometowns[0]
	p := newChar(t, db, "mapremote", h.Floor, h.X, h.Y)
	cl := &fakeClient{}
	w.Enter(p, cl)
	cl.take()
	w.NpcList(int(p.ID), 1000)
	m, ok := find[*proto.NpcList](cl.take())
	if !ok || len(m.Places) == 0 {
		t.Fatal("historical static place protocol must remain available")
	}
	if len(m.Npcs) != 0 {
		t.Fatalf("remote floor must not enumerate NPC actors outside current scene: got %d", len(m.Npcs))
	}
}
