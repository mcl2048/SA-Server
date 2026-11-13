package world

import (
	"testing"
	"time"

	"sa/server/internal/battle"
	"sa/server/internal/data"
	"sa/server/internal/proto"
)

func TestAutomationPartyProtectsCaptureBeforeEitherSubmissionOrder(t *testing.T) {
	for _, tc := range []struct {
		name                                 string
		otherEnemy, ownerDown, manualCapture bool
	}{
		{"only-target", false, false, false},
		{"safe-other-target", true, false, false},
		{"downed-owner-pet", false, true, false},
		{"pending-manual-capture", false, false, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			w, db, g := setup(t)
			ca, _ := petOwner(t, w, db, "protect-leader-"+tc.name, 30, 100)
			cb, _ := petOwner(t, w, db, "protect-member-"+tc.name, 30, 100)
			a, b := int(ca.ID), int(cb.ID)
			ene := petEnemy(t, g, 1)
			givePet(t, w, a, ene, 20)
			w.Do(func() {
				leader, capturer := w.players[a], w.players[b]
				w.joinPartyMain(capturer, leader)
				leader.pets.Battle = 0
				capture := enemyFighter(w, ene, 1, 15)
				capture.HP, capture.MaxHP, capture.Atk, capture.Tactics = 1, 500, 0, "gu:1"
				capture.Seed.Capture = true
				enemies := []*battle.Fighter{capture}
				if tc.otherEnemy {
					other := enemyFighter(w, ene, 5, 16)
					other.HP, other.MaxHP, other.Atk, other.Tactics = 100000, 100000, 0, "gu:1"
					enemies = append(enemies, other)
				}
				w.startBattleWith(leader, enemies, nil, func(string, []*entity) {})
				ft := leader.fight
				pet := ft.b.F[ft.slot+5]
				pet.HP, pet.MaxHP = 10000, 10000
				pet.Skills = [7]*data.Skill{
					{ID: 1, Func: "PETSKILL_NormalAttack", Field: 1, Target: 1},
					{ID: 2, Func: "PETSKILL_NormalGuard", Field: 1, Target: 0},
					{ID: 903, Name: "范围攻击", Func: "PETSKILL_AttackMagic", Field: 1, Target: 3},
				}
				for _, e := range []*entity{leader, capturer} {
					me := e.fight.b.F[e.fight.slot]
					me.HP, me.MaxHP = 10000, 10000
				}
				leader.automation = &autoPlayState{autoBattle: true, quick: true, settings: defaultAutoSettings()}
				leader.automation.settings.Escape = false
				leader.automation.settings.First = autoAction{Kind: "attack"}
				leader.automation.settings.PetFirst = autoAction{Kind: "skill", Name: "范围攻击"}
				capturer.automation = &autoPlayState{autoBattle: true, settings: defaultAutoSettings()}
				capturer.automation.settings.Capture = true
				capturer.automation.settings.Escape = false
				if !w.canCapture(capturer, capture) {
					t.Fatal("invalid native capture fixture")
				}
				if tc.ownerDown {
					ft.b.F[ft.slot].HP = 0
				}
				if tc.manualCapture {
					capturer.automation.autoBattle = false
					w.battleCommand(capturer, "capture", 15, -1)
					if capturer.fight.cmd == nil || capturer.fight.cmd.Kind != battle.Capture {
						t.Fatal("manual capture was not queued")
					}
				}
				cmd, skill, target := w.chooseAutomation(leader, leader.automation)
				if tc.otherEnemy {
					if cmd.Kind != battle.Attack || cmd.Target != 16 || skill != 0 || target != 16 {
						t.Fatalf("unsafe AoE/fixed pet plan: player %+v pet %d/%d", cmd, skill, target)
					}
				} else if cmd.Kind != battle.Guard || skill != 1 || target != 5 {
					t.Fatalf("attacked teammate capture target: player %+v pet %d/%d", cmd, skill, target)
				}
			})
		})
	}
}

