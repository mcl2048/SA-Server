package world

import (
	"testing"

	"sa/server/internal/battle"
	"sa/server/internal/data"
	"sa/server/internal/proto"
)

func TestLilithAutomationSelectsStormByEnemyCountAndProtectsCapture(t *testing.T) {
	for _, tc := range []struct {
		name              string
		enemies           int
		capture, fixed    bool
		wantSkill, target int
		wantHits          int
	}{
		{name: "multiple-enemies", enemies: 3, wantSkill: 2, target: 21, wantHits: 3},
		{name: "single-enemy", enemies: 1, wantSkill: 0, target: 15, wantHits: 1},
		{name: "teammate-capture", enemies: 3, capture: true, wantSkill: 0, target: 16, wantHits: 1},
		{name: "explicit-storm", enemies: 1, fixed: true, wantSkill: 2, target: 21, wantHits: 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			w, db, g := setup(t)
			c, cl := petOwner(t, w, db, "lilith-auto-"+tc.name, 30, 100)
			lilith := g.Battle.Enemies[data.LilithEnemyID]
			if lilith == nil {
				t.Fatal("native Lilith registry is missing")
			}
			givePet(t, w, int(c.ID), lilith, 10)
			var capturer *entity
			if tc.capture {
				other, _ := petOwner(t, w, db, "lilith-capture-"+tc.name, 30, 100)
				w.Do(func() { capturer = w.players[int(other.ID)] })
			}
			resolved := false
			w.Do(func() {
				e := w.players[int(c.ID)]
				if capturer != nil {
					w.joinPartyMain(capturer, e)
				}
				e.pets.Battle = 0
				enemies := make([]*battle.Fighter, 0, tc.enemies)
				for i := 0; i < tc.enemies; i++ {
					f := enemyFighter(w, lilith, 5, 15+i)
					f.HP, f.MaxHP, f.Atk, f.Def, f.Quick, f.Tactics = 100000, 100000, 0, 0, 0, "gu:1"
					if tc.capture && i == 0 {
						f.Level, f.HP, f.Seed.Capture = 1, 1, true
					}
					enemies = append(enemies, f)
				}
				w.startBattleWith(e, enemies, nil, func(string, []*entity) {})
				ft := e.fight
				pet := ft.b.F[ft.slot+5]
				pet.HP, pet.MaxHP, pet.Loyalty = 10000, 10000, 100
				pet.Atk, pet.FixAtk, pet.Quick, pet.FixQuick = 500, 500, 1000, 1000
				a := &autoPlayState{settings: defaultAutoSettings()}
				a.settings.Escape = false
				if tc.fixed {
					a.settings.PetFirst = autoAction{Kind: "skill", Name: "幽灵风暴"}
				}
				if capturer != nil {
					if !w.canCapture(capturer, enemies[0]) {
						t.Error("invalid native capture fixture")
						return
					}
					// A teammate's already queued manual capture must also block
					// implicit whole-side damage, with two safe opponents remaining.
					w.battleCommand(capturer, "capture", 15, -1)
				}
				skill, target := w.chooseAutomationPet(e, a, pet.Slot, battle.Command{Kind: battle.Guard})
				if skill != tc.wantSkill || target != tc.target {
					t.Errorf("native Lilith auto choice = %d/%d, want %d/%d", skill, target, tc.wantSkill, tc.target)
					return
				}
				// Use the real command boundary and resolver, not just the score.
				w.submitBattlePetCommand(e, skill, target, true, pet.Slot)
				w.battleCommand(e, "guard", -1, -1, true)
				if ft.room.turn != 1 {
					t.Errorf("selected native pet action did not resolve: turn=%d", ft.room.turn)
					return
				}
				if tc.capture && enemies[0].HP != 1 {
					t.Errorf("pet damaged protected capture target: HP=%d", enemies[0].HP)
					return
				}
				resolved = true
			})
			if !resolved {
				return
			}
			hits := 0
			for _, message := range cl.take() {
				turn, ok := message.(*proto.BattleTurn)
				if !ok {
					continue
				}
				for _, e := range turn.Events {
					if e.Actor != 5 || e.Kind != "attack" && e.Kind != "magic" {
						continue
					}
					hits++
					if tc.wantSkill == 2 {
						if e.Kind != "magic" || e.Effect != data.GhostStormEffect {
							t.Fatalf("selected storm did not reach native skill dispatch: %+v", e)
						}
					} else if e.Kind != "attack" || e.Target != tc.target {
						t.Fatalf("ordinary fallback used wrong action/target: %+v", e)
					}
				}
			}
			if hits != tc.wantHits {
				t.Fatalf("native pet hit count=%d want %d", hits, tc.wantHits)
			}
		})
	}
}
