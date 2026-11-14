package data_test

import (
	"math/rand/v2"
	"sa/server/internal/battle"
	"sa/server/internal/data"
	"testing"
)

// Exercises the real map picker and NewEnemy, including captured skill seeds;
// a catalog-only adult description cannot satisfy this requirement.
func TestPrimalClawsNaturalVariantsHaveDifferentActualSkills(t *testing.T) {
	g, err := data.Load("../../../gamedata")
	if err != nil {
		t.Fatal(err)
	}
	r := rand.New(rand.NewPCG(59, 93))
	for _, tc := range []struct{ young, adult, floor int }{{29007, 29017, 32017}, {29008, 29018, 32016}} {
		a := g.Battle.AreaAt(tc.floor, 30, 29)
		counts := map[string]int{}
		for i := 0; i < 5000; i++ {
			pick := battle.PickEnemies(g.Battle, a, r, nil)
			if len(pick) == 0 {
				t.Fatal("empty native encounter")
			}
			variant := "original"
			if pick[0].Enemy.ID == tc.young {
				variant = "young"
			}
			if pick[0].Enemy.ID == tc.adult {
				variant = "adult"
			}
			counts[variant]++
			if variant == "original" {
				continue
			}
			f := battle.NewEnemy(pick[0], 15, g.Battle.Skills, r)
			if f.Seed == nil || !f.Seed.Capture || f.Seed.TempNo != tc.young {
				t.Fatalf("native capture identity lost: %+v", f.Seed)
			}
			if variant == "young" {
				if f.Level != 1 || f.Skills[2] == nil || f.Skills[2].ID != 29060 || f.Seed.Skills[2] != 29060 {
					t.Fatal("young encounter lost learned skill")
				}
			} else {
				if f.Level < 93 || f.Level > 95 || f.Seed.Skills != [7]int{1, 2, -1, -1, -1, -1, -1} {
					t.Fatalf("adult capture seed retained shared skill: %+v", f.Seed)
				}
				for slot, s := range f.Skills {
					if slot < 2 {
						if s == nil || s.ID != slot+1 {
							t.Fatal("adult lost attack/guard")
						}
					} else if s != nil {
						t.Fatalf("adult still executes learned skill: %+v", f.Skills)
					}
				}
			}
		}
		if counts["young"] < 450 || counts["young"] > 750 || counts["adult"] < 750 || counts["adult"] > 1050 || counts["original"] < 3200 {
			t.Fatalf("bad native encounter allocation: %v", counts)
		}
		t.Logf("floor %d: 5000 native picks %v; live+capture skill variants verified", tc.floor, counts)
	}
}

func TestPrimalClawsNativeYoungCastsButAdultHasNoSharedAction(t *testing.T) {
	g, err := data.Load("../../../gamedata")
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct{ id, level, wantHits int }{{29007, 1, 2}, {29008, 1, 2}, {29017, 94, 0}, {29018, 94, 0}} {
		r := rand.New(rand.NewPCG(61, 97))
		e := g.Battle.Enemies[tc.id]
		f := battle.NewEnemy(battle.EnemySpec{Enemy: e, Temp: g.Battle.Temps[e.TempNo], Level: tc.level}, 15, g.Battle.Skills, r)
		// Even a hostile/custom tactics row cannot give an adult an unknown
		// skill. Young native fighters resolve the registered function itself.
		f.Tactics = "at:0;1;1|gu:0|wa:0;0;1;0;0;0;0"
		f.HP, f.MaxHP, f.Atk = 100000, 100000, 500
		b := battle.New(r)
		b.Add(f)
		for slot := 0; slot < 2; slot++ {
			b.Add(&battle.Fighter{Slot: slot, Player: true, HP: 100000, MaxHP: 100000})
		}
		ev := b.Resolve(map[int]battle.Command{0: {Kind: battle.Guard}, 1: {Kind: battle.Guard}})
		hits := 0
		for _, e := range ev {
			if e.Actor == 15 && e.Kind == battle.Attack && e.Effect == 199402 {
				hits++
			}
		}
		if hits != tc.wantHits {
			t.Fatalf("variant%d resolved shared attacks=%d want%d: %+v", tc.id, hits, tc.wantHits, ev)
		}
		if tc.level > 1 && f.DefenseBoost() != 0 {
			t.Fatal("adult gained unavailable self-buff")
		}
	}
}
