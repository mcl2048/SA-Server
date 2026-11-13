package battle

import (
	"sa/server/internal/data"
	"testing"
)

func ownedTestPet(slot, owner int) *Fighter {
	f := pet(slot, 100)
	f.OwnerSlot, f.OwnerSet = owner, true
	return f
}

func TestMultiPetOwnershipAndLegacyLayout(t *testing.T) {
	b := New(rnd(1))
	b.Add(player(0))
	b.Add(player(1))
	b.Add(player(10))
	for _, tc := range []struct {
		f    *Fighter
		want int
	}{{pet(5, 100), 0}, {pet(6, 100), 1}, {ownedTestPet(9, 0), 0}, {ownedTestPet(8, 1), 1}, {ownedTestPet(15, 10), 10}, {ownedTestPet(9, 10), -1}, {ownedTestPet(9, 4), -1}, {ownedTestPet(1, 0), -1}, {ownedTestPet(99, 0), -1}} {
		if got := b.PetOwner(tc.f); got != tc.want {
			t.Errorf("slot%d explicit%t owner%d: got%d want%d", tc.f.Slot, tc.f.OwnerSet, tc.f.OwnerSlot, got, tc.want)
		}
	}
	if b.PetOwner(nil) != -1 || b.PetOwner(foe(15)) != -1 {
		t.Error("nonpet has player ownership")
	}
	b.Add(ownedTestPet(5, 1))
	b.Add(ownedTestPet(7, 0))
	b.Add(ownedTestPet(9, 0))
	if got := b.PrimaryPet(0); got == nil || got.Slot != 7 {
		t.Fatalf("preferred column belongs to another player: %+v", got)
	}
}

func TestMultiPetEscapeAndFleeOnlyTakeOwnedPets(t *testing.T) {
	for _, mode := range []string{"escape", "flee"} {
		escaped := false
		for seed := uint64(1); seed < 50; seed++ {
			b := New(rnd(seed))
			owner := player(0)
			owner.Luck = 5
			b.Add(owner)
			b.Add(player(1))
			b.Add(foe(15))
			for _, slot := range []int{5, 7, 9} {
				b.Add(ownedTestPet(slot, 0))
			}
			b.Add(ownedTestPet(6, 1))
			var ev []Event
			if mode == "escape" {
				b.act(owner, Command{Kind: Escape}, &ev)
			} else {
				b.flee(owner, &ev)
			}
			if !owner.Escaped {
				continue
			}
			escaped = true
			for _, slot := range []int{5, 7, 9} {
				if b.F[slot].Alive() {
					t.Errorf("%s left own pet%d behind", mode, slot)
				}
			}
			if !b.F[6].Alive() || !b.F[1].Alive() {
				t.Errorf("%s removed another owner", mode)
			}
			for _, slot := range b.targetable(0) {
				if slot != 1 && slot != 6 {
					t.Errorf("escaped slot remains targetable: %d", slot)
				}
			}
			break
		}
		if !escaped {
			t.Errorf("%s never completed", mode)
		}
	}
}

func TestMultiPetDisobeysAndPunishmentUseActualOwner(t *testing.T) {
	b := New(rnd(2))
	b.Add(player(0))
	b.Add(player(4))
	p := ownedTestPet(9, 0)
	p.Loyalty = 0
	b.Add(p)
	b.Add(foe(15))
	attacks := 0
	for i := 0; i < 100; i++ {
		p.Escaped = false
		var ev []Event
		c, ok := b.loyalCheck(p, Command{Kind: Guard}, &ev)
		if ok && c.Kind == Attack {
			attacks++
			if c.Target != 0 {
				t.Errorf("extra pet attacks wrong owner slot%d", c.Target)
			}
		}
	}
	if attacks == 0 {
		t.Fatal("no disobedient owner attacks")
	}
	p.Escaped = false
	p.AIDelta = 0
	b.attackOnce(b.F[4], p, attackOpts{}, false)
	if p.AIDelta != 0 {
		t.Error("unrelated player counted as owner punishment")
	}
	b.attackOnce(b.F[0], p, attackOpts{}, false)
	if p.AIDelta != aiFixSekkan {
		t.Errorf("real owner punishment missing: %d", p.AIDelta)
	}
}

func TestMultiPetSwapPreservesOtherOwners(t *testing.T) {
	b := New(rnd(3))
	owner := player(0)
	b.Add(owner)
	b.Add(player(1))
	other := ownedTestPet(5, 1)
	mine := ownedTestPet(7, 0)
	extra := ownedTestPet(9, 0)
	b.Add(other)
	b.Add(mine)
	b.Add(extra)
	// Neither recall nor summon may touch another owner's primary-column
	// occupant or fall back to one of this owner's secondary pets.
	for _, next := range []*Fighter{nil, pet(0, 100)} {
		var ev []Event
		b.petSwap(owner, Command{Kind: PetSwap, Swap: next}, &ev)
		if b.F[5] != other || b.F[9] != extra || b.F[7] != mine || b.F[6] != nil {
			t.Fatalf("rejected swap changed primary or secondary slots: %+v", ev)
		}
		if len(b.Recalled) != 0 || len(ev) != 1 || ev[0].Kind != None || ev[0].Target != -1 {
			t.Fatalf("occupied primary column did not reject swap: %+v", ev)
		}
	}
}

