package world

import (
	"testing"
	"time"

	"sa/server/internal/battle"
	"sa/server/internal/data"
	"sa/server/internal/proto"
)

// Use native item/magic definitions and the normal command validator/resolver;
// changing only authoritative combat stats keeps failures independent of UI.
func TestAutomationRecoveryDoesNotLetUntreatablePetBlockOwner(t *testing.T) {
	w, db, g := setup(t)
	c, _ := petOwner(t, w, db, "heal-owner-after-pet", 30, 100)
	ene := petEnemy(t, g, 1)
	givePet(t, w, int(c.ID), ene, 10)
	w.Do(func() {
		e := w.players[int(c.ID)]
		e.pets.Battle = 0
		e.inv[data.SlotBody] = w.newItem(g.Items[1001]) // self-only heal, 5 MP
		foe := enemyFighter(w, ene, 1, 15)
		foe.HP, foe.MaxHP, foe.Atk, foe.Tactics = 100000, 100000, 0, "gu:1"
		w.startBattleWith(e, []*battle.Fighter{foe}, nil, func(string, []*entity) {})
		me, pet := e.fight.b.F[e.fight.slot], e.fight.b.F[e.fight.slot+5]
		me.HP, me.MaxHP, me.MP, pet.HP, pet.MaxHP = 20, 200, 100, 1, 200
		a := &autoPlayState{settings: defaultAutoSettings()}
		a.settings.Escape, a.settings.First = false, autoAction{Kind: "guard"}
		cmd, _, _ := w.chooseAutomation(e, a)
		if cmd.Kind != battle.Magic || cmd.Target != me.Slot || cmd.ItemSlot != data.SlotBody {
			t.Errorf("unhealable lower-HP pet blocked owner's self heal: %+v", cmd)
			return
		}
		w.battlePetCommand(e, -1, -1, pet.Slot)
		w.battleCommand(e, string(cmd.Kind), cmd.Target, cmd.ItemSlot)
		if me.HP <= 20 || me.MP != 95 || pet.HP != 1 {
			t.Errorf("self heal did not execute as selected: owner=%d/%d pet=%d", me.HP, me.MP, pet.HP)
		}
	})
}

func TestAutomationRecoveryIncludesActiveMountThreshold(t *testing.T) {
	w, db, g := setup(t)
	c, _ := petOwner(t, w, db, "heal-mount", 30, 100)
	w.Do(func() {
		e := w.players[int(c.ID)]
		e.inv[data.EquipSlots] = w.newItem(g.Items[1234]) // native meat, HP20
		foe := enemyFighter(w, petEnemy(t, g, 1), 1, 15)
		foe.HP, foe.MaxHP, foe.Atk, foe.Tactics = 100000, 100000, 0, "gu:1"
		w.startBattleWith(e, []*battle.Fighter{foe}, nil, func(string, []*entity) {})
		me := e.fight.b.F[e.fight.slot]
		me.HP, me.MaxHP = 200, 200
		me.Ride = &battle.Mount{HP: 1, MaxHP: 200}
		a := &autoPlayState{settings: defaultAutoSettings()}
		a.settings.Escape = false
		cmd, _, _ := w.chooseAutomation(e, a)
		if cmd.Kind != battle.UseItem || cmd.Target != me.Slot {
			t.Errorf("low active mount HP did not trigger native recovery: %+v", cmd)
			return
		}
		w.battleCommand(e, string(cmd.Kind), cmd.Target, cmd.ItemSlot)
		if me.HP != 200 || me.Ride.HP <= 1 {
			t.Errorf("recovery must flow through native rider/mount split: rider=%d mount=%d", me.HP, me.Ride.HP)
		}
	})
}

