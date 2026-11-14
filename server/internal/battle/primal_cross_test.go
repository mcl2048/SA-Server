package battle

import (
	"sa/server/internal/data"
	"testing"
)

func primalSkill() *data.Skill {
	return &data.Skill{ID: 29060, Name: "赤爪裂阵", Func: "PETSKILL_PrimalCross", Field: 1, Target: 1}
}
func primalBattle(seed uint64) (*Battle, *Fighter) {
	b := New(rnd(seed))
	a := pet(5, 100)
	a.HP, a.MaxHP, a.Atk, a.Def, a.Quick, a.Level = 100000, 100000, 500, 100, 0, 50
	b.Add(a)
	for slot := 10; slot < 20; slot++ {
		d := enemy(slot, "wa:0;0;0;0;0;0;0|at:0|gu:0")
		d.HP, d.MaxHP, d.Def, d.Quick, d.Level = 100000, 100000, 0, 0, 50
		b.Add(d)
	}
	return b, a
}
func primalEvents(b *Battle, a *Fighter, target int) []Event {
	var ev []Event
	b.skillAttack(a, Command{Kind: Attack, Target: target, Skill: primalSkill()}, &ev)
	return ev
}
func primalHits(ev []Event) []Event {
	var out []Event
	for _, e := range ev {
		if e.Kind == Attack && e.Skill == "赤爪裂阵" {
			out = append(out, e)
		}
	}
	return out
}

// Catches slot+1 wrapping 14->15, diagonal/full-row expansion, and accidental
// ordinary attack fallback instead of one native cross-shaped attack sequence.
func TestPrimalCrossFormationUsesOnlyOrthogonalNeighbors(t *testing.T) {
	for _, tc := range []struct {
		target int
		want   []int
	}{
		{10, []int{10, 11, 15}}, {12, []int{12, 11, 13, 17}}, {14, []int{14, 13, 19}},
		{15, []int{15, 16, 10}}, {19, []int{19, 18, 14}},
	} {
		b, a := primalBattle(13)
		ev := primalEvents(b, a, tc.target)
		hits := primalHits(ev)
		if len(hits) != len(tc.want) {
			t.Fatalf("target %d: got %d hits want %v: %+v", tc.target, len(hits), tc.want, ev)
		}
		for i, e := range hits {
			if e.Target != tc.want[i] || e.Effect != 199402 || e.Shoot != 0 || e.Combo != (i < len(hits)-1) {
				t.Fatalf("cross sequence %d: %+v", tc.target, hits)
			}
		}
	}
}

// Catches granting the buff at command setup (even if stunned), granting it to
// every victim, or stacking a new percentage on previously boosted defense.
func TestPrimalCrossDefenseIsSelfOnlyRefreshesAndExpiresAfterFiveRounds(t *testing.T) {
	b, a := primalBattle(31)
	b.Add(player(0))
	cmd := map[int]Command{0: {Kind: Guard}, 5: {Kind: Attack, Target: 12, Skill: primalSkill()}}
	ev := b.Resolve(cmd)
	if a.Def < 130 || a.Def > 160 {
		t.Fatalf("caster defense not boosted once: def=%d events=%+v", a.Def, ev)
	}
	for _, slot := range []int{0, 10, 11, 12, 13, 17} {
		if b.F[slot].Def != b.F[slot].FixDef {
			t.Fatalf("defense leaked to target %d", slot)
		}
	}
	for turn := 2; turn <= 4; turn++ {
		b.Resolve(map[int]Command{0: {Kind: Guard}, 5: {Kind: Guard}})
		if a.Def < 130 || a.Def > 160 {
			t.Fatalf("buff vanished at round %d: %d", turn, a.Def)
		}
	}
	b.Resolve(cmd)
	if a.Def < 130 || a.Def > 160 {
		t.Fatalf("refresh stacked defense: %d", a.Def)
	}
	for turn := 0; turn < 4; turn++ {
		b.Resolve(map[int]Command{0: {Kind: Guard}, 5: {Kind: Guard}})
	}
	if a.Def != 100 {
		t.Fatalf("five-round refresh did not expire: %d", a.Def)
	}
	for _, st := range []int{StParalysis, StStone, StSleep, StBarrier} {
		b, a := primalBattle(9)
		b.Add(player(0))
		for slot := 10; slot < 20; slot++ {
			b.F[slot].Tactics = "gu:1"
		}
		a.status[st] = 3
		ev := b.Resolve(cmd)
		if a.Def != 100 || len(primalHits(ev)) != 0 {
			t.Fatalf("immobilized caster gained buff/attacked: %+v", ev)
		}
	}
}