func TestAutomationMixedPartyQuickAndAutoNeverDamageCaptureTarget(t *testing.T) {
	w, db, g := setup(t)
	ca, cla := petOwner(t, w, db, "capture-quick-leader", 30, 100)
	cb, _ := petOwner(t, w, db, "capture-auto-member", 30, 100)
	a, b := int(ca.ID), int(cb.ID)
	w.Do(func() {
		leader, capturer := w.players[a], w.players[b]
		w.joinPartyMain(capturer, leader)
		capture := enemyFighter(w, petEnemy(t, g, 1), 1, 15)
		capture.HP, capture.MaxHP, capture.Atk, capture.Tactics = 1, 500, 0, "gu:1"
		capture.Seed.Capture = true
		w.startBattleWith(leader, []*battle.Fighter{capture}, nil, func(string, []*entity) {})
		for _, e := range []*entity{leader, capturer} {
			me := e.fight.b.F[e.fight.slot]
			me.HP, me.MaxHP = 10000, 10000
		}
		leader.automation = &autoPlayState{quick: true, settings: defaultAutoSettings()}
		leader.automation.settings.Escape = false
		capturer.automation = &autoPlayState{autoBattle: true, settings: defaultAutoSettings()}
		capturer.automation.settings.Capture, capturer.automation.settings.Escape = true, false
		room := leader.fight.room
		now := w.now()
		w.automationTick(now)
		w.automationTick(now.Add(time.Second))
		if room.turn != 0 {
			t.Fatal("quick player advanced before auto teammate submitted")
		}
		w.automationTick(now.Add(4 * time.Second))
		if room.turn != 1 {
			t.Fatalf("mixed party did not resolve once: %d", room.turn)
		}
	})
	seen := false
	for _, m := range cla.take() {
		if turn, ok := m.(*proto.BattleTurn); ok {
			for _, ev := range turn.Events {
				if ev.Actor == 0 && ev.Target == 15 && (ev.Kind == "attack" || ev.Kind == "magic" || ev.Kind == "skill") {
					t.Fatalf("quick teammate hit capture target: %+v", ev)
				}
				if ev.Actor == 1 && ev.Kind == "capture" {
					seen = true
				}
			}
		}
	}
	if !seen {
		t.Fatal("real capture command did not execute")
	}
}

func TestAutomationRecoveryChoosesSufficientSpellWithLeastWaste(t *testing.T) {
	w, db, g := setup(t)
	c, _ := petOwner(t, w, db, "heal-cost", 30, 100)
	w.Do(func() {
		e := w.players[int(c.ID)]
		copyGame, copyBattle := *w.game, *g.Battle
		copyGame.Battle = &copyBattle
		copyBattle.Magics = make(map[int]*data.Magic, len(g.Battle.Magics)+2)
		for id, m := range g.Battle.Magics {
			copyBattle.Magics[id] = m
		}
		copyBattle.Magics[654330] = &data.Magic{ID: 654330, Name: "小回复", Func: "MAGIC_OtherRecovery", Option: "100", Target: 1}
		copyBattle.Magics[654331] = &data.Magic{ID: 654331, Name: "大回复", Func: "MAGIC_OtherRecovery", Option: "1000", Target: 1}
		w.game = &copyGame
		for _, def := range g.Items {
			e.inv[0], e.inv[1] = w.newItem(def), w.newItem(def)
			break
		}
		e.inv[0].Magic, e.inv[1].Magic = &[2]int{654330, 5}, &[2]int{654331, 100}
		enemy := enemyFighter(w, petEnemy(t, g, 1), 5, 15)
		enemy.HP, enemy.MaxHP, enemy.Atk, enemy.Tactics = 100000, 100000, 0, "gu:1"
		w.startBattleWith(e, []*battle.Fighter{enemy}, nil, func(string, []*entity) {})
		me := e.fight.b.F[e.fight.slot]
		me.HP, me.MaxHP, me.MP = 440, 500, 100
		a := &autoPlayState{settings: defaultAutoSettings()}
		a.settings.HealAt, a.settings.Escape = 100, false
		cmd, _, _ := w.chooseAutomation(e, a)
		if cmd.Kind != battle.Magic || cmd.ItemSlot != 0 {
			t.Fatalf("wasted MP on oversized heal: %+v", cmd)
		}
		me.HP = 50
		cmd, _, _ = w.chooseAutomation(e, a)
		if cmd.Kind != battle.Magic || cmd.ItemSlot != 1 {
			t.Fatalf("insufficient small heal chosen: %+v", cmd)
		}
		w.battleCommand(e, string(cmd.Kind), cmd.Target, cmd.ItemSlot)
		if me.HP != 500 || me.MP != 0 {
			t.Fatalf("actual recovery mismatched: HP=%d MP=%d", me.HP, me.MP)
		}
	})
}

