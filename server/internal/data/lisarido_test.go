package data

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestLisaridoRegistryGrowthAndCaveHabitat(t *testing.T) {
	g := loadReal(t)
	p := g.Battle.Temps[29006]
	if p == nil {
		t.Fatal("Lisarido is missing from runtime registry")
	}
	if p.Name != "雷萨利朵" || p.Image != 199300 || p.Base != [4]int{26, 60, 16, 47} || p.InitNum != 40 || p.LvUpPoint != 4 || p.Attr != [4]int{0, 0, 70, 30} {
		t.Fatalf("wrong native growth tier or elements: %+v", p)
	}
	s := g.Battle.Skills[29050]
	if s == nil || s.Func != "PETSKILL_ElectromagneticCannon" || s.Field != 1 || s.Target != 1 || p.Skills[2] != 29050 {
		t.Fatalf("missing cannon skill: %+v", s)
	}
	for _, id := range []int{29006, 29016} {
		e, group := g.Battle.Enemies[id], g.Battle.Groups[id]
		if e == nil || e.TempNo != 29006 || e.PetFlag != 1 || group == nil || group.Enemies[0] != id {
			t.Fatalf("missing capturable natural variant %d", id)
		}
	}
	if g.Battle.Enemies[29006].LvMin != 1 || g.Battle.Enemies[29006].LvMax != 1 || g.Battle.Enemies[29016].LvMin != 54 || g.Battle.Enemies[29016].LvMax != 58 {
		t.Fatal("wrong young/adult cave levels")
	}
	f := g.Floors[11202]
	a := g.Battle.AreaAt(11202, 40, 40)
	if f == nil || a == nil || a.Index != 29006 || !g.Tiles.Walkable(f, 40, 40) || !g.Tiles.Walkable(f, 41, 40) {
		t.Fatalf("missing actual cave habitat: %+v", a)
	}
	weights, total := map[int]int{}, 0
	for i, id := range a.Groups {
		weights[id] += a.GroupProbs[i]
		total += a.GroupProbs[i]
	}
	if weights[29006]*100 != total*12 || weights[29016]*100 != total*18 {
		t.Fatalf("incorrect natural encounter mixture: %v", weights)
	}
}

func TestLisaridoInstallationRejectsCollisionsAtomically(t *testing.T) {
	for _, kind := range []string{"template", "skill", "young-enemy", "adult-enemy", "young-group", "adult-group", "sprite"} {
		t.Run(kind, func(t *testing.T) {
			d := &BattleData{Temps: map[int]*EnemyTemp{}, Enemies: map[int]*Enemy{}, Groups: map[int]*Group{}, Skills: map[int]*Skill{1: {ID: 1}, 2: {ID: 2}}}
			switch kind {
			case "template":
				d.Temps[29006] = &EnemyTemp{Name: "original"}
			case "skill":
				d.Skills[29050] = &Skill{Name: "original"}
			case "young-enemy":
				d.Enemies[29006] = &Enemy{Name: "original"}
			case "adult-enemy":
				d.Enemies[29016] = &Enemy{Name: "original"}
			case "young-group":
				d.Groups[29006] = &Group{Name: "original"}
			case "adult-group":
				d.Groups[29016] = &Group{Name: "original"}
			case "sprite":
				d.Temps[42] = &EnemyTemp{Name: "original", Image: 199300}
			}
			before, _ := json.Marshal(d)
			err := d.installLisarido()
			after, _ := json.Marshal(d)
			if err == nil || !strings.Contains(err.Error(), "collision") || string(before) != string(after) || d.lisaridoInstalled {
				t.Fatalf("collision %s must leave every original registry unchanged: err=%v", kind, err)
			}
		})
	}
}

func TestLisaridoRegistryAndHabitatInstallationAreIdempotent(t *testing.T) {
	g := loadReal(t)
	before, _ := json.Marshal(g.Battle)
	if err := g.Battle.installLisarido(); err != nil {
		t.Fatal(err)
	}
	g.installLisaridoHabitat()
	after, _ := json.Marshal(g.Battle)
	if string(before) != string(after) {
		t.Fatal("second install changed registry or duplicated encounters")
	}
	missing := &Game{Battle: g.Battle, Floors: map[int]*Floor{}}
	missing.Battle.lisaridoHabitatInstalled = false
	missing.installLisaridoHabitat()
	if len(missing.Warnings) != 1 || !strings.Contains(missing.Warnings[0], "跳过分布") {
		t.Fatalf("custom install without habitat should retain catalog and explain skipped map: %v", missing.Warnings)
	}
}