// Catches replacing the requested 80% roll with agility-based native dodge,
// making special IDs auto-hit, or allowing guard/stone to dodge.
func TestPrimalCrossExactAccuracyExceptionsAndPoisonBounds(t *testing.T) {
	for _, tc := range []struct {
		name                string
		quick, status, id   int
		guard               bool
		wantHit, wantPoison int
	}{
		{"ordinary", 0, 0, 9999, false, 80, 35}, {"agile", 100000, 0, 9999, false, 80, 35},
		{"boss", 0, 0, 1690, false, 80, 0}, {"guard", 100000, 0, 9999, true, 100, 0},
		{"stone", 100000, StStone, 9999, false, 100, 0}, {"existing-poison", 0, StPoison, 9999, false, 80, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			landed, poisoned := 0, 0
			for seed := uint64(1); seed <= 2500; seed++ {
				b, a := primalBattle(seed)
				for s := 11; s < 20; s++ {
					b.F[s] = nil
				}
				d := b.F[10]
				d.Quick, d.guard = tc.quick, tc.guard
				d.Seed = &PetSeed{EnemyID: tc.id}
				if tc.status > 0 {
					d.status[tc.status] = 5
				}
				hits := primalHits(primalEvents(b, a, 10))
				if len(hits) != 1 {
					t.Fatal("single-target fixture was expanded")
				}
				e := hits[0]
				if e.Damage > 0 {
					landed++
				}
				if e.Status == StDeepPoison {
					poisoned++
				}
				if tc.guard && d.guard {
					t.Fatal("successful guard break did not remove guard")
				}
			}
			if landed < 25*(tc.wantHit-3) || landed > 25*(tc.wantHit+3) {
				t.Fatalf("accuracy %d/2500 want %d%%", landed, tc.wantHit)
			}
			if tc.wantPoison == 0 && poisoned != 0 || tc.wantPoison > 0 && (poisoned*100 < landed*(tc.wantPoison-4) || poisoned*100 > landed*(tc.wantPoison+4)) {
				t.Fatalf("poison %d/%d want conditional %d%%", poisoned, landed, tc.wantPoison)
			}
		})
	}
}

// Catches global name/sprite matching instead of the actual EnemyID and
// accidentally multiplying poison/guard/special damage branches together.
func TestPrimalCrossSpecialDamagePrioritiesUseActualEnemyID(t *testing.T) {
	for _, tc := range []struct {
		name       string
		id, status int
		guard      bool
		min, max   int
	}{
		{"ordinary", 9999, 0, false, 650, 750}, {"boss", 1690, 0, false, 980, 1120},
		{"sky-reused", 323, 0, false, 980, 1120}, {"same-template", 843, 0, false, 650, 750},
		{"deep-poison", 9999, StDeepPoison, false, 780, 900}, {"boss-and-poison", 1691, StDeepPoison, false, 980, 1120},
		{"guard-and-poison", 9999, StDeepPoison, true, 980, 1120}, {"stone", 9999, StStone, false, 980, 1120},
	} {
		b, a := primalBattle(1)
		for s := 11; s < 20; s++ {
			b.F[s] = nil
		}
		d := b.F[10]
		d.Seed = &PetSeed{EnemyID: tc.id, TempNo: 843}
		d.Name, d.Sprite = "黑暗精灵王", 100444
		d.guard = tc.guard
		if tc.status > 0 {
			d.status[tc.status] = 7
		}
		// Accumulate independent seeds to include native critical/random damage.
		total, n := 0, 0
		for seed := uint64(1); seed <= 300; seed++ {
			b.Rnd = rnd(seed)
			d.HP, d.Flown = 100000, false
			ev := primalHits(primalEvents(b, a, 10))
			if ev[0].Damage > 0 {
				total += ev[0].Damage
				n++
			}
			d.guard = tc.guard
			if tc.status == 0 {
				d.status = [stCount]int{}
			} else {
				d.status[tc.status] = 7
			}
		}
		if n == 0 || total/n < tc.min || total/n > tc.max {
			t.Fatalf("%s wrong physical coefficient: mean=%d hits=%d", tc.name, total/max(1, n), n)
		}
	}
}