func TestAutomationMPRejectsNativeHPFirstMixedRecovery(t *testing.T) {
	w, db, g := setup(t)
	c, _ := petOwner(t, w, db, "mp-effective-item", 30, 100)
	w.Do(func() {
		e := w.players[int(c.ID)]
		e.inv[data.SlotBody] = w.newItem(g.Items[1002]) // OtherRecovery, 8 MP
		e.inv[9] = w.newItem(g.Items[1840])             // 气70 体500 is HP-only in battle
		e.inv[10] = w.newItem(g.Items[1510])            // native MP20
		foe := enemyFighter(w, petEnemy(t, g, 1), 1, 15)
		foe.HP, foe.MaxHP, foe.Atk, foe.Tactics = 100000, 100000, 0, "gu:1"
		w.startBattleWith(e, []*battle.Fighter{foe}, nil, func(string, []*entity) {})
		me := e.fight.b.F[e.fight.slot]
		me.HP, me.MaxHP, me.MP, me.MaxMP = 200, 200, 0, 100
		cmd, ok := w.automationMP(e, me)
		if !ok || cmd.ItemSlot != 10 {
			t.Errorf("selected HP-only wine as MP recovery: %+v valid=%v", cmd, ok)
			return
		}
		w.battleCommand(e, string(cmd.Kind), cmd.Target, cmd.ItemSlot)
		if me.MP < 18 || me.MP > 22 || e.inv[9] == nil || e.inv[10] != nil {
			t.Errorf("MP item effect/consumption mismatch: MP=%d wine=%v potion=%v", me.MP, e.inv[9] != nil, e.inv[10] != nil)
		}
	})
}

func TestAutomationRecoveryWhileSilencedUsesMeat(t *testing.T) {
	w, db, g := setup(t)
	c, _ := petOwner(t, w, db, "heal-silenced", 30, 100)
	w.Do(func() {
		e := w.players[int(c.ID)]
		e.inv[data.SlotBody] = w.newItem(g.Items[1001])
		e.inv[9] = w.newItem(g.Items[1234])
		foe := enemyFighter(w, petEnemy(t, g, 1), 1, 15)
		foe.HP, foe.MaxHP, foe.Atk, foe.Tactics = 100000, 100000, 0, "gu:1"
		w.startBattleWith(e, []*battle.Fighter{foe}, nil, func(string, []*entity) {})
		me := e.fight.b.F[e.fight.slot]
		me.HP, me.MaxHP, me.MP, me.MaxMP = 20, 200, 100, 100
		// Apply silence through the native status item resolver, rather than
		// manufacturing an exported test-only setter for private battle state.
		for tries := 0; tries < 30 && me.Status() != battle.StNocast; tries++ {
			e.fight.b.Resolve(map[int]battle.Command{me.Slot: {Kind: battle.UseItem, Target: me.Slot, ItemFunc: "ITEM_useStatusChange", ItemArg: "默 turn 10 成 10000"}})
		}
		if me.Status() != battle.StNocast {
			t.Error("native silence fixture failed")
			return
		}
		a := &autoPlayState{settings: defaultAutoSettings()}
		a.settings.Escape = false
		cmd, _, _ := w.chooseAutomation(e, a)
		if cmd.Kind != battle.UseItem || cmd.ItemSlot != 9 {
			t.Errorf("silenced caster must use meat instead of failing a spirit: %+v", cmd)
			return
		}
		w.battleCommand(e, string(cmd.Kind), cmd.Target, cmd.ItemSlot)
		if me.HP <= 20 || me.MP != 100 || e.inv[9] != nil {
			t.Errorf("native meat recovery failed while silenced: HP=%d MP=%d item=%v", me.HP, me.MP, e.inv[9] != nil)
		}
	})
}

func TestAutomationMPForActualInjuredAlly(t *testing.T) {
	w, db, g := setup(t)
	c, _ := petOwner(t, w, db, "mp-scope", 30, 100)
	ene := petEnemy(t, g, 1)
	givePet(t, w, int(c.ID), ene, 10)
	w.Do(func() {
		e := w.players[int(c.ID)]
		e.pets.Battle = 0
		e.inv[data.SlotBody], e.inv[data.SlotArm] = w.newItem(g.Items[1001]), w.newItem(g.Items[1002])
		e.inv[9] = w.newItem(g.Items[1510])
		foe := enemyFighter(w, ene, 1, 15)
		foe.HP, foe.MaxHP, foe.Atk, foe.Tactics = 100000, 100000, 0, "gu:1"
		w.startBattleWith(e, []*battle.Fighter{foe}, nil, func(string, []*entity) {})
		me, pet := e.fight.b.F[e.fight.slot], e.fight.b.F[e.fight.slot+5]
		me.HP, me.MaxHP, me.MP, me.MaxMP, pet.HP, pet.MaxHP = 200, 200, 6, 100, 1, 200
		a := &autoPlayState{settings: defaultAutoSettings()}
		a.settings.Escape = false
		cmd, _, _ := w.chooseAutomation(e, a)
		if cmd.Kind != battle.UseItem || cmd.ItemSlot != 9 {
			t.Errorf("unrelated affordable self heal prevented MP recovery for injured pet: %+v", cmd)
			return
		}
		w.battlePetCommand(e, -1, -1, pet.Slot)
		w.battleCommand(e, string(cmd.Kind), cmd.Target, cmd.ItemSlot)
		cmd, _, _ = w.chooseAutomation(e, a)
		if cmd.Kind != battle.Magic || cmd.Target != pet.Slot || cmd.ItemSlot != data.SlotArm {
			t.Errorf("replenished MP must allow actual pet recovery: %+v", cmd)
		}
	})
}

