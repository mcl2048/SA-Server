package world

import (
	"fmt"
	"sa/server/internal/battle"
	"sa/server/internal/proto"
	"testing"
)

func TestMultiPetQuotasPreserveFightersAndOwnership(t *testing.T) {
	w, db, g := setup(t)
	owners := make([]int, 5)
	for i := range owners {
		c, _ := petOwner(t, w, db, fmt.Sprintf("multipet%d", i), 30, 100)
		owners[i] = int(c.ID)
	}
	w.Do(func() {
		enemy := petEnemy(t, g, 1)
		for _, id := range owners {
			e := w.players[id]
			for bag := range e.pets.Pets {
				e.pets.Pets[bag] = petFromFighter(enemyFighter(w, enemy, 20, 15), e.char.ID)
			}
			e.pets.Battle = 0
			e.pets.Standby = 30
		}
		room := &battleRoom{b: battle.New(w.rnd)}
		quotas := [][]int{{5}, {3, 2}, {2, 2, 1}, {2, 1, 1, 1}, {1, 1, 1, 1, 1}}
		var first, target *battle.Fighter
		var pending *battle.Command
		for n, id := range owners {
			if n > 0 {
				first.HP = 17
				first.Absorb = 2
			}
			w.joinRoom(room, w.players[id], n)
			if n == 0 {
				first = room.b.F[5]
				target = room.b.F[6]
				pending = &battle.Command{Kind: battle.Attack, Target: 6}
				w.players[id].fight.petCmds[5] = pending
				w.players[id].fight.petCmd = pending
			}
			if n == 1 && pending.Target != target.Slot {
				t.Fatalf("pending target not remapped atomically: target%d now%d", pending.Target, target.Slot)
			}
			if room.b.F[5] != first || (n > 0 && (first.HP != 17 || first.Absorb != 2)) {
				t.Fatal("joining teammate refreshed/replaced existing primary")
			}
			for i, want := range quotas[n] {
				ft := w.players[owners[i]].fight
				if len(ft.pets) != want {
					t.Fatalf("%d owners, member%d pets=%v want%d", n+1, i, ft.pets, want)
				}
				for slot, bag := range ft.pets {
					pf := room.b.F[slot]
					if pf == nil || pf.OwnerSlot != ft.slot || !pf.OwnerSet || room.member(slot) != w.players[owners[i]] || bag < 0 || bag >= PetSlots {
						t.Fatalf("invalid pet ownership slot%d: %+v", slot, pf)
					}
				}
			}
		}
	})
}

func TestMultiPetWindowSelectionAllowsFiveAndAutoPrimary(t *testing.T) {
	w, db, g := setup(t)
	c, _ := petOwner(t, w, db, "multiselect", 30, 100)
	id := int(c.ID)
	w.Do(func() {
		e := w.players[id]
		for bag := range e.pets.Pets {
			e.pets.Pets[bag] = petFromFighter(enemyFighter(w, petEnemy(t, g, 1), 20, 15), e.char.ID)
		}
		e.pets.Battle = -1
		e.pets.Standby = 0
	})
	// Four standby is a separate limit; adding the primary makes all five eligible.
	for bag := 0; bag < 4; bag++ {
		w.PetState(id, bag, "standby")
	}
	w.PetState(id, 4, "battle")
	w.Do(func() {
		e := w.players[id]
		if e.pets.Battle != 4 || e.pets.Standby != 15 {
			t.Fatalf("one primary plus four standby not selectable: %+v", e.pets)
		}
		room := &battleRoom{b: battle.New(w.rnd)}
		w.joinRoom(room, e, 0)
		if len(e.fight.pets) != 5 || e.fight.pet != 4 {
			t.Fatalf("five selected pets not deployed: %+v", e.fight)
		}
		e.fight = nil
		e.pets.Battle = -1
	})
	// With no designated primary, the first eligible standby owns the fixed primary slot.
	w.Do(func() {
		e := w.players[id]
		e.pets.Pets[0].Away = true
		e.pets.Pets[1].Guard = true
		e.pets.Pets[2].HP = 0
		room := &battleRoom{b: battle.New(w.rnd)}
		w.joinRoom(room, e, 0)
		if len(e.fight.pets) != 1 || e.fight.pet != 3 || e.fight.pets[5] != 3 {
			t.Fatalf("standby primary/eligibility failed: %+v", e.fight.pets)
		}
	})
}