func TestPrimalCrossSkipsRetiredTargetsAndCaptureProtectedGuardian(t *testing.T) {
	for _, state := range []string{"dead", "flown", "escaped", "hidden", "capture", "guardian-capture"} {
		b, a := primalBattle(3)
		d := b.F[11]
		switch state {
		case "dead":
			d.HP = 0
		case "flown":
			d.Flown = true
		case "escaped":
			d.Escaped = true
		case "hidden":
			d.hidden = true
		case "capture":
			b.autoAvoidTargets = 1 << 11
		case "guardian-capture":
			b.autoAvoidTargets = 1 << 19
			b.guardian[11] = 19
		}
		ev := primalEvents(b, a, 12)
		for _, e := range primalHits(ev) {
			if e.Target == 11 || e.Guardian == 19 {
				t.Fatalf("%s affected retired/protected target: %+v", state, ev)
			}
		}
		if state == "guardian-capture" && b.F[19].HP != 100000 {
			t.Fatal("protected guardian damaged")
		}
	}
}

// The nonzero defense is essential: a zero-defense stone fixture cannot catch
// the native doubling that a stone guard break must specifically bypass.
func TestPrimalCrossStoneBreakKeepsStatusButBypassesOnlyExtraDefense(t *testing.T) {
	sawNormal, sawCritical := false, false
	for seed := uint64(1); seed <= 100; seed++ {
		makeTarget := func(stone bool) (*Battle, *Fighter) {
			b, a := primalBattle(seed)
			for slot := 11; slot < 20; slot++ {
				b.F[slot] = nil
			}
			d := b.F[10]
			d.Def = 300
			a.Quick = 100
			if stone {
				d.status[StStone] = 5
			} else {
				d.guard = true
			}
			return b, a
		}
		guard, ga := makeTarget(false)
		ge := primalHits(primalEvents(guard, ga, 10))[0]
		stone, sa := makeTarget(true)
		observedStone := false
		stone.OnHit = func(_, d *Fighter, _ int) { observedStone = d.status[StStone] == 5 }
		se := primalHits(primalEvents(stone, sa, 10))[0]
		sawNormal = sawNormal || se.Result == Normal
		sawCritical = sawCritical || se.Result == Critical
		if se.Result != ge.Result || se.Damage != ge.Damage || se.Damage < 200 || !observedStone || stone.F[10].status[StStone] != 5 {
			t.Fatalf("stone defense still doubled, base defense lost, or status transiently cleared: guard=%+v stone=%+v observed=%v", ge, se, observedStone)
		}
	}
	if !sawNormal || !sawCritical {
		t.Fatal("missing normal/critical positive control")
	}
}

