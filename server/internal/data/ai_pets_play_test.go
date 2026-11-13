package data_test

import (
	"math"
	"math/rand/v2"
	"testing"

	"sa/server/internal/battle"
	"sa/server/internal/data"
)

// Exercise the exact compiled registry through the real enemy factory, encounter
// picker and skill resolver; these tests do not substitute invented skill funcs.
func TestAIPetsPlayableCaptureAndSkills(t *testing.T) {
	bd, err := data.LoadBattle("../../../gamedata")
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 4; i++ {
		t.Run(bd.Temps[29001+i].Name, func(t *testing.T) {
			rnd := rand.New(rand.NewPCG(41+uint64(i), 7))
			pet := battle.NewEnemy(battle.EnemySpec{Enemy: bd.Enemies[29001+i], Temp: bd.Temps[29001+i], Level: 1}, 15, bd.Skills, rnd)
			hunter := &battle.Fighter{Slot: 0, Player: true, Level: 1, HP: 100, MaxHP: 100, Quick: pet.Quick, FixQuick: pet.Quick, Charm: 50, Luck: 1}
			pet.HP = 1
			rate := battle.CaptureRate(hunter, pet)
			if rate < 25 || rate > 40 || math.IsNaN(rate) {
				t.Fatalf("unexpected equal-level low-HP capture chance%f", rate)
			}
			if pet.Seed == nil || !pet.Seed.Capture || pet.Seed.TempNo != 29001+i {
				t.Fatalf("unusable capture seed %+v", pet.Seed)
			}

			pet.Slot = 5
			pet.Level = 50
			pet.Pet = true
			pet.Loyalty = 100
			pet.OwnerSlot = 0
			pet.OwnerSet = true
			pet.HP, pet.MaxHP, pet.Atk, pet.Def, pet.Quick = 10000, 10000, 200, 100, 100
			actor := &battle.Fighter{Slot: 0, Player: true, Level: 50, HP: 700, MaxHP: 1000, Atk: 50, Def: 60, Quick: 10}
			if i == 2 {
				actor.Quick = 125 // Faster than normal pet, slower than its speed skill.
			}
			enemy := &battle.Fighter{Slot: 15, Level: 50, HP: 10000, MaxHP: 10000, Atk: 50, Def: 20, Quick: 5, Tactics: "gu:1", Weapon: -1}
			b := battle.New(rnd)
			b.Add(actor)
			b.Add(pet)
			b.Add(enemy)
			skill := bd.Skills[29101+i]
			target := 15
			if i < 2 {
				target = 0
			}
			ev := b.Resolve(map[int]battle.Command{0: {Kind: battle.Guard}, 5: {Kind: battle.Attack, Target: target, Skill: skill}})
			effects, hits := 0, 0
			for _, e := range ev {
				if e.Actor == 5 && e.Skill == skill.Name {
					if e.Kind == battle.Magic {
						effects++
					}
					if e.Kind == battle.Attack {
						hits++
					}
				}
			}
			switch i {
			case 0:
				if effects != 2 {
					t.Fatalf("wind support should affect both allies: %+v", ev)
				}

			case 1:
				if actor.HP != 820 || effects != 1 {
					t.Fatalf("single-target repair should restore120HP, got%d %+v", actor.HP, ev)
				}
			case 2:
				if hits != 1 || pet.Quick != 100 || pet.Def != 70 || len(ev) == 0 || ev[0].Actor != 5 {
					t.Fatalf("speed tradeoff not applied: quick%d def%d %+v", pet.Quick, pet.Def, ev)
				}
			case 3:
				if hits != 2 {
					t.Fatalf("Overdrive must perform exactly two real attacks: %+v", ev)
				}
			}
		})
	}
}

func TestAIPetsNaturalEncounterPicker(t *testing.T) {
	g, err := data.Load("../../../gamedata")
	if err != nil {
		t.Fatal(err)
	}
	for i, loc := range [][3]int{{300, 371, 183}, {300, 205, 294}, {300, 494, 158}, {400, 74, 74}} {
		t.Run(g.Battle.Temps[29001+i].Name, func(t *testing.T) {
			rnd := rand.New(rand.NewPCG(1234+uint64(i), 9))
			area := g.Battle.AreaAt(loc[0], loc[1], loc[2])
			young, wild, original := 0, 0, 0
			for n := 0; n < 5000; n++ {
				es := battle.PickEnemies(g.Battle, area, rnd, nil)
				if len(es) == 0 {
					t.Fatal("empty weighted encounter")
				}
				switch es[0].Enemy.ID {
				case 29001 + i:
					young++
					if len(es) != 1 || es[0].Level != 1 {
						t.Fatal("young group must contain a single level1")
					}
				case 29011 + i:
					wild++
					if es[0].Level < 44 || es[0].Level > 60 {
						t.Fatal("wild level outside supported biome tier")
					}
				default:
					original++
				}
			}
			if young < 450 || young > 750 || wild < 700 || wild > 1100 || original < 3000 {
				t.Fatalf("unexpected mixture young%d wild%d original%d", young, wild, original)
			}
			t.Logf("actual picker/5000 young%d wild%d original%d", young, wild, original)
		})
	}
}
