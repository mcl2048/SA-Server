package world

import (
	"sa/server/internal/battle"
	"sa/server/internal/proto"
	"testing"
)

// Catches automatic/quick play silently selecting plain attack because the
// new cross skill is missing from the known-skill scorer.
func TestPrimalClawsAutomationUsesRealCrossAndTransmitsSelfDefense(t *testing.T) {
	for _, temp := range []int{29007, 29008} {
		w, db, g := setup(t)
		c, cl := petOwner(t, w, db, "cross-auto", 100, 100)
		givePet(t, w, int(c.ID), g.Battle.Enemies[temp], 20)
		w.Do(func() {
			e := w.players[int(c.ID)]
			e.pets.Battle = 0
			var enemies []*battle.Fighter
			for _, slot := range []int{10, 11, 12, 13, 17} {
				f := enemyFighter(w, g.Battle.Enemies[29006], 1, slot)
				f.HP, f.MaxHP, f.Tactics = 100000, 100000, "gu:1"
				enemies = append(enemies, f)
			}
			w.startBattleWith(e, enemies, nil, nil)
			ft := e.fight
			p := ft.b.F[5]
			p.HP, p.MaxHP, p.Loyalty = 100000, 100000, 100
			a := &autoPlayState{settings: defaultAutoSettings()}
			skill, target := w.chooseAutomationPet(e, a, 5, battle.Command{Kind: battle.Guard})
			if skill != 2 || target != 12 {
				t.Errorf("cross missing or aimed at sparse edge: skill=%d target=%d", skill, target)
				return
			}
			w.submitBattlePetCommand(e, skill, target, true, 5)
			w.battleCommand(e, "guard", -1, -1, true)
			if p.DefenseBoost() < 30 || p.DefenseBoost() > 60 || p.DefenseTurns() != 4 {
				t.Errorf("buff not retained authoritatively: %d/%d", p.DefenseBoost(), p.DefenseTurns())
			}
			bf := w.fighterInfo(ft.room, p)
			if bf.DefenseBoost != p.DefenseBoost() || bf.DefenseTurns != 4 {
				t.Errorf("resume snapshot drops buff: %+v", bf)
			}
		})
		hits, stats := 0, 0
		for _, msg := range cl.take() {
			if turn, ok := msg.(*proto.BattleTurn); ok {
				for _, ev := range turn.Events {
					if ev.Actor == 5 && ev.Kind == "attack" && ev.Effect == 199402 {
						hits++
					}
					if ev.Actor == 5 && ev.Kind == "stat" && ev.Stat == 39 && ev.StatVal >= 30 && ev.StatVal <= 60 && (ev.StatTurns == 5 || ev.StatTurns == 4) {
						stats++
					}
				}
			}
		}
		if hits != 4 || stats != 2 {
			t.Fatalf("native wire result hits=%d stats=%d", hits, stats)
		}
	}
}

func TestPrimalClawsAutomaticCaptureScopeIncludesAdjacentSlotsOnly(t *testing.T) {
	w, _, g := setup(t)
	_ = w
	sk := g.Battle.Skills[29060]
	if sk == nil {
		t.Fatal("skill missing")
	}
	for _, tc := range []struct {
		center, protected int
		want              bool
	}{
		{12, 12, true}, {12, 11, true}, {12, 13, true}, {12, 17, true}, {12, 10, false}, {14, 15, false}, {14, 19, true},
	} {
		if got := automationPetCaptureInScope(sk, 1<<tc.protected, tc.center, 21); got != tc.want {
			t.Errorf("center %d protected %d: got %v want %v", tc.center, tc.protected, got, tc.want)
		}
	}
}