func TestPrimalCrossPreservesGuardianMountAndBarrierResults(t *testing.T) {
	for _, state := range []string{"guardian", "mount", "absorb", "vanish", "reflect"} {
		t.Run(state, func(t *testing.T) {
			b, a := primalBattle(13)
			d := b.F[12]
			d.guard = true // Guaranteed contact; barrier/recipient still wins over HP loss.
			switch state {
			case "guardian":
				d = b.F[19]
				d.guard = true
				b.guardian[12] = 19
			case "mount":
				d.Player = true
				d.Def = 100
				d.Ride = &Mount{HP: 50000, MaxHP: 50000, Def: 100}
			case "absorb":
				d.HP = 50000
				d.Absorb = 1
			case "vanish":
				d.Vanish = 1
			case "reflect":
				d.Reflect = 1
			}
			ev := primalHits(primalEvents(b, a, 12))
			first := ev[0]
			if first.Target != 12 || first.ActorHP != a.MaxHP && state != "reflect" {
				t.Fatalf("target/actor metadata lost: %+v", ev)
			}
			switch state {
			case "guardian":
				if first.Guardian != 19 || first.HP != d.HP || first.Status != d.Status() || first.Damage <= 0 || b.F[12].HP != 100000 {
					t.Fatalf("wrong guardian recipient: %+v", ev)
				}
			case "mount":
				if first.PetDamage <= 0 || first.RideHP != d.Ride.HP || first.HP != d.HP || d.HP == 100000 || d.Ride.HP == 50000 {
					t.Fatalf("mount settlement dropped: %+v", ev)
				}
			case "absorb":
				if first.Result != Absorbed || d.HP <= 50000 || first.HP != d.HP || d.Status() != StNone {
					t.Fatalf("absorb settlement/proc wrong: %+v", ev)
				}
			case "vanish":
				if first.Result != Vanished || d.HP != 100000 || d.Status() != StNone {
					t.Fatalf("vanished hit damaged/procced: %+v", ev)
				}
			case "reflect":
				if first.Result != Reflected || first.ActorHP != 100000-first.Damage || d.HP != 100000 || d.Status() != StNone {
					t.Fatalf("reflect settlement/proc wrong: %+v", ev)
				}
			}
		})
	}
}

func TestPrimalCrossLethalReflectionAndKnockoutStopInvalidEffects(t *testing.T) {
	for _, state := range []string{"reflection", "death", "fly", "depart-after-first"} {
		b, a := primalBattle(13)
		d := b.F[12]
		d.guard = true
		switch state {
		case "reflection":
			a.HP = 1
			d.Reflect = 1
		case "death":
			d.HP = 1
		case "fly":
			d.HP, d.MaxHP = 50, 50
		case "depart-after-first":
			b.OnHit = func(_, target *Fighter, _ int) {
				if target.Slot == 12 {
					b.F[11].Flown = true
				}
			}
		}
		ev := primalHits(primalEvents(b, a, 12))
		if state == "reflection" {
			if len(ev) != 1 || a.HP != 0 || ev[0].ActorHP != 0 {
				t.Fatalf("dead caster kept attacking: %+v", ev)
			}
			continue
		}
		if state == "depart-after-first" {
			for _, e := range ev {
				if e.Target == 11 {
					t.Fatalf("left neighbor had already departed: %+v", ev)
				}
			}
			continue
		}
		if !ev[0].Dead || d.Status() != StNone || ev[0].Status != StNone || d.KilledBy != 5 {
			t.Fatalf("knockout gained poison or lost attribution: %+v", ev)
		}
		if state == "fly" && (!d.Flown || ev[0].Fly != 2) {
			t.Fatalf("native one-hit flight lost: %+v", ev)
		}
	}
}