func TestAutomationPartyCaptureSurvivesAttackRetargeting(t *testing.T) {
	w, db, g := setup(t)
	ca, cla := petOwner(t, w, db, "capture-retarget-leader", 30, 100)
	cb, _ := petOwner(t, w, db, "capture-retarget-member", 30, 100)
	a, b := int(ca.ID), int(cb.ID)
	ene := petEnemy(t, g, 1)
	givePet(t, w, a, ene, 20)
	w.Do(func() {
		leader, capturer := w.players[a], w.players[b]
		w.joinPartyMain(capturer, leader)
		leader.pets.Battle = 0
		capture, other := enemyFighter(w, ene, 1, 15), enemyFighter(w, ene, 5, 16)
		capture.HP, capture.MaxHP, capture.Atk, capture.Tactics = 1, 500, 0, "gu:1"
		capture.Seed.Capture = true
		other.HP, other.MaxHP, other.Def, other.Atk, other.Tactics = 1, 500, 0, 0, "gu:1"
		w.startBattleWith(leader, []*battle.Fighter{capture, other}, nil, func(string, []*entity) {})
		room := leader.fight.room
		for _, e := range []*entity{leader, capturer} {
			me := room.b.F[e.fight.slot]
			me.HP, me.MaxHP = 10000, 10000
		}
		me, pet := room.b.F[0], room.b.F[5]
		me.Atk, me.FixAtk, me.Quick, me.FixQuick = 10000, 10000, 2000, 2000
		me.Weapon, me.AttackMin, me.AttackMax = data.ItemFist, 1, 1
		pet.HP, pet.MaxHP, pet.Atk, pet.FixAtk, pet.Quick, pet.FixQuick, pet.Loyalty = 10000, 10000, 10000, 10000, 1000, 1000, 100
		pet.Skills = [7]*data.Skill{{ID: 1, Func: "PETSKILL_NormalAttack", Field: 1, Target: 1}, {ID: 2, Func: "PETSKILL_NormalGuard", Field: 1, Target: 0}}
		leader.automation = &autoPlayState{quick: true, settings: defaultAutoSettings()}
		leader.automation.settings.Escape = false
		capturer.automation = &autoPlayState{autoBattle: true, settings: defaultAutoSettings()}
		capturer.automation.settings.Capture, capturer.automation.settings.Escape = true, false
		now := w.now()
		w.automationTick(now)
		w.automationTick(now.Add(4 * time.Second))
		if room.turn != 1 || other.HP > 0 || capture.HP <= 0 {
			t.Fatalf("capture retarget safety failed: turn=%d otherHP=%d captureHP=%d", room.turn, other.HP, capture.HP)
		}
	})
	seenCapture := false
	for _, m := range cla.take() {
		if turn, ok := m.(*proto.BattleTurn); ok {
			for _, ev := range turn.Events {
				if (ev.Actor == 0 || ev.Actor == 5) && ev.Target == 15 && (ev.Kind == "attack" || ev.Kind == "magic" || ev.Kind == "skill") {
					t.Fatalf("automatic action retargeted onto capture: %+v", ev)
				}
				seenCapture = seenCapture || ev.Actor == 1 && ev.Kind == "capture"
			}
		}
	}
	if !seenCapture {
		t.Fatal("capture did not execute after safe attack")
	}
}

