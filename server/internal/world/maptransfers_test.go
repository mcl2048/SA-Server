package world

import (
	"encoding/json"
	"testing"
)

// The sea's first two chest islands are joined by native same-floor warps.
// The public catalogue must transmit those authoritative edges to the planner.
func TestNpcListIncludesSafeSameFloorTransfers(t *testing.T) {
	w, db, _ := setup(t)
	p := newChar(t, db, "seatransfer", 817, 146, 19)
	cl := &fakeClient{}
	w.Enter(p, cl)
	cl.take()
	w.NpcList(int(p.ID), 817)
	found := false
	for _, msg := range cl.take() {
		if msg.MsgType() != "NpcList" {
			continue
		}
		b, err := json.Marshal(msg)
		if err != nil {
			t.Fatal(err)
		}
		var v struct {
			Transfers []struct{ X, Y, ToX, ToY int }
		}
		if err := json.Unmarshal(b, &v); err != nil {
			t.Fatal(err)
		}
		for _, edge := range v.Transfers {
			if edge.X == 144 && edge.Y == 25 && edge.ToX == 143 && edge.ToY == 34 {
				found = true
			}
			if edge.X == 189 && edge.Y == 513 {
				t.Fatal("conditional FREEMORE fallback must not be advertised as an automatic transfer")
			}
		}
	}
	if !found {
		t.Fatal("missing native sea transfer (144,25) -> (143,34)")
	}
}

func TestNpcListIncludesSafeEdenReturnPassage(t *testing.T) {
	w, db, _ := setup(t)
	p := newChar(t, db, "edenreturn", 702, 388, 10)
	cl := &fakeClient{}
	w.Enter(p, cl)
	cl.take()
	w.NpcList(int(p.ID), 702)
	found := false
	for _, msg := range cl.take() {
		if msg.MsgType() != "NpcList" {
			continue
		}
		b, _ := json.Marshal(msg)
		var v struct {
			Transfers []struct {
				X, Y, ToX, ToY int
				Via            []struct{ Floor, X, Y, ToFloor, ToX, ToY int }
			}
		}
		if err := json.Unmarshal(b, &v); err != nil {
			t.Fatal(err)
		}
		for _, edge := range v.Transfers {
			if len(edge.Via) == 2 && edge.Via[0].Floor == 702 && edge.Via[0].ToFloor == 703 && edge.Via[1].Floor == 703 && edge.Via[1].ToFloor == 702 {
				found = true
			}
		}
	}
	if !found {
		t.Fatal("missing safe 702 -> 703 -> 702 return passage joining the isolated border and city")
	}
}

func TestHistoricalNpcListDoesNotBuildNavigation(t *testing.T) {
	w, db, _ := setup(t)
	p := newChar(t, db, "historicalnavigation", 1006, 15, 22)
	cl := &fakeClient{}
	w.Enter(p, cl)
	cl.take()
	w.NpcList(int(p.ID), 702)
	w.Do(func() {
		if len(w.mapTransferCache) != 0 || len(w.navigationFloors) != 0 || len(w.navigationPoints) != 0 {
			t.Error("historical map request built a live navigation graph")
		}
	})
}
