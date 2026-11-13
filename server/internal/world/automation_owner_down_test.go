package world

import (
	"sa/server/internal/battle"
	"sa/server/internal/data"
	"sa/server/internal/proto"
	"testing"
	"time"
)

func TestAutomationPartyOwnerDownAndPVPNegativeControl(t *testing.T) {
	b := &battle.Battle{}
	b.F[0] = &battle.Fighter{Slot: 0, HP: 0, MaxHP: 500}
	b.F[1] = &battle.Fighter{Slot: 1, HP: 500, MaxHP: 500}
	b.F[5] = &battle.Fighter{Slot: 5, HP: 500, MaxHP: 500, Skills: [7]*data.Skill{{ID: 2, Func: "PETSKILL_NormalGuard", Target: 0}, {ID: 1, Func: "PETSKILL_NormalAttack", Target: 1}, {ID: 3, Func: "PETSKILL_Guardian", Target: 1}}}
	b.F[10] = &battle.Fighter{Slot: 10, HP: 500, MaxHP: 500}
	e := &entity{}
	other := &entity{}
	room := &battleRoom{b: b, members: []*entity{e, other}}
	ft := &fight{room: room, b: b, slot: 0, pet: 0, pets: map[int]int{5: 0}}
	e.fight = ft
	w := &World{}
	a := &autoPlayState{settings: defaultAutoSettings()}
	cmd, skill, target := w.chooseAutomation(e, a)
	if cmd.Kind == battle.Escape || skill != 1 || target != 10 {
		t.Fatalf("party pet inherited dead owner intent: %s/%d/%d", cmd.Kind, skill, target)
	}
	// PvP does not get the PvE exception. No automatic command may be installed.
	room.pvp = true
	w.automationBattle(e, a, time.Now().Add(time.Hour))
	if ft.cmd != nil || ft.petCmd != nil || len(ft.petCmds) > 0 {
		t.Fatal("PvP auto submitted a command")
	}
	skill, target = w.chooseAutomationPet(e, a, 5, battle.Command{Kind: battle.Escape})
	if skill != 0 || target != 5 {
		t.Fatal("existing explicit escape pet rule changed in PvP")
	}
}

func TestAutomationOwnerDownPetsContinue(t *testing.T) {
	for _, quick := range []bool{false, true} {
		name := "auto"
		if quick {
			name = "quick"
		}
		t.Run(name, func(t *testing.T) {
			w, db, g := setup(t)
			c, cl := petOwner(t, w, db, "down-"+name, 40, 100)
			id := int(c.ID)
			ene := petEnemy(t, g, 1)
			for i := 0; i < 3; i++ {
				givePet(t, w, id, ene, 20)
			}
			w.Do(func() {
				e := w.players[id]
				e.pets.Battle = 0
				e.pets.Standby = 7
				for _, p := range e.pets.Pets {
					if p != nil {
						p.HP = 10000
					}
				}
				enemy := enemyFighter(w, ene, 10, battle.EnemySlot(0))
				enemy.HP = 1000000
				enemy.MaxHP = 1000000
				enemy.Atk = 0
				enemy.Tactics = "gu:1"
				w.startBattleWith(e, []*battle.Fighter{enemy}, nil, func(string, []*entity) {})
				ft := e.fight
				me := ft.b.F[ft.slot]
				a := &autoPlayState{autoBattle: true, quick: quick, settings: defaultAutoSettings()}
				// Alive-owner emergency escaping remains unchanged.
				me.HP = 1
				cmd, _, _ := w.chooseAutomation(e, a)
				if cmd.Kind != battle.Escape {
					t.Fatalf("alive emergency escape changed: %s", cmd.Kind)
				}
				me.HP = 0
				slots := ft.petSlots()
				if len(slots) != 3 {
					t.Fatal(slots)
				}
				for _, slot := range slots {
					p := ft.b.F[slot]
					p.HP = p.MaxHP
					p.MP = 0
					p.Skills = [7]*data.Skill{{ID: 2, Func: "PETSKILL_NormalGuard", Target: 0}, {ID: 3, Func: "PETSKILL_Guardian", Target: 1}, {ID: 1, Func: "PETSKILL_NormalAttack", Target: 1}}
				}
				// Healthy pets attack; a different skill order/empty set cannot inherit
				// another pet's chosen skill slot. A critically injured pet may guard.
				low := ft.b.F[slots[1]]
				low.HP = 1
				empty := ft.b.F[slots[2]]
				empty.Skills = [7]*data.Skill{}
				cmd, _, _ = w.chooseAutomation(e, a)
				if cmd.Kind == battle.Escape || cmd.Kind == battle.Capture {
					t.Fatalf("dead owner generated intent: %s", cmd.Kind)
				}
				for i, slot := range slots {
					skill, target := w.chooseAutomationPet(e, a, slot, cmd)
					want := []int{2, 0, -1}[i]
					if skill != want {
						t.Fatalf("pet %d got %d want %d", i, skill, want)
					}
					if i == 0 && target != enemy.Slot {
						t.Fatalf("healthy pet targets %d", target)
					}
				}
				e.automation = a
				now := w.now()
				w.automationTick(now)
				w.automationTick(now.Add(5 * time.Second))
				if e.fight == nil || ft.room.turn != 1 {
					t.Fatal("pet-only round failed to resolve")
				}
			})
			attacks := 0
			for _, m := range cl.take() {
				if turn, ok := m.(*proto.BattleTurn); ok {
					for _, event := range turn.Events {
						if event.Kind == "attack" {
							attacks++
						}
					}
				}
			}
			if attacks == 0 {
				t.Fatal("automatic surviving pet never attacked")
			}
		})
	}
}
