package battle

import (
	"testing"

	"sa/server/internal/data"
)

func ghostStormSkill() *data.Skill {
	return &data.Skill{ID: 29040, Name: "幽灵风暴", Func: "PETSKILL_GhostStorm", Field: 1, Target: 3}
}

func TestGhostStormResolveHitsOnlyCurrentEnemySide(t *testing.T) {
	b := New(rnd(7))
	caster := pet(5, 100)
	caster.HP, caster.MaxHP, caster.Atk, caster.Quick = 100000, 100000, 500, 10
	b.Add(player(0))
	b.Add(caster)
	for _, slot := range []int{10, 11, 12, 13, 14, 15, 16} {
		f := enemy(slot, "gu:1")
		f.HP, f.MaxHP, f.Quick = 100000, 100000, 1
		b.Add(f)
	}
	b.F[11].HP = 0
	b.F[12].Flown = true
	b.F[13].Escaped = true
	b.F[14].hidden = true
	b.F[15].status[StPoison] = 3 // Existing conditions must not be overwritten.
	events := b.Resolve(map[int]Command{0: {Kind: Guard}, 5: {Kind: Attack, Target: 21, Skill: ghostStormSkill()}})
	var storm []Event
	for _, e := range events {
		if e.Actor == 5 {
			storm = append(storm, e)
		}
	}
	if len(storm) != 3 {
		t.Fatalf("remote storm must hit exactly slots10/15/16 once each: %+v", storm)
	}
	for i, target := range []int{10, 15, 16} {
		e := storm[i]
		if e.Kind != Magic || e.Effect != 199201 || e.Target != target || e.Damage <= 0 || e.HP != 100000-e.Damage || e.ActorHP != caster.HP || e.ActorMP != caster.MP || e.Combo != (i < 2) {
			t.Fatalf("invalid grouped remote hit %d: %+v", i, e)
		}
	}
	if b.F[15].Status() != StPoison {
		t.Fatal("storm replaced an existing status")
	}
}

func TestGhostStormPhysicalDamageRatioAndBarrierSemantics(t *testing.T) {
	for _, state := range []string{"ordinary", "guard", "vanish", "absorb", "reflect", "capture"} {
		t.Run(state, func(t *testing.T) {
			makeBattle := func() (*Battle, *Fighter, *Fighter) {
				b := New(rnd(19))
				a, d := pet(5, 100), enemy(10, "gu:1")
				a.HP, a.MaxHP, a.Atk, a.Quick, a.Level = 50000, 100000, 500, 0, 50
				d.HP, d.MaxHP, d.Def, d.Quick, d.Level = 50000, 100000, 30, 0, 50
				b.Add(a)
				b.Add(d)
				switch state {
				case "guard":
					d.guard = true
				case "vanish":
					d.Vanish = 1
				case "absorb":
					d.Absorb = 1
				case "reflect":
					d.Reflect = 1
				case "capture":
					b.autoAvoidTargets = 1 << 10
				}
				return b, a, d
			}
			// Compare against a real ordinary physical hit under the same seeded
			// conditions: the skill changes its magnitude, not its hit engine.
			base, normalActor, normalTarget := makeBattle()
			ordinary, _ := base.attackOnce(normalActor, normalTarget, attackOpts{}, false)
			b, a, d := makeBattle()
			var events []Event
			b.skillAttack(a, Command{Kind: Attack, Target: 21, Skill: ghostStormSkill()}, &events)
			if state == "capture" {
				if len(events) != 1 || events[0].Kind != None || d.HP != 50000 {
					t.Fatalf("storm damaged protected capture target: %+v", events)
				}
				return
			}
			if len(events) != 1 {
				t.Fatalf("skill performed multiple damage passes: %+v", events)
			}
			e := events[0]
			if e.Damage != ordinary.Damage*3/4 {
				t.Fatalf("physical damage must be 75%%: ordinary=%d storm=%+v", ordinary.Damage, e)
			}
			switch state {
			case "absorb":
				if e.Result != Absorbed || d.HP != 50000+e.Damage || d.Status() != StNone {
					t.Fatalf("absorption semantics changed: %+v", e)
				}
			case "reflect":
				if e.Result != Reflected || d.HP != 50000 || a.HP != 50000-e.Damage || e.ActorHP != a.HP || d.Status() != StNone {
					t.Fatalf("reflection semantics changed: %+v", e)
				}
			case "vanish":
				if e.Result != Vanished || d.HP != 50000 || d.Status() != StNone {
					t.Fatalf("vanish semantics changed: %+v", e)
				}
			default:
				if d.HP != 50000-e.Damage || e.HP != d.HP || a.HP != 50000 {
					t.Fatalf("physical hit applied wrong HP delta: %+v", e)
				}
			}
		})
	}
}

