package world

import (
	"fmt"
	"testing"

	"sa/server/internal/battle"
	"sa/server/internal/data"
)

func TestMultiPetRetiredKillExpiresAfterEnemyRevivesAndDiesAgain(t *testing.T) {
	for _, share := range []bool{false, true} {
		for _, sameOwner := range []bool{false, true} {
			t.Run(fmt.Sprintf("share=%v/sameOwner=%v", share, sameOwner), func(t *testing.T) {
				w, db, g := setup(t)
				a, _ := petOwner(t, w, db, "retireexpireA", 30, 100)
				b, _ := petOwner(t, w, db, "retireexpireB", 30, 100)
				w.Do(func() {
					w.Rules.ShareExp = share
					room := &battleRoom{b: battle.New(w.rnd)}
					ea, eb := w.players[int(a.ID)], w.players[int(b.ID)]
					for _, e := range []*entity{ea, eb} {
						for bag := range e.pets.Pets {
							e.pets.Pets[bag] = petFromFighter(enemyFighter(w, petEnemy(t, g, 1), 20, 15), e.char.ID)
						}
						e.pets.Battle, e.pets.Standby = 0, 30
					}
					w.joinRoom(room, ea, 0)
					victim := &battle.Fighter{Slot: 15, Name: "revived enemy", Level: 20, HP: 100, MaxHP: 100, Exp: 1000, Tactics: "gu:1"}
					room.b.Add(victim)
					victim.HP, victim.KilledBy = 0, 9
					healer := &battle.Fighter{Slot: 16, Name: "enemy healer", Level: 20, HP: 10000, MaxHP: 10000, Quick: 1000, Tactics: "wa:1"}
					healer.Skills[0] = &data.Skill{Name: "revive", Func: "ENEMYSKILL_ReLife"}
					room.b.Add(healer)
					w.joinRoom(room, eb, 1)
					if len(ea.fight.retiredKills()) != 1 {
						t.Fatal("initial retired kill contribution was lost")
					}
					if char, _, _ := w.battleExp(ea, ea.fight); share && char <= 0 || !share && char != 0 {
						t.Fatalf("retired contribution changed original sharing: %d", char)
					}
					if ea.fight.retiredPets[0].killToken == ea.fight.retiredPets[1].killToken {
						t.Fatal("different retirements reused a kill token")
					}
					cmds := map[int]battle.Command{}
					for _, e := range room.members {
						cmds[e.fight.slot] = battle.Command{Kind: battle.Guard}
						for _, slot := range e.fight.petSlots() {
							room.b.F[slot].Loyalty = 100
							cmds[slot] = battle.Command{Kind: battle.Guard}
						}
					}
					revived := false
					for _, event := range room.b.Resolve(cmds) {
						if event.Kind == battle.Revive && event.Target == victim.Slot {
							revived = true
						}
					}
					if !revived || victim.HP <= 0 {
						t.Fatal("fixture did not execute enemy resurrection")
					}
					if len(ea.fight.retiredKills()) != 0 {
						t.Fatal("living revived enemy still counts as a retired kill")
					}
					winner := eb
					if sameOwner {
						winner = ea
					}
					victim.HP, victim.KilledBy = 0, winner.fight.slot+5
					if len(ea.fight.retiredKills()) != 0 {
						t.Fatal("new death retained stale retirement credit")
					}
					for _, e := range []*entity{ea, eb} {
						char, pet, _ := w.battleExp(e, e.fight)
						if share && (e == winner && char != 1000 || e != winner && char != 0) {
							t.Fatalf("wrong shared character award: owner%d exp%d", e.fight.slot, char)
						}
						for _, result := range w.petResult(e, e.fight, pet) {
							want := 0
							if e == winner && (share || result.Slot == 0) {
								want = 1000
							}
							if e == ea && result.Slot >= 3 {
								want = 0
							} // Retired pets never claim the new death.
							if result.Exp != want {
								t.Fatalf("duplicate/stale death reward owner%d bag%d got%d want%d", e.fight.slot, result.Slot, result.Exp, want)
							}
						}
					}
				})
			})
		}
	}
}

func TestMultiPetRescueDoesNotInheritEscapedOwnersKills(t *testing.T) {
	for _, share := range []bool{false, true} {
		t.Run(fmt.Sprint(share), func(t *testing.T) {
			w, db, g := setup(t)
			var members []*entity
			for i := 0; i < 3; i++ {
				c, _ := petOwner(t, w, db, fmt.Sprintf("escapedkill%d", i), 30, 100)
				w.Do(func() {
					e := w.players[int(c.ID)]
					for bag := range e.pets.Pets {
						e.pets.Pets[bag] = petFromFighter(enemyFighter(w, petEnemy(t, g, 1), 20, 15), e.char.ID)
					}
					e.pets.Battle, e.pets.Standby = 0, 30
					members = append(members, e)
				})
			}
			w.Do(func() {
				w.Rules.ShareExp = share
				room := &battleRoom{b: battle.New(w.rnd)}
				w.joinRoom(room, members[0], 0, true)
				w.joinRoom(room, members[1], 1, true)
				w.balanceBattlePets(room, 0)
				dead := &battle.Fighter{Slot: 15, Level: 20, HP: 100, MaxHP: 100, Exp: 1000}
				room.b.Add(dead)
				dead.HP, dead.KilledBy = 0, 5
				leaving := members[0]
				room.b.F[0].Escaped = true
				for _, slot := range leaving.fight.petSlots() {
					room.b.F[slot].Escaped = true
				}
				room.removeMember(leaving)
				w.endMember(leaving, -1)
				pending := &battle.Command{Kind: battle.Attack, Target: 5}
				members[1].fight.cmd = pending
				w.rescueEntry(members[2], members[1])
				if dead.KilledBy != -1 || pending.Target != -1 {
					t.Fatalf("discarded old pet slot retained references: killer%d target%d", dead.KilledBy, pending.Target)
				}
				if pf := room.b.F[5]; pf == nil || pf.OwnerSlot != members[1].fight.slot {
					t.Fatal("fixture did not reuse the departed player's slot")
				}
				for _, e := range members[1:] {
					char, pet, _ := w.battleExp(e, e.fight)
					if char != 0 || pet != 0 {
						t.Fatalf("departed owner kill became shared reward: %d/%d", char, pet)
					}
					for _, result := range w.petResult(e, e.fight, pet) {
						if result.Exp != 0 {
							t.Fatalf("new occupant inherited old kill: %+v", result)
						}
					}
				}
			})
		})
	}
}
