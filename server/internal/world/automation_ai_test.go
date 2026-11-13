package world

import (
	"strings"
	"testing"

	"sa/server/internal/battle"
	"sa/server/internal/data"
)

func TestAutomationPlansEmergencyCaptureAndPetSafety(t *testing.T) {
	w, db, g := setup(t)
	c, _ := petOwner(t, w, db, "auto-plans", 30, 100)
	id := int(c.ID)
	ene := petEnemy(t, g, 1)
	givePet(t, w, id, ene, 10)
	w.Do(func() {
		e := w.players[id]
		e.pets.Battle = 0
		e.pets.Pets[0].HP = 10000
		f := enemyFighter(w, ene, 1, battle.EnemySlot(0))
		f.HP, f.MaxHP = 10000, 10000
		f.Atk = 0
		f.Tactics = "gu:1"
		w.startBattleWith(e, []*battle.Fighter{f}, nil, func(string, []*entity) {})
		ft := e.fight
		pet := ft.b.F[ft.slot+5]
		pet.Skills[0] = &data.Skill{ID: 1, Func: "PETSKILL_NormalAttack", Target: 1}
		pet.Skills[1] = &data.Skill{ID: 2, Func: "PETSKILL_NormalGuard", Target: 0}
		pet.Skills[2] = &data.Skill{ID: 999, Func: "PETSKILL_ShowMercy", Target: 1}
		a := &autoPlayState{settings: defaultAutoSettings()}
		a.settings.Escape = false
		a.settings.First = autoAction{Kind: "guard"}
		a.settings.PetFirst = autoAction{Kind: "attack"}
		cmd, skill, _ := w.chooseAutomation(e, a)
		if cmd.Kind != battle.Guard || skill != 0 {
			t.Fatalf("first plans lost: %s / skill %d", cmd.Kind, skill)
		}
		ft.room.turn = 1
		a.settings.Then = autoAction{Kind: "attack"}
		a.settings.PetThen = autoAction{Kind: "guard"}
		cmd, skill, _ = w.chooseAutomation(e, a)
		if cmd.Kind != battle.Attack || skill != 1 {
			t.Fatalf("subsequent plans lost: %s / skill %d", cmd.Kind, skill)
		}
		a.settings.Capture = true
		a.settings.PetThen = autoAction{Kind: "attack"}
		cmd, skill, target := w.chooseAutomation(e, a)
		if cmd.Kind != battle.Capture || skill != 2 || target != f.Slot {
			t.Fatalf("capture failed to override dangerous pet plan: %s / %d target %d", cmd.Kind, skill, target)
		}
	})
}
func TestAutomationRecoveryUsesOriginalItemValidation(t *testing.T) {
	w, db, g := setup(t)
	c, _ := petOwner(t, w, db, "auto-heal", 30, 100)
	id := int(c.ID)
	ene := petEnemy(t, g, 1)
	w.Do(func() {
		e := w.players[id]
		f := enemyFighter(w, ene, 5, battle.EnemySlot(0))
		f.HP, f.MaxHP = 10000, 10000
		f.Atk = 0
		f.Tactics = "gu:1"
		w.startBattleWith(e, []*battle.Fighter{f}, nil, func(string, []*entity) {})
		me := e.fight.b.F[e.fight.slot]
		me.HP = 1
		slot := data.EquipSlots
		for _, def := range g.Items {
			if def.UseFunc == "ITEM_useRecovery" && def.Field != 2 && strings.HasPrefix(def.Argument, "体") {
				e.inv[slot] = w.newItem(def)
				break
			}
		}
		if e.inv[slot] == nil {
			t.Fatal("expected native recovery item fixture")
		}
		a := &autoPlayState{settings: defaultAutoSettings()}
		cmd, _, _ := w.chooseAutomation(e, a)
		if cmd.Kind != battle.UseItem || cmd.ItemSlot != slot || cmd.Target != me.Slot {
			t.Fatalf("emergency healing not selected: %+v", cmd)
		}
		// Feed it through the same validator used by actual incoming commands.
		w.battleCommand(e, string(cmd.Kind), cmd.Target, cmd.ItemSlot)
		if e.fight == nil || e.fight.room.turn != 1 {
			t.Fatal("native item command did not resolve")
		}
		if me.HP <= 1 {
			t.Fatal("native battle item did not heal")
		}
	})
}
func TestAutomationWholeSideHealingAndTargetValidation(t *testing.T) {
	w, db, g := setup(t)
	c, _ := petOwner(t, w, db, "auto-group-heal", 30, 100)
	id := int(c.ID)
	ene := petEnemy(t, g, 1)
	givePet(t, w, id, ene, 10)
	w.Do(func() {
		e := w.players[id]
		e.pets.Battle = 0
		e.pets.Pets[0].HP = 100
		// Clone fixture definitions instead of modifying the shared loaded game.
		copyGame := *w.game
		copyBattle := *g.Battle
		copyGame.Battle = &copyBattle
		copyBattle.Magics = map[int]*data.Magic{}
		for id, m := range g.Battle.Magics {
			copyBattle.Magics[id] = m
		}
		w.game = &copyGame
		magic := &data.Magic{ID: 654321, Name: "测试全体治疗", Func: "MAGIC_OtherRecovery", Option: "100", Target: data.MagicTargetAllMySide}
		copyBattle.Magics[magic.ID] = magic
		for _, def := range g.Items {
			e.inv[0] = w.newItem(def)
			break
		}
		e.inv[0].Magic = &[2]int{magic.ID, 1}
		f := enemyFighter(w, ene, 5, battle.EnemySlot(0))
		f.HP, f.MaxHP = 10000, 10000
		f.Atk = 0
		f.Tactics = "gu:1"
		w.startBattleWith(e, []*battle.Fighter{f}, nil, func(string, []*entity) {})
		ft := e.fight
		me, pet := ft.b.F[ft.slot], ft.b.F[ft.slot+5]
		me.HP, pet.HP, me.MP = 1, 1, 10000
		a := &autoPlayState{settings: defaultAutoSettings()}
		cmd, _, _ := w.chooseAutomation(e, a)
		if cmd.Kind != battle.Magic || cmd.Target != 20 {
			t.Fatalf("whole side heal not selected: %+v", cmd)
		}
		w.battlePetCommand(e, -1, -1, pet.Slot)
		w.battleCommand(e, string(cmd.Kind), cmd.Target, cmd.ItemSlot)
		if me.HP <= 1 || pet.HP <= 1 {
			t.Fatalf("native group heal failed: me %d pet %d", me.HP, pet.HP)
		}
		// Wrong side remains invalid at the command boundary, despite being a
		// syntactically valid group target.
		w.battlePetCommand(e, -1, -1, pet.Slot)
		me.HP, pet.HP = 1, 1
		w.battleCommand(e, "magic", 21, 0)
		if me.HP > 1 || pet.HP > 1 {
			t.Fatal("wrong-side group command was executed")
		}
	})
	for _, kind := range []int{data.MagicTargetAllMySide, data.MagicTargetAllOtherSide, data.MagicTargetWholeOtherSide, data.MagicTargetAllRows} {
		if !magicTargetValid(&data.Magic{Target: kind}, 20) || !magicTargetValid(&data.Magic{Target: kind}, 21) {
			t.Fatalf("valid side target rejected for magic type %d", kind)
		}
	}
	for _, kind := range []int{data.MagicTargetMyself, data.MagicTargetSingle, data.MagicTargetOneRow} {
		if magicTargetValid(&data.Magic{Target: kind}, 20) {
			t.Fatalf("invalid side target allowed for magic type %d", kind)
		}
	}
}

func TestAutomationSkillSafetyAndTargets(t *testing.T) {
	for _, funcName := range []string{"PETSKILL_Sacrifice", "PETSKILL_Steal", "PETSKILL_Abduct", "PETSKILL_None"} {
		if automationSkillFactor(&data.Skill{Func: funcName}) != 0 {
			t.Fatalf("unsafe implicit skill allowed %s", funcName)
		}
	}
	if automationSkillFactor(&data.Skill{Func: "PETSKILL_NormalAttack"}) != 1 {
		t.Fatal("normal attack prior")
	}
	me := &battle.Fighter{Slot: 0, HP: 100}
	pet := &battle.Fighter{Slot: 5, HP: 0}
	if automationMagicTarget(1, "pet", me, pet, 15, 20, 21) != -1 {
		t.Fatal("targeted dead pet for ordinary magic")
	}
	if automationMagicTarget(10, "enemy", me, pet, 15, 20, 21) != 24 {
		t.Fatal("enemy back row target incorrect")
	}
	if automationPetTarget(0, "enemy", 0, 5, 15, 20, 21) != 5 {
		t.Fatal("self-only pet skill incorrectly targeted enemy")
	}
}
