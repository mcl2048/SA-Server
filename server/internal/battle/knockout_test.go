package battle

import (
	"testing"

	"sa/server/internal/data"
)

// A real queued turn reproduces the invisible-slot bug: the first strike flies
// an enemy away, a slower healer revives it, and its previously queued attack
// then fires from the departed slot. Flying away must be permanent this battle.
func TestFlownEnemyCannotReturnThroughEnemyRevive(t *testing.T) {
	b := New(rnd(7))
	p := player(0)
	p.HP, p.MaxHP, p.Atk, p.Quick = 10000, 10000, 1000000, 10000
	b.Add(p)
	victim := enemy(10, "at:1;1;1")
	victim.HP, victim.MaxHP, victim.Atk, victim.Quick = 10, 100, 1000, 1
	victim.status[StParalysis] = 3 // No dodge; revival would clear this state.
	b.Add(victim)
	healer := enemy(11, "wa:1")
	healer.HP, healer.MaxHP, healer.Quick = 1000, 1000, 100
	healer.Skills[0] = &data.Skill{ID: 500, Name: "敌人复活", Func: "ENEMYSKILL_ReLife", Field: 1, Target: 2}
	b.Add(healer)

	events := b.Resolve(map[int]Command{0: {Kind: Attack, Target: 10, Automatic: true}})
	flew := false
	for _, e := range events {
		flew = flew || e.Target == 10 && e.Fly > 0 && e.Dead
		if e.Kind == Revive && e.Target == 10 || e.Actor == 10 {
			t.Errorf("departed enemy re-entered the turn: %+v", e)
		}
	}
	if !flew || victim.HP != 0 || !victim.Flown || victim.Alive() {
		t.Fatalf("flown enemy must remain dead/off-field: flew=%v hp=%d flown=%v alive=%v; events=%+v", flew, victim.HP, victim.Flown, victim.Alive(), events)
	}
}

// Ordinary knockout remains revivable. Only flight/escape makes resurrection
// invalid, for players, pets and enemies alike, through both spells and items.
func TestResurrectionExcludesDepartedFighters(t *testing.T) {
	for _, role := range []string{"player", "pet", "enemy"} {
		for _, source := range []string{"magic", "item"} {
			for _, state := range []string{"knocked-out", "flown", "escaped"} {
				t.Run(role+"/"+source+"/"+state, func(t *testing.T) {
					b := New(rnd(3))
					caster, target := enemy(11, "gu:1"), enemy(10, "at:1")
					if role == "player" {
						target = player(0)
					} else if role == "pet" {
						target = pet(5, 100)
					}
					b.Add(caster)
					b.Add(target)
					target.HP, target.KilledBy, target.KilledRide = 0, 2, true
					target.status[StPoison] = 3
					target.Flown, target.Escaped = state == "flown", state == "escaped"
					var events []Event
					if source == "magic" {
						b.castMagic(caster, Command{Kind: Magic, Target: target.Slot, Magic: &data.Magic{Func: "MAGIC_Ressurect", Option: "0"}}, &events)
					} else {
						b.useItem(caster, Command{Kind: UseItem, Target: target.Slot, ItemFunc: "ITEM_useRessurect", ItemArg: "0"}, &events)
					}
					if state == "knocked-out" {
						if target.HP != target.MaxHP || !target.Alive() || target.Status() != StNone || target.KilledBy != -1 || target.KilledRide {
							t.Fatalf("explicit revival must restore life and reset kill attribution: hp=%d status=%d killedBy=%d killedRide=%v", target.HP, target.Status(), target.KilledBy, target.KilledRide)
						}
					} else if target.HP != 0 || target.Alive() {
						t.Fatalf("%s fighter resurrected: hp=%d; events=%+v", state, target.HP, events)
					}
				})
			}
		}
	}
}