func TestMultiPetInitialPartyAllocatesOnlyFinalQuotas(t *testing.T) {
	w, db, g := setup(t)
	var members []*entity
	for i := 0; i < 3; i++ {
		c, _ := petOwner(t, w, db, fmt.Sprintf("multiinitial%d", i), 30, 100)
		w.Do(func() {
			e := w.players[int(c.ID)]
			for bag := range e.pets.Pets {
				e.pets.Pets[bag] = petFromFighter(enemyFighter(w, petEnemy(t, g, 1), 20, 15), e.char.ID)
			}
			e.pets.Battle = 0
			e.pets.Standby = 30
			members = append(members, e)
		})
	}
	w.Do(func() {
		room := &battleRoom{b: battle.New(w.rnd)}
		for slot, e := range members {
			w.joinRoom(room, e, slot, true)
		}
		w.balanceBattlePets(room, 0)
		for i, e := range members {
			want := 2
			if i == 2 {
				want = 1
			}
			if len(e.fight.pets) != want || len(e.fight.retiredPets) != 0 || len(e.fight.deployedPets) != want {
				t.Fatalf("initial party deployed phantom pets: member%d pets%v retired%d deployed%v", i, e.fight.pets, len(e.fight.retiredPets), e.fight.deployedPets)
			}
		}
	})
}

func TestMultiPetCommandsValidateOwnerAndWaitForEveryPet(t *testing.T) {
	w, db, g := setup(t)
	a, _ := petOwner(t, w, db, "multicmd1", 30, 100)
	b, _ := petOwner(t, w, db, "multicmd2", 30, 100)
	w.Do(func() {
		room := &battleRoom{b: battle.New(w.rnd)}
		for _, id := range []int{int(a.ID), int(b.ID)} {
			e := w.players[id]
			for bag := range e.pets.Pets {
				e.pets.Pets[bag] = petFromFighter(enemyFighter(w, petEnemy(t, g, 1), 20, 15), e.char.ID)
			}
			e.pets.Battle = 0
			e.pets.Standby = 30
		}
		ea, eb := w.players[int(a.ID)], w.players[int(b.ID)]
		w.joinRoom(room, ea, 0)
		w.joinRoom(room, eb, 1)
		ownSlots := ea.fight.petSlots()
		other := eb.fight.petSlots()[0]
		w.battlePetCommand(ea, -1, -1, other)
		if len(ea.fight.petCmds) != len(ownSlots) {
			t.Fatal("pet command storage changed unexpectedly")
		}
		if ea.fight.petCommand(other) != nil {
			t.Fatal("accepted teammate pet command")
		}
		for _, slot := range ownSlots {
			w.battlePetCommand(ea, -1, -1, slot)
			if ea.fight.petCommand(slot) == nil {
				t.Fatalf("pet %d command missing", slot)
			}
		}
		// A player command alone must not advance while another owner's pets wait.
		ea.fight.cmd = &battle.Command{Kind: battle.Guard}
		eb.fight.cmd = &battle.Command{Kind: battle.Guard}
		w.tryResolve(room)
		if room.turn != 0 {
			t.Fatal("resolved before every pet submitted")
		}
		if ea.fight.petCmd != ea.fight.petCommand(5) {
			t.Fatal("legacy primary alias disagrees")
		}
	})
}

func TestMultiPetSwapCannotCloneActiveOrRetiredPet(t *testing.T) {
	w, db, g := setup(t)
	a, _ := petOwner(t, w, db, "multiswap1", 30, 100)
	b, _ := petOwner(t, w, db, "multiswap2", 30, 100)
	w.Do(func() {
		ea, eb := w.players[int(a.ID)], w.players[int(b.ID)]
		for _, e := range []*entity{ea, eb} {
			for bag := range e.pets.Pets {
				e.pets.Pets[bag] = petFromFighter(enemyFighter(w, petEnemy(t, g, 1), 20, 15), e.char.ID)
			}
			e.pets.Battle = 0
			e.pets.Standby = 30
		}
		room := &battleRoom{b: battle.New(w.rnd)}
		w.joinRoom(room, ea, 0)
		primary := room.b.F[5]
		primary.HP = 3
		for _, bag := range []int{0, 1} {
			ea.fight.cmd = nil
			w.battleCommand(ea, string(battle.PetSwap), -1, bag)
			if ea.fight.cmd == nil || ea.fight.cmd.Swap != nil {
				t.Fatalf("active pet bag%d can be cloned", bag)
			}
		}
		ea.fight.cmd = nil
		w.battleCommand(ea, string(battle.PetSwap), -1, 0)
		if ea.fight.cmd == nil || ea.fight.cmd.Swap != nil || primary.HP != 3 {
			t.Fatal("primary re-summon refreshed its state")
		}
		w.joinRoom(room, eb, 1)
		ea.fight.cmd = nil
		w.battleCommand(ea, string(battle.PetSwap), -1, 4)
		if ea.fight.cmd == nil || ea.fight.cmd.Swap != nil {
			t.Fatal("quota-recalled pet can be summoned twice in one battle")
		}
	})
}

