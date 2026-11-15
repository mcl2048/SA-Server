package battle

import (
	"testing"

	"sa/server/internal/data"
)

func coattackBattle(seed uint64) *Battle {
	b := New(rnd(seed))
	for _, slot := range []int{0, 1, 5} {
		f := player(slot)
		f.HP, f.MaxHP, f.Atk, f.Quick = 100000, 100000, 80, 100
		if slot == 5 {
			f.Player, f.Pet, f.Loyalty = false, true, 100
			f.OwnerSlot = 0
		}
		b.Add(f)
	}
	b.Add(&Fighter{Slot: 15, HP: 100000, MaxHP: 100000, Level: 1, Atk: 0, Def: 10, Quick: 1, Tactics: "gu:1"})
	return b
}

func TestCoattackOrdinaryPlayerAndPetSameTarget(t *testing.T) {
	groups := 0
	for seed := uint64(1); seed <= 40; seed++ {
		b := coattackBattle(seed)
		ev := b.Resolve(map[int]Command{0: {Kind: Attack, Target: 15}, 1: {Kind: Attack, Target: 15}, 5: {Kind: Attack, Target: 15, Skill: &data.Skill{Func: "PETSKILL_NormalAttack"}}})
		counts := map[int]int{}
		damage := 0
		for _, e := range ev {
			if e.Kind == Attack && e.Target == 15 {
				damage += e.Damage
			}
			if e.Coattack > 0 {
				counts[e.Coattack]++
				if e.Kind != Attack || e.Target != 15 || e.Combo || e.Result == Dodge {
					t.Fatalf("invalid joint event: %+v", e)
				}
			}
		}
		for _, n := range counts {
			if n < 2 {
				t.Fatalf("singleton joint group: %v", ev)
			}
			groups++
		}
		if b.F[15].HP != 100000-damage {
			t.Fatalf("joint damage not accounted once: hp=%d damage=%d", b.F[15].HP, damage)
		}
	}
	if groups < 10 || groups >= 40 {
		t.Fatalf("ordinary adjacent actors must sometimes coattack, not always: groups=%d", groups)
	}
}

func TestCoattackExcludesSkillsRangedTargetsAndStatus(t *testing.T) {
	for _, mode := range []string{"skill", "ranged", "different-target", "asleep", "intervening-enemy"} {
		for seed := uint64(1); seed < 20; seed++ {
			b := coattackBattle(seed)
			b.F[5] = nil
			cmds := map[int]Command{0: {Kind: Attack, Target: 15}, 1: {Kind: Attack, Target: 15}}
			switch mode {
			case "skill":
				cmds[1] = Command{Kind: Attack, Target: 15, Skill: &data.Skill{Func: "PETSKILL_Mighty", Option: "倍2"}}
			case "ranged":
				b.F[1].Weapon = data.ItemBow
			case "different-target":
				b.Add(&Fighter{Slot: 16, HP: 100000, MaxHP: 100000, Level: 1, Tactics: "gu:1"})
				cmds[1] = Command{Kind: Attack, Target: 16}
			case "asleep":
				b.F[1].status[StSleep] = 3
			case "intervening-enemy":
				b.F[0].Quick, b.F[0].FixQuick = 1000, 1000
				b.F[1].Quick, b.F[1].FixQuick = 1, 1
				b.F[15].Quick, b.F[15].FixQuick = 100, 100
			}
			for _, e := range b.Resolve(cmds) {
				if e.Coattack > 0 {
					t.Fatalf("%s incorrectly grouped: %+v", mode, e)
				}
			}
		}
	}
}

func TestCoattackLethalDamageStaysOnOriginalTarget(t *testing.T) {
	found := false
	for seed := uint64(1); seed < 50; seed++ {
		b := coattackBattle(seed)
		b.F[15].HP = 1
		b.Add(&Fighter{Slot: 16, HP: 100000, MaxHP: 100000, Level: 1, Tactics: "gu:1"})
		events := b.Resolve(map[int]Command{0: {Kind: Attack, Target: 15}, 1: {Kind: Attack, Target: 15}, 5: {Kind: Attack, Target: 15}})
		var joint []Event
		for _, e := range events {
			if e.Coattack > 0 {
				joint = append(joint, e)
			}
		}
		if len(joint) < 2 {
			continue
		}
		found = true
		for i, e := range joint {
			if e.Target != 15 || e.Damage <= 0 {
				t.Fatalf("lethal group retargeted/skipped member: %+v", joint)
			}
			if i < len(joint)-1 && (e.Dead || e.Fly > 0) {
				t.Fatalf("death committed before last contribution: %+v", joint)
			}
		}
		if !joint[len(joint)-1].Dead || b.F[15].HP != 0 {
			t.Fatalf("group final damage not committed: %+v", joint)
		}
		break
	}
	if !found {
		t.Fatal("no lethal coattack fixture found")
	}
}

