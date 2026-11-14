package data

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestLilithRegistryGrowthAndNaturalHabitat(t *testing.T) {
	g := loadReal(t)
	d := g.Battle
	p := d.Temps[29005]
	if p == nil {
		t.Fatal("Lilith is missing from the runtime pet registry")
	}
	ref := d.Temps[777]
	if ref.Name != "佩露夏" || ref.InitNum != 40 || ref.LvUpPoint != 4 || ref.Base != [4]int{35, 54, 27, 33} {
		t.Fatalf("unexpected native growth reference: %+v", ref)
	}
	if p.Name != "莉莉丝" || p.Image != 199200 || p.Base != [4]int{27, 57, 17, 48} || p.Attr != [4]int{0, 0, 20, 80} || p.InitNum != 40 || p.LvUpPoint != 4 {
		t.Fatalf("Lilith must retain the 149-point native tier with offensive allocation: %+v", p)
	}
	if p.Skills[0] != 1 || p.Skills[1] != 2 || p.Skills[2] != 29040 {
		t.Fatalf("missing ordinary attack/guard or ghost storm: %v", p.Skills)
	}
	s := d.Skills[29040]
	if s == nil || s.Name != "幽灵风暴" || s.Func != "PETSKILL_GhostStorm" || s.Field != 1 || s.Target != 3 {
		t.Fatalf("missing executable enemy-side skill: %+v", s)
	}
	for _, id := range []int{29005, 29015} {
		e, group := d.Enemies[id], d.Groups[id]
		if e == nil || e.TempNo != 29005 || e.PetFlag != 1 || group == nil || len(group.Enemies) != 1 || group.Enemies[0] != id {
			t.Fatalf("missing capturable natural variant %d: %+v %+v", id, e, group)
		}
	}
	if d.Enemies[29005].LvMin != 1 || d.Enemies[29005].LvMax != 1 || d.Enemies[29015].LvMin != 44 || d.Enemies[29015].LvMax != 48 {
		t.Fatal("unexpected young/adult encounter levels")
	}
	a := d.AreaAt(300, 470, 230)
	if a == nil || a.Index != 29005 || !g.Tiles.Walkable(g.Floors[300], 470, 230) || !g.Tiles.Walkable(g.Floors[300], 471, 230) {
		t.Fatalf("missing walkable Lilith habitat: %+v", a)
	}
	weights, total := map[int]int{}, 0
	for i, id := range a.Groups {
		weights[id] = a.GroupProbs[i]
		if d.Groups[id].AppearItem == -1 && d.Groups[id].HideItem == -1 {
			total += a.GroupProbs[i]
		}
	}
	if total == 0 || weights[29005]*100 != total*12 || weights[29015]*100 != total*18 {
		t.Fatalf("habitat must preserve 70%% originals, 12%% young, 18%% adults: %v total=%d", weights, total)
	}
}

func TestLilithInstallationRejectsCollisionsAtomically(t *testing.T) {
	for _, kind := range []string{"template", "skill", "young-enemy", "adult-enemy", "young-group", "adult-group", "sprite"} {
		t.Run(kind, func(t *testing.T) {
			d := &BattleData{Temps: map[int]*EnemyTemp{}, Enemies: map[int]*Enemy{}, Groups: map[int]*Group{}, Skills: map[int]*Skill{1: {ID: 1}, 2: {ID: 2}}}
			switch kind {
			case "template":
				d.Temps[29005] = &EnemyTemp{Name: "original"}
			case "skill":
				d.Skills[29040] = &Skill{Name: "original"}
			case "young-enemy":
				d.Enemies[29005] = &Enemy{Name: "original"}
			case "adult-enemy":
				d.Enemies[29015] = &Enemy{Name: "original"}
			case "young-group":
				d.Groups[29005] = &Group{Name: "original"}
			case "adult-group":
				d.Groups[29015] = &Group{Name: "original"}
			case "sprite":
				d.Temps[42] = &EnemyTemp{Name: "original", Image: 199200}
			}
			before, _ := json.Marshal(d)
			err := d.installLilith()
			after, _ := json.Marshal(d)
			if err == nil || !strings.Contains(err.Error(), "collision") || string(before) != string(after) || d.lilithInstalled {
				t.Fatalf("collision %s must leave every original registry unchanged: err=%v", kind, err)
			}
		})
	}
}

func TestLilithRegistryAndHabitatInstallationAreIdempotent(t *testing.T) {
	g := loadReal(t)
	before, _ := json.Marshal(g.Battle)
	if err := g.Battle.installLilith(); err != nil {
		t.Fatal(err)
	}
	g.installLilithHabitat()
	after, _ := json.Marshal(g.Battle)
	if string(before) != string(after) {
		t.Fatal("second install changed registry or duplicated encounters")
	}
	missing := &Game{Battle: g.Battle, Floors: map[int]*Floor{}}
	missing.Battle.lilithHabitatInstalled = false
	missing.installLilithHabitat()
	if len(missing.Warnings) != 1 || !strings.Contains(missing.Warnings[0], "跳过分布") {
		t.Fatalf("custom install without habitat should retain catalog and explain skipped map: %v", missing.Warnings)
	}
}