func TestAutomationThresholdAndMPRecoveryThroughAutoAndQuickTurns(t *testing.T) {
	for _, quick := range []bool{false, true} {
		name, delay := "auto", 4*time.Second
		if quick {
			name, delay = "quick", time.Second
		}
		t.Run(name, func(t *testing.T) {
			w, db, g := setup(t)
			c, cl := petOwner(t, w, db, "native-recovery-"+name, 30, 100)
			w.Do(func() {
				e := w.players[int(c.ID)]
				e.inv[data.SlotBody] = w.newItem(g.Items[1002])
				e.inv[9] = w.newItem(g.Items[1510])
				foe := enemyFighter(w, petEnemy(t, g, 1), 1, 15)
				foe.HP, foe.MaxHP, foe.Atk, foe.Tactics = 100000, 100000, 0, "gu:1"
				w.startBattleWith(e, []*battle.Fighter{foe}, nil, func(string, []*entity) {})
				me := e.fight.b.F[e.fight.slot]
				me.HP, me.MaxHP, me.MP, me.MaxMP = 60, 200, 100, 100
				a := &autoPlayState{autoBattle: true, quick: quick, settings: defaultAutoSettings()}
				a.settings.Escape, a.settings.First, a.settings.Then = false, autoAction{Kind: "guard"}, autoAction{Kind: "attack"}
				for _, threshold := range []int{1, 29, 30, 57, 100} {
					a.settings.HealAt, me.HP = threshold, 2*threshold
					atBoundary, _, _ := w.chooseAutomation(e, a)
					if atBoundary.Kind != battle.Guard {
						t.Errorf("exact %d%% boundary must not trigger recovery: %+v", threshold, atBoundary)
					}
				}
				a.settings.HealAt, me.HP = 30, 60
				cmd, _, _ := w.chooseAutomation(e, a)
				if cmd.Kind != battle.Guard {
					t.Errorf("exact threshold must not heal: %+v", cmd)
				}
				a.settings.HealAt = 0
				me.HP = 1
				cmd, _, _ = w.chooseAutomation(e, a)
				if cmd.Kind == battle.Magic {
					t.Errorf("zero threshold must disable HP trigger: %+v", cmd)
				}
				a.settings.HealAt, me.HP, me.MP = 30, 59, 0
				e.automation = a
				now := w.now()
				w.automationTick(now)
				w.automationTick(now.Add(delay))
				if e.fight.room.turn != 1 || me.HP != 59 || me.MP < 18 || e.inv[9] != nil {
					t.Errorf("first real turn must restore MP once: turn=%d HP=%d MP=%d item=%v", e.fight.room.turn, me.HP, me.MP, e.inv[9] != nil)
				}
				mp := me.MP
				w.automationTick(now.Add(delay))
				w.automationTick(now.Add(2 * delay))
				if e.fight.room.turn != 2 || me.HP <= 59 || me.MP != mp-8 {
					t.Errorf("second real turn must heal before fixed attack: turn=%d HP=%d MP=%d", e.fight.room.turn, me.HP, me.MP)
				}
			})
			items, heals := 0, 0
			for _, m := range cl.take() {
				if turn, ok := m.(*proto.BattleTurn); ok {
					for _, event := range turn.Events {
						if event.Actor != 0 {
							continue
						}
						if event.Kind == "item" {
							items++
						}
						if event.Kind == "magic" && event.Target == 0 && event.Damage > 0 {
							heals++
						}
					}
				}
			}
			if items != 1 || heals != 1 {
				t.Errorf("wire recovery sequence: MP items=%d HP heals=%d", items, heals)
			}
		})
	}
}
