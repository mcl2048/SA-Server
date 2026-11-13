package world

import (
	"sa/server/internal/data"
	"sa/server/internal/proto"
	"testing"
)

func TestEncounterCapabilityAuthorityAndChangeOnly(t *testing.T) {
	w, db, _ := setup(t)
	h := data.Hometowns[0]
	c := newChar(t, db, "encCapability", h.Floor, h.X, h.Y)
	cl := &fakeClient{}
	w.Enter(c, cl)
	cl.take()
	w.Do(func() {
		e := w.players[int(c.ID)]
		e.floor, e.x, e.y = 1000, 92, 99 // safe village; hometown fixture may be wilderness
		e.encounterCapabilityKnown = false
		w.refreshEncounterAvailability(e)
		first := cl.take()
		m, ok := find[*proto.AutoPlayState](first)
		if !ok || m.CanEncounter {
			t.Fatalf("safe city capability: %#v", m)
		}
		w.refreshEncounterAvailability(e)
		if _, ok := find[*proto.AutoPlayState](cl.take()); ok {
			t.Fatal("unchanged capability resent")
		}
		e.floor, e.x, e.y = 100, 650, 450
		e.char.HP = -1
		if !w.canEncounter(e) {
			t.Fatal("actual outdoor fixture should permit encounters")
		}
		w.refreshEncounterAvailability(e)
		m, ok = find[*proto.AutoPlayState](cl.take())
		if !ok || !m.CanEncounter {
			t.Fatal("outdoor transition missing")
		}
		e.noenemy = 10
		if w.canEncounter(e) {
			t.Fatal("exorcism must block capability")
		}
		e.noenemy = 0
		e.char.HP = 0
		if w.canEncounter(e) {
			t.Fatal("dead character can encounter")
		}
		e.char.HP = -1
		old := w.Rules.EncounterRate
		w.Rules.EncounterRate = 0
		if w.canEncounter(e) {
			t.Fatal("disabled server rate can encounter")
		}
		w.Rules.EncounterRate = old
		e.connected = false
		e.encounterCapabilityKnown = false
		w.refreshEncounterAvailability(e)
		if _, ok := find[*proto.AutoPlayState](cl.take()); ok {
			t.Fatal("detached actor received capability packets")
		}
	})
}