func TestAutomationPartyAssignsDistinctCaptureTargets(t *testing.T) {
	w, db, g := setup(t)
	ca, _ := petOwner(t, w, db, "capture-distinct-a", 30, 100)
	cb, _ := petOwner(t, w, db, "capture-distinct-b", 30, 100)
	w.Do(func() {
		a, b := w.players[int(ca.ID)], w.players[int(cb.ID)]
		w.joinPartyMain(b, a)
		enemies := []*battle.Fighter{}
		for _, slot := range []int{15, 16} {
			f := enemyFighter(w, petEnemy(t, g, 1), 1, slot)
			f.HP, f.MaxHP, f.Atk, f.Tactics, f.Seed.Capture = 1, 500, 0, "gu:1", true
			enemies = append(enemies, f)
		}
		w.startBattleWith(a, enemies, nil, func(string, []*entity) {})
		for _, e := range []*entity{a, b} {
			me := e.fight.b.F[e.fight.slot]
			me.HP, me.MaxHP = 10000, 10000
			e.automation = &autoPlayState{autoBattle: true, settings: defaultAutoSettings()}
			e.automation.settings.Capture, e.automation.settings.Escape = true, false
		}
		first, _, _ := w.chooseAutomation(a, a.automation)
		second, _, _ := w.chooseAutomation(b, b.automation)
		if first.Kind != battle.Capture || first.Target != 15 || second.Kind != battle.Capture || second.Target != 16 {
			t.Fatalf("duplicate capture decisions: first=%+v second=%+v", first, second)
		}
		w.battleCommand(b, "capture", second.Target, -1, true)
		first, _, _ = w.chooseAutomation(a, a.automation)
		if first.Kind != battle.Capture || first.Target != 15 {
			t.Fatalf("reversed submission changed reservation: %+v", first)
		}
	})
}

func TestAutomationPetsHonorCaptureSubmittedBeforeEnablingAuto(t *testing.T) {
	w, db, g := setup(t)
	c, cl := petOwner(t, w, db, "capture-before-auto", 30, 100)
	id := int(c.ID)
	ene := petEnemy(t, g, 1)
	givePet(t, w, id, ene, 20)
	w.Do(func() {
		e := w.players[id]
		e.pets.Battle = 0
		target := enemyFighter(w, ene, 1, 15)
		target.HP, target.MaxHP, target.Atk, target.Tactics, target.Seed.Capture = 1, 500, 0, "gu:1", true
		w.startBattleWith(e, []*battle.Fighter{target}, nil, func(string, []*entity) {})
		me, pet := e.fight.b.F[0], e.fight.b.F[5]
		me.HP, me.MaxHP, me.Quick, me.FixQuick = 10000, 10000, 0, 0
		pet.HP, pet.MaxHP, pet.Quick, pet.FixQuick, pet.Loyalty = 10000, 10000, 2000, 2000, 100
		pet.Skills = [7]*data.Skill{{ID: 1, Func: "PETSKILL_NormalAttack", Field: 1, Target: 1}, {ID: 2, Func: "PETSKILL_NormalGuard", Field: 1, Target: 0}, {ID: 999, Name: "手下留情", Func: "PETSKILL_ShowMercy", Field: 1, Target: 1}}
		w.battleCommand(e, "capture", 15, -1)
		if e.fight.cmd == nil || e.fight.cmd.Kind != battle.Capture || e.fight.cmd.Automatic {
			t.Fatal("pre-existing manual capture was not queued")
		}
		e.automation = &autoPlayState{quick: true, settings: defaultAutoSettings()}
		e.automation.settings.PetFirst = autoAction{Kind: "attack"}
		now := w.now()
		w.automationTick(now)
		w.automationTick(now.Add(time.Second))
	})
	mercy, capture := false, false
	for _, m := range cl.take() {
		if turn, ok := m.(*proto.BattleTurn); ok {
			for _, ev := range turn.Events {
				mercy = mercy || ev.Actor == 5 && ev.Target == 15 && ev.Skill == "手下留情"
				capture = capture || ev.Actor == 0 && ev.Target == 15 && ev.Kind == "capture"
			}
		}
	}
	if !mercy || !capture {
		t.Fatalf("auto pets did not honor queued capture: mercy=%v capture=%v", mercy, capture)
	}
}