func TestMultiPetRecallThenResummonOnlyUsesPrimaryColumn(t *testing.T) {
	b := New(rnd(4))
	owner := player(0)
	b.Add(owner)
	primary, secondary := ownedTestPet(5, 0), ownedTestPet(6, 0)
	primary.HP, secondary.HP = 73, 39
	b.Add(primary)
	b.Add(secondary)
	secondary.AIDelta, secondary.status[StPoison], secondary.charge = 17, 3, 2
	var ev []Event
	b.petSwap(owner, Command{Kind: PetSwap}, &ev)
	if b.F[5] != nil || b.F[6] != secondary || len(b.Recalled) != 1 || b.Recalled[0] != primary {
		t.Fatalf("recall removed the wrong pet: %+v", ev)
	}
	if len(ev) != 1 || ev[0].Kind != PetIn || ev[0].Target != 5 {
		t.Fatalf("primary recall event has the wrong mapping: %+v", ev)
	}
	// Another recall while the primary is absent must not recall the secondary.
	ev = nil
	b.petSwap(owner, Command{Kind: PetSwap}, &ev)
	if b.F[6] != secondary || len(b.Recalled) != 1 || len(ev) != 1 || ev[0].Kind != None {
		t.Fatalf("empty primary recall fell back to the secondary: %+v", ev)
	}
	// The next turn calls the same bag pet back into slot 5, never slot 6.
	ev = nil
	b.petSwap(owner, Command{Kind: PetSwap, Swap: primary}, &ev)
	if b.F[5] != primary || b.F[6] != secondary || b.PetOwner(primary) != 0 || !primary.OwnerSet {
		t.Fatalf("resummon replaced the secondary: %+v", ev)
	}
	if len(ev) != 1 || ev[0].Kind != PetOut || ev[0].Target != 5 || primary.HP != 73 {
		t.Fatalf("resummon event/state disagrees with primary mapping: %+v", ev)
	}
	if secondary.HP != 39 || secondary.AIDelta != 17 || secondary.status[StPoison] != 3 || secondary.charge != 2 {
		t.Fatalf("resummon changed the secondary's combat state: %+v", secondary)
	}
}

func TestMultiPetMetamoOnlyAllowsActualOwnedPets(t *testing.T) {
	b := New(rnd(5))
	owner := player(0)
	b.Add(owner)
	b.Add(player(1))
	extra := ownedTestPet(9, 0)
	extra.Sprite = 1234
	other := ownedTestPet(5, 1)
	other.Sprite = 5678
	b.Add(extra)
	b.Add(other)
	var ev []Event
	b.battleMetamo(owner, Command{Target: 9}, &ev, 30, true)
	if owner.Sprite != 1234 || len(ev) != 1 || ev[0].Kind != Vary {
		t.Fatalf("cannot transform into own extra pet: %+v", ev)
	}
	ev = nil
	b.battleMetamo(owner, Command{Target: 5}, &ev, 30, true)
	if owner.Sprite != 1234 || len(ev) != 1 || ev[0].Target != -1 {
		t.Fatalf("transformed into another owner's conventional column: %+v", ev)
	}
}

func TestMultiPetGuardianAndRegretUseActualOwner(t *testing.T) {
	b := New(rnd(6))
	owner := player(0)
	owner.HP, owner.MaxHP = 100000, 100000
	b.Add(owner)
	b.Add(player(4))
	p := ownedTestPet(9, 0)
	p.HP, p.MaxHP = 100000, 100000
	b.Add(p)
	enemy := foe(15)
	enemy.HP, enemy.MaxHP = 100000, 100000
	b.Add(enemy)
	b.setup(p, Command{Kind: Guard, Skill: &data.Skill{Name: "guard", Func: "PETSKILL_Guardian", Option: "COM:防御"}})
	protected := false
	for i := 0; i < 50; i++ {
		e, _ := b.attackOnce(enemy, owner, attackOpts{}, false)
		if e.Guardian == 9 {
			protected = true
			break
		}
	}
	if !protected {
		t.Fatal("extra pet did not protect actual owner")
	}
	delete(b.guardian, 0)
	var ev []Event
	b.regret(enemy, Command{Target: 9, Skill: &data.Skill{Option: "命%0"}}, attackOpts{}, &ev)
	if len(ev) != 2 || ev[0].Target != 9 || ev[1].Target != 0 {
		t.Fatalf("regret hit conventional column instead of owner: %+v", ev)
	}
	// Enemy front/back pairing is formation logic, not player-pet ownership.
	b = New(rnd(7))
	a := player(0)
	b.Add(a)
	front, back := foe(15), foe(10)
	front.HP, front.MaxHP = 100000, 100000
	b.Add(front)
	b.Add(back)
	ev = nil
	b.regret(a, Command{Target: 15, Skill: &data.Skill{Option: "命%0"}}, attackOpts{}, &ev)
	if len(ev) != 2 || ev[0].Target != 15 || ev[1].Target != 10 {
		t.Fatalf("legacy enemy pairing changed: %+v", ev)
	}
}