func TestGhostStormCannotActAfterKnockoutDepartureOrDisable(t *testing.T) {
	for _, state := range []string{"dead", "flown", "escaped", "paralysis", "stone", "sleep", "barrier", "dizzy"} {
		t.Run(state, func(t *testing.T) {
			b := New(rnd(7))
			a, d := pet(5, 100), enemy(10, "gu:1")
			a.HP, a.MaxHP, a.Atk, a.Quick = 100000, 100000, 500, 10
			b.Add(player(0))
			b.Add(a)
			b.Add(d)
			switch state {
			case "dead":
				a.HP = 0
			case "flown":
				a.Flown = true
			case "escaped":
				a.Escaped = true
			case "dizzy":
				a.dizzy = 2
			default:
				st := map[string]int{"paralysis": StParalysis, "stone": StStone, "sleep": StSleep, "barrier": StBarrier}[state]
				a.status[st] = 2
			}
			hp := d.HP
			events := b.Resolve(map[int]Command{0: {Kind: Guard}, 5: {Kind: Attack, Target: 21, Skill: ghostStormSkill()}})
			for _, e := range events {
				if e.Actor == 5 && e.Kind != Stun {
					t.Fatalf("invalid caster performed action: %+v", e)
				}
			}
			if d.HP != hp {
				t.Fatalf("invalid caster dealt damage: %+v", events)
			}
		})
	}
}

func TestGhostStormPetrificationRateAndDuration(t *testing.T) {
	for _, tc := range []struct {
		name                             string
		attacker, defender, resist, want int
	}{
		{name: "equal", attacker: 50, defender: 50, want: 55},
		{name: "advantage", attacker: 90, defender: 40, want: 80},
		{name: "disadvantage", attacker: 10, defender: 100, want: 35},
		{name: "resisted", attacker: 50, defender: 50, resist: 20, want: 35},
		{name: "high-resistance-floor", attacker: 100, defender: 1, resist: 1000, want: 35},
		{name: "negative-resistance", attacker: 50, defender: 50, resist: -100, want: 55},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := ghostStormStoneChance(tc.attacker, tc.defender, tc.resist); got != tc.want {
				t.Fatalf("petrification chance=%d want %d", got, tc.want)
			}
			landed, petrified := 0, 0
			for seed := uint64(1); seed <= 1200; seed++ {
				b := New(rnd(seed))
				a, d := pet(5, 100), enemy(10, "gu:1")
				a.HP, a.MaxHP, a.Atk, a.Quick, a.Level = 100000, 100000, 500, 0, tc.attacker
				d.HP, d.MaxHP, d.Def, d.Quick, d.Level, d.Resist[StStone] = 100000, 100000, 0, 0, tc.defender, tc.resist
				b.Add(a)
				b.Add(d)
				var events []Event
				b.skillAttack(a, Command{Kind: Attack, Target: 21, Skill: ghostStormSkill()}, &events)
				if len(events) != 1 || events[0].Damage <= 0 {
					continue
				}
				landed++
				if d.Status() == StStone {
					petrified++
					if events[0].Status != StStone || d.status[StStone] != 3 {
						t.Fatalf("missing authoritative stone status/duration: %+v", events)
					}
				}
			}
			if landed < 1000 || petrified*100 < landed*(tc.want-5) || petrified*100 > landed*(tc.want+5) {
				t.Fatalf("observed petrification outside specified bounded rate: %d/%d want %d%%", petrified, landed, tc.want)
			}
		})
	}
}

