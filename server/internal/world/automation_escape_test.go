package world

import (
	"testing"
	"time"

	"sa/server/internal/battle"
	"sa/server/internal/proto"
)

func TestAutomationAutoEscapeThreeActualFailuresThenFight(t *testing.T) {
	for _, quick := range []bool{false, true} {
		name := "auto"
		if quick {
			name = "quick"
		}
		t.Run(name, func(t *testing.T) {
			w, db, g := setup(t)
			c, cl := petOwner(t, w, db, "escape-three-"+name, 30, 100)
			w.Do(func() {
				e := w.players[int(c.ID)]
				foe := enemyFighter(w, petEnemy(t, g, 1), 1000, 15)
				foe.HP, foe.MaxHP, foe.Atk, foe.Tactics = 100000, 100000, 0, "gu:1"
				w.startBattleWith(e, []*battle.Fighter{foe}, nil, func(string, []*entity) {})
				me := e.fight.b.F[e.fight.slot]
				me.HP, me.MaxHP, me.MP = 200, 200, 100
				a := &autoPlayState{autoBattle: true, quick: quick, settings: defaultAutoSettings()}
				a.settings.AutoEscape, a.settings.Capture = true, true
				a.settings.First, a.settings.Then = autoAction{Kind: "attack"}, autoAction{Kind: "attack"}
				e.automation = a
				// First selection arms the room; polling without a resolved turn
				// cannot count as an escape failure.
				for i := 0; i < 5; i++ {
					cmd, _, _ := w.chooseAutomation(e, a)
					if cmd.Kind != battle.Escape || a.escapeFailures != 0 {
						t.Errorf("selection counted as failure or ignored escape: %+v failures=%d", cmd, a.escapeFailures)
						return
					}
				}
				now := w.now()
				for i := 0; i < 40 && e.fight != nil && e.fight.room.turn < 4; i++ {
					w.automationTick(now.Add(time.Duration(i) * 5 * time.Second))
				}
				if e.fight == nil || e.fight.room.turn != 4 || a.escapeFailures != 3 {
					t.Errorf("expected 3 actual failures and fourth combat turn: fight=%v failures=%d", e.fight != nil, a.escapeFailures)
				}
			})
			var kinds []string
			for _, msg := range cl.take() {
				if turn, ok := msg.(*proto.BattleTurn); ok {
					for _, ev := range turn.Events {
						if ev.Actor == 0 {
							kinds = append(kinds, ev.Kind)
						}
					}
				}
			}
			if len(kinds) != 4 || kinds[0] != "escape" || kinds[1] != "escape" || kinds[2] != "escape" || kinds[3] != "attack" {
				t.Errorf("wire strategy must resume attacks despite capture/emergency escape: %v", kinds)
			}
		})
	}
}

func TestAutomationAutoEscapeResetAndNoEscapeFloor(t *testing.T) {
	w, db, g := setup(t)
	c, _ := petOwner(t, w, db, "escape-reset", 30, 100)
	w.Do(func() {
		e := w.players[int(c.ID)]
		foe := enemyFighter(w, petEnemy(t, g, 1), 1, 15)
		foe.HP, foe.MaxHP, foe.Atk, foe.Tactics = 100000, 100000, 0, "gu:1"
		w.startBattleWith(e, []*battle.Fighter{foe}, nil, func(string, []*entity) {})
		a := &autoPlayState{settings: defaultAutoSettings(), escapeRoom: &battleRoom{}, escapeFailures: 3}
		a.settings.AutoEscape, a.settings.Escape = true, false
		cmd, _, _ := w.chooseAutomation(e, a)
		if cmd.Kind != battle.Escape || a.escapeFailures != 0 {
			t.Errorf("new room must reset failures: %+v / %d", cmd, a.escapeFailures)
		}
		w.Rules.NoEscapeFloors = []int{e.floor}
		cmd, _, _ = w.chooseAutomation(e, a)
		if cmd.Kind == battle.Escape {
			t.Error("no-escape floor must use combat strategy immediately")
		}
	})
}
