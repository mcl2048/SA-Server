package world

import (
	"testing"
	"time"

	"sa/server/internal/battle"
	"sa/server/internal/data"
)

func TestAutomationMeatBeforePotionAndSpirit(t *testing.T) {
	w, db, g := setup(t)
	c, _ := petOwner(t, w, db, "meat-priority", 30, 100)
	w.Do(func() {
		e := w.players[int(c.ID)]
		e.inv[data.SlotBody] = w.newItem(g.Items[1001])
		e.inv[9] = w.newItem(g.Items[1500]) // potion before meat in the bag
		e.inv[10] = w.newItem(g.Items[1234])
		foe := enemyFighter(w, petEnemy(t, g, 1), 1, 15)
		foe.HP, foe.MaxHP, foe.Atk, foe.Tactics = 100000, 100000, 0, "gu:1"
		w.startBattleWith(e, []*battle.Fighter{foe}, nil, func(string, []*entity) {})
		me := e.fight.b.F[e.fight.slot]
		me.HP, me.MaxHP, me.MP, me.MaxMP = 10, 200, 100, 100
		a := &autoPlayState{settings: defaultAutoSettings()}
		a.settings.Escape = false
		cmd, _, _ := w.chooseAutomation(e, a)
		if cmd.Kind != battle.UseItem || cmd.ItemSlot != 10 {
			t.Errorf("native meat must precede spirit/potion: %+v", cmd)
			return
		}
		w.battleCommand(e, string(cmd.Kind), cmd.Target, cmd.ItemSlot)
		if me.HP <= 10 || me.MP != 100 || e.inv[10] != nil || e.inv[9] == nil {
			t.Errorf("meat priority did not execute once: HP=%d MP=%d", me.HP, me.MP)
		}
	})
}

func TestAutomationLowMPUsesPotionWithoutHealingSpirit(t *testing.T) {
	w, db, g := setup(t)
	c, _ := petOwner(t, w, db, "mp-without-spirit", 30, 100)
	w.Do(func() {
		e := w.players[int(c.ID)]
		e.inv[9] = w.newItem(g.Items[1510])
		foe := enemyFighter(w, petEnemy(t, g, 1), 1, 15)
		foe.HP, foe.MaxHP, foe.Atk, foe.Tactics = 100000, 100000, 0, "gu:1"
		w.startBattleWith(e, []*battle.Fighter{foe}, nil, func(string, []*entity) {})
		me := e.fight.b.F[e.fight.slot]
		me.HP, me.MaxHP, me.MP, me.MaxMP = 200, 200, 29, 100
		a := &autoPlayState{settings: defaultAutoSettings()}
		a.settings.Escape, a.settings.First = false, autoAction{Kind: "guard"}
		cmd, _, _ := w.chooseAutomation(e, a)
		if cmd.Kind != battle.UseItem || cmd.ItemSlot != 9 {
			t.Errorf("low MP must use potion without requiring equipped spirit: %+v", cmd)
			return
		}
		w.battleCommand(e, string(cmd.Kind), cmd.Target, cmd.ItemSlot)
		if me.MP <= 29 || e.inv[9] != nil {
			t.Errorf("MP potion not consumed: MP=%d", me.MP)
		}
		me.MP = 30
		e.inv[9] = w.newItem(g.Items[1510])
		cmd, _, _ = w.chooseAutomation(e, a)
		if cmd.Kind == battle.UseItem {
			t.Errorf("exact threshold must not consume MP potion: %+v", cmd)
		}
	})
}

func TestAutomationKeywordDiscardIndependentOfBattleMode(t *testing.T) {
	w, db, g := setup(t)
	c, _ := petOwner(t, w, db, "keyword-discard", 30, 100)
	w.Do(func() {
		e := w.players[int(c.ID)]
		s, ok := parseAutoSettings(`{"v":2,"autoDrop":true,"dropKeywords":" 小块肉 | 蕨 || "}`)
		if !ok {
			t.Fatal("valid keyword settings rejected")
		}
		e.automation = &autoPlayState{settings: s}
		// Native meat fixture plus unrelated potion; equipment is never discarded.
		e.inv[0], e.inv[9], e.inv[10] = w.newItem(g.Items[1234]), w.newItem(g.Items[1234]), w.newItem(g.Items[1510])
		w.automationTick(w.now())
		if e.inv[9] != nil || e.inv[0] == nil || e.inv[10] == nil {
			t.Errorf("literal keyword discard must affect only matching bag items: equip=%v meat=%v potion=%v", e.inv[0] != nil, e.inv[9] != nil, e.inv[10] != nil)
		}
		// Whitespace-only segments must never become match-all patterns.
		s, _ = parseAutoSettings(`{"v":2,"autoDrop":true,"dropKeywords":" | || "}`)
		e.automation.settings = s
		w.automationTick(w.now().Add(time.Second))
		if e.inv[10] == nil {
			t.Fatal("empty segments matched unrelated inventory")
		}
	})
}

func TestAutomationKeywordDiscardWaitsForEditingAndTrade(t *testing.T) {
	w, db, g := setup(t)
	c, _ := petOwner(t, w, db, "discard-editing", 30, 100)
	w.Do(func() {
		e := w.players[int(c.ID)]
		s, _ := parseAutoSettings(`{"v":2,"autoDrop":true,"dropKeywords":"小块肉"}`)
		now := w.now()
		e.automation = &autoPlayState{settings: s, paused: true, lastUpdate: now}
		e.inv[9] = w.newItem(g.Items[1234])
		w.automationTick(now)
		if e.inv[9] == nil {
			t.Error("foreground editing discarded partially typed keywords")
			return
		}
		e.trade = &trade{}
		w.automationTick(now.Add(3 * time.Second))
		if e.inv[9] == nil {
			t.Error("trade-reserved bag was mutated")
			return
		}
		e.trade = nil
		w.automationTick(now.Add(4 * time.Second))
		if e.inv[9] != nil {
			t.Error("expired foreground lease prevented idle discard")
		}
	})
}

func TestAutomationKeywordDiscardUsesVisibleNamesWholeStacksAndDefaultsOff(t *testing.T) {
	w, db, g := setup(t)
	c, _ := petOwner(t, w, db, "discard-visible-name", 30, 100)
	w.Do(func() {
		e := w.players[int(c.ID)]
		e.inv[9] = w.newItem(g.Items[1234])
		e.inv[9].Name, e.inv[9].Pile = "石龟的肉", 5
		e.inv[10] = w.newItem(g.Items[1234])
		e.inv[10].Name = "蕨菜"
		e.inv[11] = w.newItem(g.Items[1510])
		s, ok := parseAutoSettings(`{"v":2,"dropKeywords":" 石龟 | 蕨 || "}`)
		if !ok || s.AutoDrop || s.AutoEscape {
			t.Error("new destructive/escape modes must default off")
			return
		}
		e.automation = &autoPlayState{settings: s}
		w.automationTick(w.now())
		if e.inv[9] == nil || e.inv[10] == nil {
			t.Error("disabled keyword discard consumed an item")
			return
		}
		e.automation.settings.AutoDrop = true
		w.automationTick(w.now().Add(time.Second))
		if e.inv[9] != nil || e.inv[10] != nil || e.inv[11] == nil {
			t.Error("multiple visible-name fragments did not remove only matching whole stacks")
		}
	})
}
