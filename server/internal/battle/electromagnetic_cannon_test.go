package battle

import (
	"testing"

	"sa/server/internal/data"
)

func cannonSkill() *data.Skill {
	return &data.Skill{ID: 29050, Name: "电磁火炮", Func: "PETSKILL_ElectromagneticCannon", Field: 1, Target: 1}
}

func cannonBattle(seed uint64) (*Battle, *Fighter) {
	b := New(rnd(seed))
	a := pet(5, 100)
	a.HP, a.MaxHP, a.Atk, a.Quick, a.Level = 100000, 100000, 500, 0, 50
	b.Add(a)
	for _, slot := range []int{10, 15, 16} {
		d := enemy(slot, "gu:1")
		d.HP, d.MaxHP, d.Def, d.Quick, d.Level = 100000, 100000, 0, 0, 50
		b.Add(d)
	}
	return b, a
}

func TestElectromagneticCannonFiveRandomRemoteShots(t *testing.T) {
	b, a := cannonBattle(17)
	var events []Event
	b.skillAttack(a, Command{Kind: Attack, Target: 0, Skill: cannonSkill()}, &events)
	hits, targets := 0, map[int]bool{}
	for _, e := range events {
		if e.Actor != a.Slot {
			continue
		}
		hits++
		targets[e.Target] = true
		if e.Kind != Magic || e.Effect != 199301 || e.Damage <= 0 || e.Combo || e.ActorHP != a.HP || e.ActorMP != a.MP || e.Target != 10 && e.Target != 15 && e.Target != 16 {
			t.Fatalf("invalid independent remote shot: %+v", e)
		}
	}
	if hits != 5 || len(targets) < 2 {
		t.Fatalf("expected five shots randomly across live enemies, got %d/%v: %+v", hits, targets, events)
	}
}

func TestElectromagneticCannonPhysicalRatioAndBarriers(t *testing.T) {
	for _, state := range []string{"ordinary", "guard", "absorb", "vanish", "reflect"} {
		t.Run(state, func(t *testing.T) {
			for seed := uint64(1); seed <= 80; seed++ {
				makeBattle := func() (*Battle, *Fighter, *Fighter) {
					b, a := cannonBattle(seed)
					b.F[15], b.F[16] = nil, nil
					d := b.F[10]
					d.HP = 50000
					switch state {
					case "guard":
						d.guard = true
					case "absorb":
						d.Absorb = 5
					case "vanish":
						d.Vanish = 5
					case "reflect":
						d.Reflect = 5
					}
					return b, a, d
				}
				base, ba, bd := makeBattle()
				base.Rnd.IntN(1) // Target/factor are drawn before the physical engine.
				base.Rnd.IntN(4)
				ordinary, _ := base.attackOnce(ba, bd, attackOpts{}, false)
				b, a, d := makeBattle()
				var ev []Event
				b.electromagneticCannon(a, Command{Skill: cannonSkill()}, &ev)
				e := ev[0]
				if ordinary.Damage > 0 && state != "vanish" && (e.Damage < ordinary.Damage*15/100-1 || e.Damage > ordinary.Damage*18/100+1) {
					t.Fatalf("shot outside 15..18%% physical interval: base=%+v shot=%+v", ordinary, e)
				}
				if len(ev) != 5 || e.Effect != 199301 || e.Combo {
					t.Fatalf("barrier changed five-shot dispatch: %+v", ev)
				}
				switch state {
				case "absorb":
					if e.Result != Absorbed || d.HP <= 50000 || d.Status() != StNone {
						t.Fatalf("absorb side effect: %+v", ev)
					}
				case "vanish":
					if e.Result != Vanished || d.HP != 50000 || d.Status() != StNone {
						t.Fatalf("vanish side effect: %+v", ev)
					}
				case "reflect":
					if e.Result != Reflected || a.HP >= 100000 || d.HP != 50000 || d.Status() != StNone {
						t.Fatalf("reflect side effect: %+v", ev)
					}
				}
			}
		})
	}
}

