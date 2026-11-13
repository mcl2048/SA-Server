package world

import (
	"fmt"
	"testing"

	"sa/server/internal/battle"
)

func TestMultiPetRecallThenSummonKeepsBagMapping(t *testing.T) {
	w, db, g := setup(t)
	c, _ := petOwner(t, w, db, "recallmapping", 30, 100)
	w.Do(func() {
		e := w.players[int(c.ID)]
		for bag := range e.pets.Pets {
			p := petFromFighter(enemyFighter(w, petEnemy(t, g, 1), 20, 15), e.char.ID)
			p.Name = fmt.Sprintf("bag%d", bag)
			e.pets.Pets[bag] = p
		}
		e.pets.Battle, e.pets.Standby = 0, 30
		room := &battleRoom{b: battle.New(w.rnd)}
		w.joinRoom(room, e, 0)
		room.b.F[0].HP, room.b.F[0].MaxHP = 1000000, 1000000
		room.b.Add(&battle.Fighter{Slot: 15, Name: "dummy", Level: 20, HP: 1000000, MaxHP: 1000000, Atk: 1, Def: 1000000})
		secondary := room.b.F[6]
		secondary.HP = 9
		turn := func(bag int) {
			e.fight.cmd = nil
			w.battleCommand(e, string(battle.PetSwap), -1, bag)
			if e.fight.cmd == nil {
				t.Fatal("missing swap command")
			}
			cmds := map[int]battle.Command{0: *e.fight.cmd}
			for _, slot := range e.fight.petSlots() {
				cmds[slot] = battle.Command{Kind: battle.Guard}
			}
			w.afterMemberTurn(e, room.b.Resolve(cmds))
		}
		turn(-1)
		if room.b.F[5] != nil || e.fight.pet != -1 || len(e.fight.pets) != 4 {
			t.Fatal("first recall did not remove only the primary")
		}
		turn(0)
		if len(e.fight.pets) != 5 || e.fight.pet != 0 || room.b.F[5] == nil {
			t.Fatalf("resummoned primary missing: %+v", e.fight.pets)
		}
		if room.b.F[6] != secondary {
			t.Fatal("resummoning primary replaced an existing extra")
		}
		if len(room.b.Recalled) != 0 {
			t.Fatal("recalled fighter was never settled")
		}
		for _, slot := range e.fight.petSlots() {
			bag, _ := e.fight.petBagSlot(slot)
			pf := room.b.F[slot]
			if pf == nil || pf.Name != e.pets.Pets[bag].Name {
				t.Fatalf("slot%d maps to bag%d but holds %+v", slot, bag, pf)
			}
		}
		// A later kill must reward the recalled/resummoned bag, preserving other pets.
		w.Rules.ShareExp = false
		room.b.F[15].HP, room.b.F[15].Exp, room.b.F[15].KilledBy = 0, 1000, 5
		results := w.petResult(e, e.fight, 0)
		for _, result := range results {
			if result.Slot == 0 && result.Exp <= 0 {
				t.Fatal("resummoned pet lost its kill experience")
			}
			if result.Slot != 0 && result.Exp != 0 {
				t.Fatalf("experience went to a different bag: %+v", result)
			}
		}
	})
}
