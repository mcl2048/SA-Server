package world

import (
	"strings"
	"testing"
	"time"

	"sa/server/internal/battle"
	"sa/server/internal/proto"
)

func TestAutomationDoesNotSpendRevivalOnFlownPet(t *testing.T) {
	w, db, game := setup(t)
	c, _ := petOwner(t, w, db, "fly-revive", 30, 100)
	id := int(c.ID)
	ene := petEnemy(t, game, 1)
	givePet(t, w, id, ene, 10)
	w.Do(func() {
		e := w.players[id]
		e.pets.Battle = 0
		foe := enemyFighter(w, ene, 1, 10)
		foe.HP, foe.MaxHP, foe.Atk = 10000, 10000, 0
		foe.Tactics = "gu:1"
		w.startBattleWith(e, []*battle.Fighter{foe}, nil, func(string, []*entity) {})
		ft := e.fight
		me, pet := ft.b.F[ft.slot], ft.b.F[ft.slot+5]
		me.HP = me.MaxHP
		pet.HP, pet.Flown = 0, true
		reviveSlot := -1
		for _, item := range game.Items {
			if item.Field != 2 && item.UseFunc == "ITEM_useRessurect" && strings.Contains(item.Memo, "气绝回复") && itemTargetValid(item, pet.Slot, me.Slot) {
				reviveSlot = len(e.inv) - 1
				e.inv[reviveSlot] = w.newItem(item)
				break
			}
		}
		if reviveSlot < 0 {
			t.Error("real resurrection item fixture unavailable")
			return
		}
		a := &autoPlayState{settings: defaultAutoSettings()}
		a.settings.Escape, a.settings.Magic = false, false
		cmd, _, _ := w.chooseAutomation(e, a)
		if cmd.Kind == battle.UseItem && cmd.ItemSlot == reviveSlot {
			t.Errorf("automation spends resurrection on a departed pet: %+v", cmd)
		}
		if cmd.Kind != battle.Attack || cmd.Target != 10 {
			t.Errorf("departed ally prevented progress against the living enemy: %+v", cmd)
		}
	})
}

// Both server-owned presentation modes must settle a non-flying knockout from
// the authoritative turn, without waiting for browser animation or input.
func TestAutomationNonFlyingKnockoutEndsExactlyOnce(t *testing.T) {
	for _, quick := range []bool{false, true} {
		name, delay := "auto", 4*time.Second
		if quick {
			name, delay = "quick", time.Second
		}
		t.Run(name, func(t *testing.T) {
			w, db, game := setup(t)
			c, client := petOwner(t, w, db, "ko-"+name, 30, 100)
			id := int(c.ID)
			ene := petEnemy(t, game, 1)
			w.Do(func() {
				e := w.players[id]
				foe := enemyFighter(w, ene, 1, 10)
				foe.HP, foe.MaxHP, foe.Atk, foe.Quick = 1, 100000, 1000, 0
				foe.Sprite, foe.Tactics = 101813, "at:1;1;1" // LER cannot fly.
				w.startBattleWith(e, []*battle.Fighter{foe}, nil, func(string, []*entity) {})
				room := e.fight.room
				me := room.b.F[e.fight.slot]
				me.Atk, me.FixAtk, me.Quick, me.FixQuick = 1000, 1000, 1000, 1000
				me.HP, me.MaxHP = 100000, 100000
				a := &autoPlayState{autoBattle: true, quick: quick, settings: defaultAutoSettings()}
				a.settings.Escape, a.settings.Magic = false, false
				e.automation = a
				now := w.now()
				w.automationTick(now)
				w.automationTick(now.Add(delay))
				if e.fight != nil || room.turn != 1 || foe.HP != 0 || foe.Flown {
					t.Errorf("non-flying death did not settle: active=%v turns=%d hp=%d flown=%v", e.fight != nil, room.turn, foe.HP, foe.Flown)
				}
				for i := 1; i <= 5; i++ {
					w.automationTick(now.Add(delay + time.Duration(i)*time.Second))
				}
			})
			ends, deaths := 0, 0
			for _, message := range client.take() {
				switch message := message.(type) {
				case *proto.BattleTurn:
					for _, event := range message.Events {
						if event.Actor == 10 {
							t.Fatalf("dead enemy executed queued action: %+v", event)
						}
						if event.Target == 10 && event.Dead && event.HP == 0 && event.Fly == 0 {
							deaths++
						}
					}
				case *proto.BattleEnd:
					ends++
					if message.Result != "win" {
						t.Fatalf("knockout result = %q", message.Result)
					}
				}
			}
			if ends != 1 || deaths != 1 {
				t.Fatalf("expected one non-flying death and one settlement, got deaths=%d ends=%d", deaths, ends)
			}
		})
	}
}