func TestElectromagneticCannonEffectRatesAndExclusiveFirstShot(t *testing.T) {
	for _, tc := range []struct {
		name                                    string
		attacker, defender, resist, para, drive int
	}{
		{"equal", 50, 50, 0, 35, 20}, {"upper", 100, 1, 0, 50, 30},
		{"lower", 1, 100, 0, 20, 10}, {"resisted", 50, 50, 1000, 20, 20},
		{"negative-resistance", 50, 50, -100, 35, 20},
	} {
		t.Run(tc.name, func(t *testing.T) {
			landed, paralyzed, displaced := 0, 0, 0
			for seed := uint64(1); seed <= 4000; seed++ {
				b, a := cannonBattle(seed)
				b.F[15], b.F[16] = nil, nil
				d := b.F[10]
				a.Level, d.Level, d.Resist[StParalysis] = tc.attacker, tc.defender, tc.resist
				d.Seed = &PetSeed{Capture: true}
				var ev []Event
				b.electromagneticCannon(a, Command{Skill: cannonSkill()}, &ev)
				first := ev[0]
				if first.Damage <= 0 || first.Result != MagicDamage {
					continue
				}
				landed++
				stone := first.Status == StParalysis
				leave := len(ev) > 1 && ev[1].Kind == Flee
				if stone && leave {
					t.Fatalf("one shot applied both classes: %+v", ev)
				}
				if stone {
					paralyzed++
				}
				if leave {
					displaced++
					if ev[1].HP <= 0 || ev[1].Actor != 10 {
						t.Fatalf("displacement became death: %+v", ev)
					}
				}
			}
			// Each requested proc interval is conditional on its 50/50 class.
			// Observe the actual first-hit distribution, including immune later states.
			if landed < 3500 || paralyzed*200 < landed*(tc.para-5) || paralyzed*200 > landed*(tc.para+5) || displaced*200 < landed*(tc.drive-5) || displaced*200 > landed*(tc.drive+5) {
				t.Fatalf("proc distribution para=%d drive=%d landed=%d expected class rates %d/%d", paralyzed, displaced, landed, tc.para, tc.drive)
			}
			t.Logf("first positive hits=%d paralysis=%d displacement=%d (50/50 classes, conditional %d%%/%d%%)", landed, paralyzed, displaced, tc.para, tc.drive)
		})
	}
}

func TestElectromagneticCannonDisplacementImmunityDoesNotRerollParalysis(t *testing.T) {
	for _, state := range []string{"pvp", "scripted", "no-escape", "player", "pet", "uncapturable", "no-seed"} {
		t.Run(state, func(t *testing.T) {
			paralyzed := 0
			for seed := uint64(1); seed <= 2000; seed++ {
				b, a := cannonBattle(seed)
				b.F[15], b.F[16] = nil, nil
				d := b.F[10]
				d.Seed = &PetSeed{Capture: true}
				switch state {
				case "pvp":
					b.PvP = true
				case "scripted":
					b.NoAbduct = true
				case "no-escape":
					b.NoDisplacement = true
				case "player":
					d.Player = true
				case "pet":
					d.Pet = true
				case "uncapturable":
					d.Seed.Capture = false
				case "no-seed":
					d.Seed = nil
				}
				var ev []Event
				b.electromagneticCannon(a, Command{Skill: cannonSkill()}, &ev)
				for _, e := range ev {
					if e.Kind == Flee || d.Escaped {
						t.Fatalf("immune target displaced: %s %+v", state, ev)
					}
				}
				if ev[0].Status == StParalysis {
					paralyzed++
				}
			}
			if paralyzed < 250 || paralyzed > 450 {
				t.Fatalf("immune drive branch rerolled paralysis: %d/2000", paralyzed)
			}
		})
	}
}

