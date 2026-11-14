package world

import (
	"testing"

	"sa/server/internal/battle"
	"sa/server/internal/proto"
)

func TestLisaridoAutomationRecognizesRandomCannonAndProtectsCapture(t *testing.T) {
	for _, tc := range []struct{ protect, ordinary bool }{{}, {ordinary: true}, {protect: true}} {
		protect := tc.protect
		w, db, g := setup(t)
		c, cl := petOwner(t, w, db, "cannon-auto", 30, 100)
		givePet(t, w, int(c.ID), g.Battle.Enemies[29006], 20)
		w.Do(func() {
			e := w.players[int(c.ID)]
			e.pets.Battle = 0
			var enemies []*battle.Fighter
			for _, slot := range []int{15, 16, 17} {
				f := enemyFighter(w, g.Battle.Enemies[29006], 1, slot)
				f.HP, f.MaxHP, f.Tactics = 10000, 10000, "gu:1"
				enemies = append(enemies, f)
			}
			w.startBattleWith(e, enemies, nil, nil)
			ft := e.fight
			pet := ft.b.F[5]
			pet.HP, pet.MaxHP = 10000, 10000
			pet.Loyalty = 100
			// With no ordinary attack slot the known, safe cannon must remain
			// a real automatic option rather than silently becoming None.
			if !tc.ordinary {
				pet.Skills[0] = nil
			}
			a := &autoPlayState{settings: defaultAutoSettings()}
			if protect {
				enemies[0].HP = 1
				w.battleCommand(e, "capture", 15, -1)
				if ft.cmd == nil || ft.cmd.Kind != battle.Capture {
					t.Error("capture fixture rejected")
					return
				}
				// Use guard here to exercise capture-scope blocking independently
				// of the owner's separate emergency capture override.
				a.settings.PetFirst = autoAction{Kind: "skill", Name: "电磁火炮"}
			}
			skill, target := w.chooseAutomationPet(e, a, 5, battle.Command{Kind: battle.Guard})
			if !protect && !tc.ordinary && (skill != 2 || target < 15 || target > 17) {
				t.Errorf("known random cannon not selected: %d/%d", skill, target)
				return
			}
			if tc.ordinary && skill != 0 {
				t.Errorf("five single shots were multiplied by enemy count over ordinary attack: %d/%d", skill, target)
				return
			}
			if protect && skill == 2 {
				t.Errorf("random cannon can hit protected capture despite selected target %d", target)
				return
			}
			if !protect {
				w.submitBattlePetCommand(e, skill, target, true, 5)
				w.battleCommand(e, "guard", -1, -1, true)
			}
		})
		if !protect {
			hits := 0
			for _, msg := range cl.take() {
				if turn, ok := msg.(*proto.BattleTurn); ok {
					for _, ev := range turn.Events {
						if ev.Actor != 5 || ev.Kind != "magic" && ev.Kind != "attack" {
							continue
						}
						hits++
						if !tc.ordinary && (ev.Kind != "magic" || ev.Effect != 199301) {
							t.Fatalf("auto cannon did not dispatch: %+v", ev)
						}
					}
				}
			}
			want := 5
			if tc.ordinary {
				want = 1
			}
			if hits != want {
				t.Fatalf("native automatic action hits=%d want=%d", hits, want)
			}
		}
	}
}

func TestLisaridoNoEscapeAndScriptedBattleDisplacementProtection(t *testing.T) {
	for _, tc := range []struct {
		name                string
		floor               int
		npc, callback, want bool
	}{
		{name: "ordinary", floor: 1000},
		{name: "no-escape", floor: 12345, want: true},
		{name: "npc", floor: 1000, npc: true},
		{name: "event", floor: 1000, callback: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			w, db, g := setup(t)
			c, _ := petOwner(t, w, db, "cannon-boundary-"+tc.name, 30, 100)
			w.Do(func() {
				e := w.players[int(c.ID)]
				e.floor = tc.floor
				var n *entity
				if tc.npc {
					n = &entity{}
				}
				var onEnd func(string, []*entity)
				if tc.callback {
					onEnd = func(string, []*entity) {}
				}
				w.startBattleWith(e, []*battle.Fighter{enemyFighter(w, g.Battle.Enemies[29006], 1, 15)}, n, onEnd)
				if e.fight.b.NoDisplacement != tc.want || e.fight.b.NoAbduct != (tc.npc || tc.callback) {
					t.Errorf("world encounter protection not carried into cannon: no-displacement=%v no-abduct=%v", e.fight.b.NoDisplacement, e.fight.b.NoAbduct)
				}
			})
		})
	}
}