func TestPrimalCrossBuffDoesNotActWhenCasterOrTargetsAreUnavailable(t *testing.T) {
	for _, state := range []string{"dead", "flown", "escaped", "dizzy", "paralysis", "sleep", "stone", "barrier", "no-targets"} {
		b, a := primalBattle(13)
		switch state {
		case "dead":
			a.HP = 0
		case "flown":
			a.Flown = true
		case "escaped":
			a.Escaped = true
		case "dizzy":
			a.dizzy = 1
		case "paralysis":
			a.status[StParalysis] = 3
		case "sleep":
			a.status[StSleep] = 3
		case "stone":
			a.status[StStone] = 3
		case "barrier":
			a.status[StBarrier] = 3
		case "no-targets":
			for slot := 10; slot < 20; slot++ {
				b.F[slot] = nil
			}
		}
		ev := primalEvents(b, a, 12)
		if len(primalHits(ev)) != 0 || a.Def != 100 || a.DefenseBoost() != 0 || a.DefenseTurns() != 0 {
			t.Fatalf("%s created buff or attack: %+v", state, ev)
		}
	}
}

func TestPrimalCrossPoisonProbabilityClampsAndNativeFatalLifecycle(t *testing.T) {
	for _, tc := range []struct{ attacker, defender, resist, want int }{{50, 50, 0, 35}, {100, 1, 0, 43}, {1, 100, 0, 28}, {50, 50, 1000, 28}, {50, 50, -999, 35}} {
		if got := primalPoisonChance(tc.attacker, tc.defender, tc.resist); got != tc.want {
			t.Fatalf("poison probability outside requested interval: %d want%d", got, tc.want)
		}
	}
	b, a := primalBattle(17)
	for slot := 11; slot < 20; slot++ {
		b.F[slot] = nil
	}
	d := b.F[10]
	found := false
	for seed := uint64(1); seed <= 100; seed++ {
		b.Rnd = rnd(seed)
		primalEvents(b, a, 10)
		if d.Status() == StDeepPoison {
			found = true
			break
		}
	}
	if !found || d.status[StDeepPoison] != 7 {
		t.Fatal("missing native five-turn poison")
	}
	for i := 0; i < 5; i++ {
		old := d.HP
		var ev []Event
		b.statusSeq(d, Command{Kind: Guard}, &ev)
		if !d.Alive() || d.HP >= old {
			t.Fatalf("native poison failed tick%d: %+v", i, ev)
		}
	}
	var ev []Event
	b.statusSeq(d, Command{Kind: Guard}, &ev)
	if d.Alive() || len(ev) != 1 || ev[0].Kind != Poison || !ev[0].Dead {
		t.Fatalf("uncured native poison did not expire fatally: %+v", ev)
	}
}

func primalHealing(ev []Event) []Event {
	var out []Event
	for _, e := range ev {
		if e.Kind == Heal && e.Skill == "赤爪裂阵" {
			out = append(out, e)
		}
	}
	return out
}

// HP fixtures deliberately overkill 55/56-point targets. Event.Damage alone
// would grant too much; rounding each individual 28-point hit grants too little.
func TestPrimalCrossHealsOnceFromSummedActualLossWithFloor(t *testing.T) {
	for _, tc := range []struct {
		name string
		hp   []int
		want int
	}{
		{"below-boundary", []int{55}, 0}, {"first-point", []int{56}, 1},
		{"sum-before-floor", []int{28, 28}, 1}, {"overkill-bounded", []int{100}, 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			b, a := primalBattle(13)
			for slot := 10; slot < 20; slot++ {
				b.F[slot] = nil
			}
			a.HP = 50000
			for i, hp := range tc.hp {
				d := enemy(10+i, "gu:1")
				d.HP, d.MaxHP, d.Def, d.Quick = hp, 100000, 0, 0
				d.guard = true
				b.Add(d)
			}
			ev := primalEvents(b, a, 10)
			heals := primalHealing(ev)
			if a.HP != 50000+tc.want || tc.want == 0 && len(heals) != 0 || tc.want > 0 && len(heals) != 1 {
				t.Fatalf("wrong aggregate actual-loss healing: hp=%d heals=%+v events=%+v", a.HP, heals, ev)
			}
			if tc.want > 0 {
				e := heals[0]
				if e.Actor != 5 || e.Target != 5 || e.Damage != tc.want || e.HP != a.HP || e.ActorHP != a.HP || e.Guardian != -1 || e.Effect != 199402 || e.Combo {
					t.Fatalf("invalid self-heal wire event: %+v", e)
				}
			}
		})
	}
}