func TestMultiPetExperienceAndRetiredQuotaContribution(t *testing.T) {
	for _, share := range []bool{false, true} {
		t.Run(fmt.Sprint(share), func(t *testing.T) {
			w, db, g := setup(t)
			a, _ := petOwner(t, w, db, "multiexp1", 30, 100)
			b, _ := petOwner(t, w, db, "multiexp2", 30, 100)
			w.Do(func() {
				w.Rules.ShareExp = share
				room := &battleRoom{b: battle.New(w.rnd)}
				ea, eb := w.players[int(a.ID)], w.players[int(b.ID)]
				for _, e := range []*entity{ea, eb} {
					for bag := range e.pets.Pets {
						e.pets.Pets[bag] = petFromFighter(enemyFighter(w, petEnemy(t, g, 1), 20, 15), e.char.ID)
					}
					e.pets.Battle = 0
					e.pets.Standby = 30
				}
				w.joinRoom(room, ea, 0)
				ft := ea.fight
				// The last extra will be recalled as the quota falls from five to three.
				killed := &battle.Fighter{Slot: 15, HP: 0, Level: 20, Exp: 1000, KilledBy: 9}
				room.b.Add(killed)
				killed.HP = 0
				killed.KilledBy = 9
				retiredFighter := room.b.F[9]
				retiredFighter.HP = 13
				retiredFighter.AIDelta = 20
				w.joinRoom(room, eb, 1)
				if len(ft.retiredPets) != 2 || ft.retiredPets[1].fighter != retiredFighter || retiredFighter.HP != 13 {
					t.Fatal("quota shrink lost fighter state")
				}
				if killed.KilledBy >= -1 || killed.KilledBy != ft.retiredPets[1].killToken {
					t.Fatal("retired kill contribution now belongs to reused pet slot")
				}
				char, pet, _ := w.battleExp(ea, ft)
				results := w.petResult(ea, ft, pet)
				if len(results) != 5 {
					t.Fatalf("all deployed alive pets must settle once, got %+v", results)
				}
				earned := 0
				for _, result := range results {
					if result.Slot == 4 {
						earned = result.Exp
					}
					if !share && result.Slot != 4 && result.Exp != 0 {
						t.Fatalf("non-killer pet received individual exp: %+v", result)
					}
				}
				if earned <= 0 {
					t.Fatal("retired contributor lost experience")
				}
				if !share && char != 0 {
					t.Fatalf("retired pet kill double-counted as character exp: %d", char)
				}
				w.settlePet(ea, ft)
				if ea.pets.Pets[4].HP != 13 {
					t.Fatal("retired fighter HP was not written back")
				}
			})
		})
	}
}

func TestMultiPetRescueSendsResetSnapshotWithoutPetRespawn(t *testing.T) {
	w, db, g := setup(t)
	a, _ := petOwner(t, w, db, "multirescue1", 30, 100)
	b, bcl := petOwner(t, w, db, "multirescue2", 30, 100)
	w.Do(func() {
		room := &battleRoom{b: battle.New(w.rnd)}
		ea, eb := w.players[int(a.ID)], w.players[int(b.ID)]
		for _, e := range []*entity{ea, eb} {
			for bag := range e.pets.Pets {
				e.pets.Pets[bag] = petFromFighter(enemyFighter(w, petEnemy(t, g, 1), 20, 15), e.char.ID)
			}
			e.pets.Battle = 0
			e.pets.Standby = 30
		}
		w.joinRoom(room, ea, 0)
		dead := room.b.F[7]
		dead.HP = 0
		escaped := room.b.F[8]
		escaped.Escaped = true
		w.rescueEntry(eb, ea)
		if dead.HP != 0 || !escaped.Escaped {
			t.Fatal("rescue reset dead/escaped fighter state")
		}
		snapshot, _ := find[*proto.BattleStart](bcl.take())
		if snapshot == nil || len(snapshot.Fighters) != 7 {
			t.Fatalf("new rescuer did not receive full two-player/five-pet snapshot: %+v", snapshot)
		}
	})
}