func TestElectromagneticCannonRetargetsAfterDepartureOrDeath(t *testing.T) {
	for _, state := range []string{"departed", "dead", "already-flown", "already-escaped", "capture", "guardian-capture"} {
		t.Run(state, func(t *testing.T) {
			b, a := cannonBattle(17)
			b.F[10].hidden = true
			if state == "already-flown" {
				b.F[15].Flown = true
			}
			if state == "already-escaped" {
				b.F[15].Escaped = true
			}
			if state == "capture" {
				b.autoAvoidTargets = 1 << 15
			}
			if state == "guardian-capture" {
				b.autoAvoidTargets = 1 << 15
				b.guardian[16] = 15
			}
			b.OnHit = func(_, _ *Fighter, _ int) {
				if state == "departed" {
					b.F[15].Flown = true
				}
				if state == "dead" {
					b.F[15].HP = 0
				}
			}
			var ev []Event
			b.electromagneticCannon(a, Command{Skill: cannonSkill()}, &ev)
			if state == "guardian-capture" {
				if len(ev) != 1 || ev[0].Kind != None || b.F[15].HP != 100000 || b.F[16].HP != 100000 {
					t.Fatalf("capture guardian bypassed: %+v", ev)
				}
				return
			}
			for i, e := range ev {
				if e.Kind != Magic || e.Target == 10 || (state == "capture" || state == "already-flown" || state == "already-escaped" || i > 0) && e.Target == 15 {
					t.Fatalf("reused retired/protected target: %+v", ev)
				}
			}
		})
	}
}

func TestElectromagneticCannonReflectionStopsShotsAndInvalidCasterCannotAct(t *testing.T) {
	for _, state := range []string{"reflect", "dead", "flown", "escaped", "paralysis", "stone", "sleep", "barrier", "dizzy"} {
		t.Run(state, func(t *testing.T) {
			b, a := cannonBattle(17)
			b.Add(player(0))
			b.F[15], b.F[16] = nil, nil
			switch state {
			case "reflect":
				a.HP = 1
				b.F[10].Reflect = 5
			case "dead":
				a.HP = 0
			case "flown":
				a.Flown = true
			case "escaped":
				a.Escaped = true
			case "dizzy":
				a.dizzy = 2
			default:
				a.status[map[string]int{"paralysis": StParalysis, "stone": StStone, "sleep": StSleep, "barrier": StBarrier}[state]] = 2
			}
			ev := b.Resolve(map[int]Command{0: {Kind: Guard}, 5: {Kind: Attack, Target: 10, Skill: cannonSkill()}})
			hits := 0
			for _, e := range ev {
				if e.Actor != 5 || e.Kind == Stun {
					continue
				}
				hits++
				if state != "reflect" || e.Kind != Magic || e.Result != Reflected || e.ActorHP != 0 || e.Combo {
					t.Fatalf("invalid caster acted or reflection lost: %s %+v", state, ev)
				}
			}
			if state == "reflect" {
				if hits != 1 || a.HP != 0 || a.KilledBy != 10 || b.F[10].HP != 100000 {
					t.Fatalf("reflected caster continued: %+v", ev)
				}
			} else if hits != 0 || b.F[10].HP != 100000 {
				t.Fatalf("disabled caster dealt damage: %+v", ev)
			}
		})
	}
}

func TestElectromagneticCannonFleeIsTerminalAndParalysisSkipsThreeActions(t *testing.T) {
	sawFlee, sawParalysis := false, false
	for seed := uint64(1); seed <= 200 && (!sawFlee || !sawParalysis); seed++ {
		b, a := cannonBattle(seed)
		b.F[15], b.F[16] = nil, nil
		d := b.F[10]
		d.Seed = &PetSeed{Capture: true}
		var ev []Event
		b.electromagneticCannon(a, Command{Skill: cannonSkill()}, &ev)
		for i, e := range ev {
			if e.Kind == Flee {
				sawFlee = true
				if i != len(ev)-1 || d.HP <= 0 || d.Flown || !d.Escaped || d.Alive() {
					t.Fatalf("post-flee shot or death: %+v", ev)
				}
				if over, winner := b.Over(); !over || winner != 0 {
					t.Fatalf("last enemy displacement did not finish battle: %v/%d", over, winner)
				}
			}
		}
		if d.Status() == StParalysis && !d.Escaped {
			sawParalysis = true
			if d.status[StParalysis] != 3 {
				t.Fatalf("wrong paralysis duration: %d", d.status[StParalysis])
			}
			for i := 0; i < 3; i++ {
				var events []Event
				if _, ok := b.statusSeq(d, Command{Kind: Attack}, &events); ok {
					t.Fatalf("paralysis allowed action %d", i)
				}
			}
			if d.Status() != StNone {
				t.Fatal("paralysis did not expire")
			}
			if _, ok := b.statusSeq(d, Command{Kind: Attack}, new([]Event)); !ok {
				t.Fatal("expired paralysis still blocks action")
			}
		}
	}
	if !sawFlee || !sawParalysis {
		t.Fatalf("positive control effect not observed flee=%v para=%v", sawFlee, sawParalysis)
	}
}