func TestPrimalCrossHealingCountsGuardianAndMountActualLossOnly(t *testing.T) {
	for _, state := range []string{"guardian", "mount"} {
		b, a := primalBattle(13)
		for slot := 11; slot < 20; slot++ {
			b.F[slot] = nil
		}
		a.HP = 50000
		d := b.F[10]
		d.HP = 56
		d.guard = true
		if state == "guardian" {
			g := enemy(19, "gu:1")
			g.HP, g.MaxHP, g.Def = 56, 100000, 0
			g.guard = true
			b.Add(g)
			b.guardian[10] = 19
		} else {
			d.HP = 28
			d.Player = true
			d.Def = 100
			d.Ride = &Mount{HP: 28, MaxHP: 10000, Def: 100}
		}
		ev := primalEvents(b, a, 10)
		heals := primalHealing(ev)
		if a.HP != 50001 || len(heals) != 1 || heals[0].Damage != 1 {
			t.Fatalf("%s actual loss total56 did not heal1: %+v", state, ev)
		}
		if state == "guardian" && b.F[10].HP != 56 {
			t.Fatal("healing counted untouched original guardian target")
		}
	}
}

func TestPrimalCrossHealingIgnoresBarriersAndCannotReviveOrOverheal(t *testing.T) {
	for _, state := range []string{"absorb", "vanish", "reflect", "reflection-death", "full-hp", "cap-at-max", "dodge"} {
		b, a := primalBattle(13)
		for slot := 11; slot < 20; slot++ {
			b.F[slot] = nil
		}
		d := b.F[10]
		d.guard = true
		a.HP = 50000
		switch state {
		case "absorb":
			d.HP = 50000
			d.Absorb = 1
		case "vanish":
			d.Vanish = 1
		case "reflect":
			d.Reflect = 1
		case "reflection-death":
			a.HP = 1
			d.Reflect = 1
		case "full-hp":
			a.HP = a.MaxHP
			d.HP = 100
		case "cap-at-max":
			a.HP = a.MaxHP - 1
			d.HP = 1000
		case "dodge":
			d.guard = false
		}
		if state == "dodge" {
			// Find an actual miss without introducing a test-only random hook.
			for seed := uint64(1); seed <= 100; seed++ {
				r := rnd(seed)
				r.IntN(31)
				if r.IntN(100) >= 80 {
					b.Rnd = rnd(seed)
					break
				}
			}
		}
		ev := primalEvents(b, a, 10)
		heals := primalHealing(ev)
		if state == "cap-at-max" {
			if len(heals) != 1 || heals[0].Damage != 1 || a.HP != a.MaxHP {
				t.Fatalf("heal exceeded missing HP: %+v", ev)
			}
			continue
		}
		if len(heals) != 0 {
			t.Fatalf("%s incorrectly triggered healing: %+v", state, ev)
		}
		if state == "reflection-death" && a.HP != 0 {
			t.Fatal("self-heal revived reflected death")
		}
		if state == "dodge" && primalHits(ev)[0].Result != Dodge {
			t.Fatal("missing positive dodge control")
		}
	}
}

func TestPrimalCrossEarlierRealDamageCannotHealLaterFatalReflection(t *testing.T) {
	b, a := primalBattle(13)
	for slot := 12; slot < 20; slot++ {
		b.F[slot] = nil
	}
	a.HP = 1
	first, second := b.F[10], b.F[11]
	first.guard, second.guard = true, true
	first.HP = 1000
	second.Reflect = 1
	ev := primalEvents(b, a, 10)
	hits := primalHits(ev)
	if len(hits) != 2 || hits[0].HP != 0 || hits[1].Result != Reflected || a.HP != 0 || len(primalHealing(ev)) != 0 {
		t.Fatalf("earlier damage revived reflected death: %+v", ev)
	}
}