func TestEnemyReviveResetsKnockoutAttribution(t *testing.T) {
	b := New(rnd(3))
	healer, target := enemy(11, "gu:1"), enemy(10, "at:1")
	b.Add(player(0))
	b.Add(healer)
	b.Add(target)
	target.HP, target.KilledBy, target.KilledRide = 0, 0, true
	target.status[StPoison] = 3
	var events []Event
	b.support(healer, Command{Kind: Revive}, &events)
	if len(events) != 1 || events[0].Kind != Revive || target.HP != target.MaxHP/2 || target.Status() != StNone || target.KilledBy != -1 || target.KilledRide {
		t.Fatalf("ordinary enemy revival retained death state: hp=%d status=%d killedBy=%d killedRide=%v events=%+v", target.HP, target.Status(), target.KilledBy, target.KilledRide, events)
	}
}

// HP is not sufficient to put a departed fighter back into targeting or victory
// checks. This guards stale positive HP from an old recovery path as well.
func TestFlownFighterPositiveHPDoesNotDelayVictoryOrReceiveHits(t *testing.T) {
	b := New(rnd(3))
	p, gone := player(0), enemy(10, "at:1")
	b.Add(p)
	b.Add(gone)
	gone.Flown = true
	if over, winner := b.Over(); !over || winner != 0 {
		t.Errorf("departed enemy delayed victory: over=%v winner=%d", over, winner)
	}
	if target := b.pickTarget(p, 10); target != nil {
		t.Errorf("departed slot remained an attack target: %d", target.Slot)
	}
	if targets := b.magicTargets(10, false); len(targets) != 0 {
		t.Errorf("departed slot remained a spell target: %v", targets)
	}
	if events := b.Resolve(map[int]Command{0: {Kind: Attack, Target: 10}}); len(events) != 0 {
		t.Errorf("finished battle emitted actions at departed slot: %+v", events)
	}
}

func TestRecoveryCannotRestoreKnockedOutOrDepartedFighter(t *testing.T) {
	for _, source := range []string{"magic", "item", "enemy", "skill"} {
		for _, state := range []string{"knocked-out", "flown", "flown-positive-hp", "escaped"} {
			t.Run(source+"/"+state, func(t *testing.T) {
				b := New(rnd(3))
				caster, target := enemy(11, "gu:1"), enemy(10, "gu:1")
				b.Add(player(0))
				b.Add(caster)
				b.Add(target)
				target.HP = 0
				if state == "flown-positive-hp" || state == "escaped" {
					target.HP = 1
				}
				target.Flown, target.Escaped = state == "flown" || state == "flown-positive-hp", state == "escaped"
				before := target.HP
				var events []Event
				switch source {
				case "magic":
					b.castMagic(caster, Command{Kind: Magic, Target: 10, Magic: &data.Magic{Func: "MAGIC_Recovery", Option: "100", Target: data.MagicTargetOther}}, &events)
				case "item":
					b.useItem(caster, Command{Kind: UseItem, Target: 10, ItemFunc: "ITEM_useRecovery", ItemArg: "体100"}, &events)
				case "enemy":
					b.support(caster, Command{Kind: Heal, Target: 0}, &events)
				case "skill":
					b.setMagicPet(caster, Command{Target: 10, Skill: &data.Skill{Func: "PETSKILL_SetMagicPet", Option: "3|100|HP", Target: 1}}, &events)
				}
				if target.HP != before {
					t.Fatalf("ordinary recovery restored %s fighter: before=%d after=%d events=%+v", state, before, target.HP, events)
				}
			})
		}
	}
}