func TestGhostStormReflectionStopsRemainingTargets(t *testing.T) {
	b := New(rnd(7))
	caster := pet(5, 100)
	caster.HP, caster.MaxHP, caster.Atk, caster.Quick = 1, 100000, 500, 10
	b.Add(player(0))
	b.Add(caster)
	for _, slot := range []int{10, 11} {
		f := enemy(slot, "gu:1")
		f.HP, f.MaxHP, f.Quick = 100000, 100000, 1
		b.Add(f)
	}
	b.F[10].Reflect = 1
	events := b.Resolve(map[int]Command{0: {Kind: Guard}, 5: {Kind: Attack, Target: 21, Skill: ghostStormSkill()}})
	hits := 0
	for _, e := range events {
		if e.Actor != 5 {
			continue
		}
		hits++
		if e.Kind != Magic || e.Result != Reflected || e.Target != 10 || e.ActorHP != 0 || e.Status != StNone || e.Combo {
			t.Fatalf("reflection must report authoritative caster death: %+v", e)
		}
	}
	if hits != 1 || caster.Alive() || caster.KilledBy != 10 || b.F[11].HP != 100000 || b.F[10].Status() != StNone {
		t.Fatalf("dead caster continued or reflected target was stoned: hits=%d hp=%d next=%d events=%+v", hits, caster.HP, b.F[11].HP, events)
	}
}

func TestGhostStormGroupKnockoutsAndMidActionDeparture(t *testing.T) {
	for _, state := range []string{"group-flight", "later-target-leaves"} {
		t.Run(state, func(t *testing.T) {
			b := New(rnd(7))
			a := pet(5, 100)
			a.HP, a.MaxHP, a.Atk, a.Quick = 100000, 100000, 5000, 10
			b.Add(player(0))
			b.Add(a)
			for _, slot := range []int{10, 11, 12} {
				d := enemy(slot, "gu:1")
				d.HP, d.MaxHP, d.Quick = 1, 1, 0
				d.status[StParalysis] = 3
				b.Add(d)
			}
			if state == "later-target-leaves" {
				b.OnHit = func(_, d *Fighter, _ int) {
					if d.Slot == 10 {
						b.F[11].Flown = true // Removed after target list creation.
					}
				}
			}
			events := b.Resolve(map[int]Command{0: {Kind: Guard}, 5: {Kind: Attack, Target: 21, Skill: ghostStormSkill()}})
			hits := 0
			for _, e := range events {
				if e.Actor != 5 {
					continue
				}
				hits++
				if e.Kind != Magic || !e.Dead || e.HP != 0 || e.Fly == 0 || state == "later-target-leaves" && e.Target == 11 {
					t.Fatalf("invalid group knockout or hit after departure: %+v", e)
				}
			}
			want := 3
			if state == "later-target-leaves" {
				want = 2
				if b.F[11].HP != 1 {
					t.Fatal("mid-action departed fighter received damage")
				}
			}
			if over, winner := b.Over(); hits != want || !over || winner != 0 {
				t.Fatalf("storm must finish all still-present opponents: hits=%d over=%v winner=%d events=%+v", hits, over, winner, events)
			}
		})
	}
}

func TestGhostStormGuardianUsesActualRecipientAndCaptureProtection(t *testing.T) {
	for _, protect := range []bool{false, true} {
		b := New(rnd(19))
		a, original, guardian := pet(5, 100), enemy(10, "gu:1"), enemy(15, "gu:1")
		a.HP, a.MaxHP, a.Atk, a.Quick = 100000, 100000, 500, 0
		original.HP, original.MaxHP, original.Quick = 100000, 100000, 0
		guardian.HP, guardian.MaxHP, guardian.Quick = 100000, 100000, 0
		b.Add(a)
		b.Add(original)
		b.Add(guardian)
		b.guardian[10] = 15
		if protect {
			b.autoAvoidTargets = 1 << 15
		}
		var events []Event
		b.skillAttack(a, Command{Kind: Attack, Target: 21, Skill: ghostStormSkill()}, &events)
		if original.HP != 100000 {
			t.Fatalf("guardian did not intercept original target damage: %+v", events)
		}
		if protect {
			if len(events) != 1 || events[0].Kind != None || guardian.HP != 100000 {
				t.Fatalf("storm bypassed capture guardian protection: %+v", events)
			}
			continue
		}
		if len(events) != 2 || events[0].Guardian != 15 || events[0].Target != 10 || events[1].Target != 15 || guardian.HP != 100000-events[0].Damage-events[1].Damage || events[1].HP != guardian.HP {
			t.Fatalf("guardian events must identify actual recipient HP: %+v", events)
		}
	}
}