func TestElectromagneticCannonGuardianAndMountUseActualDamageRecipient(t *testing.T) {
	sawGuardianFlee, sawGuardianParalysis := false, false
	for seed := uint64(1); seed <= 1000 && (!sawGuardianFlee || !sawGuardianParalysis); seed++ {
		b, a := cannonBattle(seed)
		b.F[16] = nil
		d, g := b.F[10], b.F[15]
		b.guardian[10] = 15
		g.Seed = &PetSeed{Capture: true}
		var ev []Event
		b.electromagneticCannon(a, Command{Skill: cannonSkill()}, &ev)
		e := ev[0]
		if e.Target != 10 {
			continue
		}
		if e.Guardian != 15 || e.HP != 100000-e.Damage {
			t.Fatalf("guardian shot metadata lost: %+v", e)
		}
		if e.Status == StParalysis {
			sawGuardianParalysis = true
			if d.Status() != StNone {
				t.Fatalf("guardian paralysis applied to original: %+v", ev)
			}
		}
		if len(ev) > 1 && ev[1].Kind == Flee {
			sawGuardianFlee = true
			if ev[1].Actor != 15 || !g.Escaped || d.Escaped {
				t.Fatalf("displaced wrong guardian target: %+v", ev)
			}
			for _, later := range ev[2:] {
				if later.Target == 15 || later.Guardian == 15 {
					t.Fatalf("later shot hit departed guardian: %+v", ev)
				}
			}
		}
	}
	if !sawGuardianFlee || !sawGuardianParalysis {
		t.Fatal("missing guardian effect positive control")
	}
	b, a := cannonBattle(17)
	b.F[15], b.F[16] = nil, nil
	d := b.F[10]
	d.Ride = &Mount{HP: 100000, MaxHP: 100000, Def: 30}
	d.Def = 30
	var ev []Event
	b.electromagneticCannon(a, Command{Skill: cannonSkill()}, &ev)
	human, mount := 0, 0
	for _, e := range ev {
		if e.Kind != Magic || e.PetDamage <= 0 {
			t.Fatalf("mount split missing: %+v", ev)
		}
		human += e.Damage
		mount += e.PetDamage
		if e.HP != 100000-human || e.RideHP != 100000-mount {
			t.Fatalf("stale mount HP in ordered shots: %+v", ev)
		}
	}
	if d.HP != 100000-human || d.Ride.HP != 100000-mount {
		t.Fatal("mount split applied more than once")
	}
}

func TestElectromagneticCannonPreservesExistingConditionsAndNeverCounters(t *testing.T) {
	b, _ := cannonBattle(17)
	b.Add(player(0))
	b.F[15], b.F[16] = nil, nil
	d := b.F[10]
	d.status[StPoison] = 10
	d.Skills[0] = &data.Skill{ID: 3, Func: "PETSKILL_NoGuard", Field: 1, Option: "反击%+1000", Target: 0}
	d.Tactics = "wa:1"
	ev := b.Resolve(map[int]Command{0: {Kind: Guard}, 5: {Kind: Attack, Target: 10, Skill: cannonSkill()}})
	for _, e := range ev {
		if e.Kind == Counter {
			t.Fatalf("cannon provoked counter: %+v", ev)
		}
	}
	if d.Status() != StPoison {
		t.Fatalf("cannon overwrote existing condition: %d", d.Status())
	}
}