func TestDeepPoisonKnockoutEndsBattleWithoutFlight(t *testing.T) {
	for _, role := range []string{"player", "pet", "enemy"} {
		t.Run(role, func(t *testing.T) {
			b := New(rnd(4))
			victim, opponent, winner := player(0), enemy(10, "gu:1"), 1
			if role == "pet" {
				victim = pet(5, 100)
			} else if role == "enemy" {
				victim, opponent, winner = enemy(10, "at:1"), player(0), 0
			}
			victim.status[StDeepPoison] = 2
			b.Add(victim)
			b.Add(opponent)
			events := b.Resolve(map[int]Command{victim.Slot: {Kind: Attack, Target: opponent.Slot, Automatic: true}, opponent.Slot: {Kind: Guard}})
			death := false
			for _, e := range events {
				death = death || e.Actor == victim.Slot && e.Kind == Poison && e.Dead && e.HP == 0 && e.Fly == 0
				if e.Actor == victim.Slot && e.Kind != Poison {
					t.Errorf("poison knockout still acted: %+v", e)
				}
			}
			if over, won := b.Over(); !death || !over || won != winner || victim.Alive() || victim.Flown {
				t.Fatalf("poison death did not finish battle: death=%v over=%v winner=%d hp=%d flown=%v events=%+v", death, over, won, victim.HP, victim.Flown, events)
			}
		})
	}
}

// Keep an ally standing so the battle continues after this strike. A dead
// fighter's queued command must be skipped even when Over() is still false.
func TestOrdinaryKnockoutSkipsQueuedAndLaterActions(t *testing.T) {
	for _, role := range []string{"player", "pet", "enemy"} {
		t.Run(role, func(t *testing.T) {
			b := New(rnd(4))
			victim, ally, attacker := player(0), pet(5, 100), enemy(10, "at:1;2;1")
			if role == "pet" {
				victim, ally, attacker.Tactics = pet(5, 100), player(0), "at:1;3;1"
			} else if role == "enemy" {
				victim, ally, attacker = enemy(10, "at:1"), enemy(11, "gu:1"), player(0)
			}
			victim.HP, victim.MaxHP, victim.Quick = 1, 1000000, 0
			victim.status[StParalysis] = 3 // Guarantees the incoming strike lands.
			ally.HP, ally.MaxHP, ally.Quick = 1000000, 1000000, 0
			attacker.HP, attacker.MaxHP, attacker.Atk, attacker.Quick = 1000000, 1000000, 1000, 1000
			b.Add(victim)
			b.Add(ally)
			b.Add(attacker)
			commands := map[int]Command{
				victim.Slot:   {Kind: Attack, Target: attacker.Slot, Automatic: true},
				ally.Slot:     {Kind: Guard},
				attacker.Slot: {Kind: Attack, Target: victim.Slot, Automatic: true},
			}
			for turn := 1; turn <= 2; turn++ {
				events := b.Resolve(commands)
				death := false
				for _, e := range events {
					death = death || e.Target == victim.Slot && e.Dead && e.HP == 0 && e.Fly == 0
					if e.Actor == victim.Slot {
						t.Errorf("knocked-out fighter acted on turn %d: %+v", turn, e)
					}
				}
				if turn == 1 && !death || victim.HP != 0 || victim.Flown {
					t.Fatalf("expected non-flying knockout: hp=%d flown=%v events=%+v", victim.HP, victim.Flown, events)
				}
				if over, _ := b.Over(); over {
					t.Fatal("standing ally must keep the battle active for this regression")
				}
			}
		})
	}
}

func TestReflectedKnockoutStopsDrainAndRemainingHits(t *testing.T) {
	b := New(rnd(4))
	attacker, defender := player(0), enemy(10, "gu:1")
	attacker.HP, attacker.MaxHP, attacker.Atk = 1, 1000, 1000
	defender.HP, defender.MaxHP, defender.Reflect = 10000, 10000, 1
	b.Add(attacker)
	b.Add(defender)
	defender.guard = true // Deterministic hit; guard does not block reflection.
	var events []Event
	b.attackSeq(attacker, 10, attackOpts{hits: 3, drain: 100}, &events)
	if len(events) != 1 || events[0].Result != Reflected || events[0].ActorHP != 0 || attacker.HP != 0 || attacker.Alive() || attacker.Flown {
		t.Fatalf("reflection must kill the attacker before drain or further hits: hp=%d events=%+v", attacker.HP, events)
	}
	if over, winner := b.Over(); !over || winner != 1 {
		t.Fatalf("reflected knockout did not finish battle: over=%v winner=%d", over, winner)
	}
}