func TestMultiPetRemapGuardianKeepsActualProtector(t *testing.T) {
	b := New(rnd(8))
	owner, other := player(0), player(1)
	b.Add(owner)
	b.Add(other)
	protector, unrelated := ownedTestPet(5, 0), ownedTestPet(7, 1)
	owner.HP, owner.MaxHP, protector.HP, protector.MaxHP = 100000, 100000, 100000, 100000
	b.Add(protector)
	b.Add(unrelated)
	attacker := foe(15)
	b.Add(attacker)
	b.setup(protector, Command{Kind: Guard, Skill: &data.Skill{Func: "PETSKILL_Guardian", Option: "COM:防御"}})
	b.RemapSlots(map[int]int{5: 7, 7: 5})
	if b.F[5] != protector || b.F[7] != unrelated || protector.Slot != 5 {
		t.Fatal("reference remap must not relocate fighters")
	}
	// The world layer then assigns the same objects, preserving their state.
	b.F[5], b.F[7] = unrelated, protector
	unrelated.Slot, protector.Slot = 5, 7
	if b.guardian[0] != 7 {
		t.Fatalf("guardian now points to the wrong owner's pet: %v", b.guardian)
	}
	protected := false
	for i := 0; i < 100; i++ {
		e, _ := b.attackOnce(attacker, owner, attackOpts{}, false)
		if e.Guardian >= 0 {
			if e.Guardian != 7 {
				t.Fatalf("other player's pet protected owner: %+v", e)
			}
			protected = true
			break
		}
	}
	if !protected {
		t.Fatal("relocated guardian stopped protecting its owner")
	}
	b.RemapSlots(map[int]int{7: -1})
	if _, ok := b.guardian[0]; ok {
		t.Fatal("retired protector remained registered")
	}
}

func TestMultiPetRemapPendingEarthTargetAndAuras(t *testing.T) {
	b := New(rnd(9))
	b.Add(player(0))
	b.Add(player(1))
	first, second := ownedTestPet(5, 0), ownedTestPet(7, 1)
	b.Add(first)
	b.Add(second)
	first.HP, first.MaxHP, second.HP, second.MaxHP = 100000, 100000, 100000, 100000
	attacker := foe(15)
	b.Add(attacker)
	attacker.hidden, attacker.earthT, attacker.earthP, attacker.earthN = true, 5, 20, "pending Earth Round"
	// A second pending reference proves the mapping is simultaneous, not chained.
	first.hidden, first.earthT = true, 7
	first.magStatus, first.magTurns, first.magN = 2, 3, 40
	first.fox, first.foxSave = 2, 5 // Five is a sprite here, never a fighter reference.
	first.vary, first.varySave = 3, [4]int{5, 7, 15, 100250}
	first.imprecate[0] = [2]int{7, 3}
	first.status[StPoison] = 3
	first.charge = 2
	first.KilledBy = 5
	b.guardian[5] = 7
	b.RemapSlots(map[int]int{5: 7, 7: 5})
	if attacker.earthT != 7 || first.earthT != 5 || b.guardian[7] != 5 {
		t.Fatalf("cyclic slot mapping was chained or incomplete: earth %d/%d guard %v", attacker.earthT, first.earthT, b.guardian)
	}
	if first.magStatus != 2 || first.magTurns != 3 || first.magN != 40 || first.foxSave != 5 || first.varySave != [4]int{5, 7, 15, 100250} || first.imprecate[0] != [2]int{7, 3} || first.status[StPoison] != 3 || first.charge != 2 || first.KilledBy != 5 {
		t.Fatal("remap altered a persistent effect or world-owned kill attribution")
	}
	b.F[5], b.F[7] = second, first
	first.Slot, second.Slot = 7, 5
	first.hidden = false
	var ev []Event
	b.act(attacker, Command{Kind: Guard}, &ev)
	if len(ev) == 0 || ev[0].Target != 7 {
		t.Fatalf("pending Earth Round hit the pet that replaced its target: %+v", ev)
	}
	attacker.hidden, attacker.earthT = true, 7
	b.RemapSlots(map[int]int{7: -1})
	if attacker.earthT != -1 {
		t.Fatal("retired pending target was retained")
	}
	b.F[7] = nil
	ev = nil
	b.act(attacker, Command{Kind: Guard}, &ev)
	for _, e := range ev {
		if e.Kind == Attack && (e.Target < 0 || e.Target >= 10 || b.F[e.Target] == nil) {
			t.Fatalf("retired target produced an invalid or friendly attack: %+v", e)
		}
	}
	if len(ev) == 0 || ev[0].Kind != Attack {
		t.Fatalf("retired target did not safely retarget: %+v", ev)
	}
}