func TestCoattackBarriersRideAndCaptureProtection(t *testing.T) {
	for _, mode := range []string{"reflect", "absorb", "vanish", "mount", "capture-protection"} {
		t.Run(mode, func(t *testing.T) {
			b := coattackBattle(4)
			d := b.F[15]
			d.HP, d.MaxHP = 1000, 1000
			switch mode {
			case "reflect":
				d.Reflect = 3
			case "absorb":
				d.HP, d.Absorb = 100, 3
			case "vanish":
				d.Vanish = 3
			case "mount":
				d.Ride = &Mount{HP: 10000, MaxHP: 10000}
			}
			var ev []Event
			members := []coattackActor{{b.F[0], Command{Kind: Attack, Target: 15}, 0}, {b.F[1], Command{Kind: Attack, Target: 15}, 0}}
			if mode == "capture-protection" {
				members[0].avoid = 1 << 15
				if b.coattackEligible(members[0].f, members[0].command, members[0].avoid) {
					t.Fatal("protected target allowed into group")
				}
				return
			}
			b.coattackSeq(members, 1, &ev)
			if len(ev) != 2 {
				t.Fatalf("lost group contribution: %+v", ev)
			}
			switch mode {
			case "reflect":
				if d.HP != 1000 || d.Reflect != 1 || b.F[0].HP >= 100000 || b.F[1].HP >= 100000 {
					t.Fatalf("reflection damaged defender or ignored actor: target=%d barrier=%d", d.HP, d.Reflect)
				}
			case "absorb":
				if d.HP <= 100 || d.Absorb != 1 {
					t.Fatalf("absorption lost native effect: HP=%d charges=%d", d.HP, d.Absorb)
				}
			case "vanish":
				if d.HP != 1000 || d.Vanish != 1 {
					t.Fatalf("vanish lost native effect: HP=%d charges=%d", d.HP, d.Vanish)
				}
			case "mount":
				dmg, pet := ev[0].Damage+ev[1].Damage, ev[0].PetDamage+ev[1].PetDamage
				if dmg <= 0 || pet <= 0 || d.HP != 1000-dmg || d.Ride.HP != 10000-pet || d.Ride.Fell {
					t.Fatalf("rider/mount sums drifted: HP=%d ride=%d events=%+v", d.HP, d.Ride.HP, ev)
				}
			}
		})
	}
}

func TestCoattackDisobedientPetCannotLeavePhantomParticipant(t *testing.T) {
	for seed := uint64(1); seed <= 100; seed++ {
		b := coattackBattle(seed)
		b.F[0].HP = 1
		b.F[5].Loyalty = 0
		b.F[5].Skills = [7]*data.Skill{{Func: "PETSKILL_NormalAttack", Target: 1}}
		counts := map[int]int{}
		for _, e := range b.Resolve(map[int]Command{0: {Kind: Attack, Target: 15}, 1: {Kind: Attack, Target: 15}, 5: {Kind: Attack, Target: 15}}) {
			if e.Coattack > 0 {
				counts[e.Coattack]++
			}
		}
		for _, n := range counts {
			if n < 2 {
				t.Fatalf("disobedience killed another participant but left singleton joint action: seed=%d", seed)
			}
		}
	}
}

func TestCoattackMinimumDamageIsReportedAsHit(t *testing.T) {
	for _, guarded := range []bool{false, true} {
		for seed := uint64(1); seed <= 20; seed++ {
			b := coattackBattle(seed)
			d := b.F[15]
			d.Def, d.guard = 1000000, guarded
			b.F[0].Quick, b.F[0].Luck, b.F[1].Quick, b.F[1].Luck = 0, 0, 0, 0
			var events []Event
			b.coattackSeq([]coattackActor{{b.F[0], Command{Kind: Attack, Target: 15}, 0}, {b.F[1], Command{Kind: Attack, Target: 15}, 0}}, 1, &events)
			for _, e := range events {
				if e.Damage != 1 || e.Result != Normal || e.Guarded != guarded {
					t.Fatalf("native minimum contribution must be a hit: seed=%d guarded=%v event=%+v", seed, guarded, e)
				}
			}
			if d.HP != 99998 {
				t.Fatalf("minimum contributions not accumulated: hp=%d", d.HP)
			}
		}
	}
}
