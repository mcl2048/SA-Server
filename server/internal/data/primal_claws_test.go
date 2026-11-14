package data

import (
	"encoding/json"
	"strings"
	"testing"
)

// Catches a catalog that exists only in the UI, mismatched native growth totals,
// or habitats installed on a similarly named but wrong map.
func TestPrimalClawsRuntimeRegistryAndActualCaveHabitats(t *testing.T) {
	g := loadReal(t)
	yang := g.Battle.Temps[755]
	if yang == nil || yang.Base != [4]int{26, 50, 20, 28} || yang.InitNum != 40 || yang.LvUpPoint != 4 {
		t.Fatal("native Yangus baseline changed")
	}
	for _, tc := range []struct {
		temp, adult, image, floor int
		name                      string
		base, attr                [4]int
	}{
		{29007, 29017, 199400, 32017, "萨鲁法斯", [4]int{20, 34, 36, 34}, [4]int{50, 0, 0, 50}},
		{29008, 29018, 199401, 32016, "克劳德斯", [4]int{42, 32, 42, 8}, [4]int{0, 50, 50, 0}},
	} {
		p := g.Battle.Temps[tc.temp]
		if p == nil {
			t.Fatalf("new pet %s missing from runtime registry", tc.name)
		}
		if p.Name != tc.name || p.Image != tc.image || p.Base != tc.base || p.Attr != tc.attr || p.Size != 1 || p.InitNum != yang.InitNum || p.LvUpPoint != yang.LvUpPoint {
			t.Fatalf("wrong native tier or identities: %+v", p)
		}
		if p.Base[0]+p.Base[1]+p.Base[2]+p.Base[3] != 124 {
			t.Fatal("allocation exceeds Yangus total")
		}
		if p.Skills != [7]int{1, 2, 29060, -1, -1, -1, -1} {
			t.Fatalf("young pet lacks shared skill: %v", p.Skills)
		}
		for _, id := range []int{tc.temp, tc.adult} {
			e, gr := g.Battle.Enemies[id], g.Battle.Groups[id]
			if e == nil || e.TempNo != tc.temp || e.PetFlag != 1 || gr == nil || len(gr.Enemies) != 1 || gr.Enemies[0] != id {
				t.Fatalf("natural encounter %d missing", id)
			}
		}
		f, a := g.Floors[tc.floor], g.Battle.AreaAt(tc.floor, 30, 29)
		if f == nil || a == nil || a.Index != tc.temp || !g.Tiles.Walkable(f, 30, 29) || !g.Tiles.Walkable(f, 31, 29) {
			t.Fatalf("actual cave habitat absent: %d %+v", tc.floor, a)
		}
		weights, total := map[int]int{}, 0
		for i, id := range a.Groups {
			weights[id] += a.GroupProbs[i]
			total += a.GroupProbs[i]
		}
		if weights[tc.temp]*100 != total*12 || weights[tc.adult]*100 != total*18 {
			t.Fatalf("original groups not preserved at 70%%: %v", weights)
		}
	}
	s := g.Battle.Skills[29060]
	if s == nil || s.Func != "PETSKILL_PrimalCross" || s.Field != 1 || s.Target != 1 {
		t.Fatalf("shared native skill missing: %+v", s)
	}
}

func TestPrimalClawsCollisionsLeaveAllRegistriesUnchanged(t *testing.T) {
	for _, kind := range []string{"first-template", "second-template", "skill", "young-enemy", "adult-enemy", "young-group", "adult-group", "first-sprite", "second-sprite", "effect-sprite"} {
		t.Run(kind, func(t *testing.T) {
			d := &BattleData{Temps: map[int]*EnemyTemp{}, Enemies: map[int]*Enemy{}, Groups: map[int]*Group{}, Skills: map[int]*Skill{1: {ID: 1}, 2: {ID: 2}}}
			switch kind {
			case "first-template":
				d.Temps[29007] = &EnemyTemp{Name: "original"}
			case "second-template":
				d.Temps[29008] = &EnemyTemp{Name: "original"}
			case "skill":
				d.Skills[29060] = &Skill{Name: "original"}
			case "young-enemy":
				d.Enemies[29007] = &Enemy{Name: "original"}
			case "adult-enemy":
				d.Enemies[29018] = &Enemy{Name: "original"}
			case "young-group":
				d.Groups[29008] = &Group{Name: "original"}
			case "adult-group":
				d.Groups[29017] = &Group{Name: "original"}
			case "first-sprite":
				d.Temps[42] = &EnemyTemp{Image: 199400}
			case "second-sprite":
				d.Temps[42] = &EnemyTemp{Image: 199401}
			case "effect-sprite":
				d.Temps[42] = &EnemyTemp{Image: 199402}
			}
			before, _ := json.Marshal(d)
			err := d.installPrimalClaws()
			after, _ := json.Marshal(d)
			if err == nil || !strings.Contains(err.Error(), "collision") || string(before) != string(after) || d.primalClawsInstalled {
				t.Fatalf("collision %s partially installed registry: %v", kind, err)
			}
		})
	}
}

func TestPrimalClawsInstallationIsIdempotentAndOriginalPetsStayIntact(t *testing.T) {
	g := loadReal(t)
	before, _ := json.Marshal(g.Battle)
	if err := g.Battle.installPrimalClaws(); err != nil {
		t.Fatal(err)
	}
	g.installPrimalClawsHabitats()
	after, _ := json.Marshal(g.Battle)
	if string(before) != string(after) {
		t.Fatal("repeat install duplicated or changed native registries")
	}
	for _, id := range []int{84, 194, 755, 29001, 29002, 29003, 29004, 29005, 29006} {
		if g.Battle.Temps[id] == nil {
			t.Fatalf("original pet removed: %d", id)
		}
	}
}
