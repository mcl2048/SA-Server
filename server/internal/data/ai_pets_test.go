package data

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"unicode/utf8"
)

func TestAIPetsEmbeddedRegistryAndHabitat(t *testing.T) {
	g := loadReal(t)
	c, err := decodeAIPets(aiPetCatalogJSON)
	if err != nil {
		t.Fatal(err)
	}
	bd := g.Battle
	reference := bd.Temps[304]
	if reference == nil || reference.Name != "帖拉所伊朵" || reference.Base != [4]int{23, 35, 25, 21} {
		t.Fatalf("unexpected regular mechanical reference %+v", reference)
	}
	baseSum := 0
	for _, v := range reference.Base {
		baseSum += v
	}
	seen := map[int]bool{}
	for _, p := range c.Pets {
		t.Run(p.Key, func(t *testing.T) {
			for _, id := range []int{p.Temp, p.Enemy, p.WildEnemy, p.Group, p.WildGroup} { // Different registries may intentionally use the same number.
				if id < 29000 {
					t.Errorf("unreserved ID%d", id)
				}
			}
			if seen[p.Temp] {
				t.Fatalf("duplicate template%d", p.Temp)
			}
			seen[p.Temp] = true
			pet := bd.Temps[p.Temp]
			if pet == nil || pet.Image != p.Image || pet.Slot != 6 || pet.Get != 20 || pet.LimitLevel != 0 {
				t.Fatalf("invalid pet %+v", pet)
			}
			sum, attr := 0, 0
			for i, v := range pet.Base {
				sum += v
				attr += pet.Attr[i]
			}
			if sum != baseSum || attr != 100 || pet.InitNum > reference.InitNum || pet.LvUpPoint > reference.LvUpPoint {
				t.Fatalf("unbalanced growth %+v vs %+v", pet, reference)
			}
			if utf8.RuneCountInString(p.Story) < 100 {
				t.Error("missing full pet story")
			}
			for _, id := range p.Skills {
				if bd.Skills[id] == nil {
					t.Fatalf("missing skill%d", id)
				}
			}
			if pet.Skills[0] != 1 || pet.Skills[1] != 2 {
				t.Error("missing legal attack/guard defaults")
			}
			young, wild := bd.Enemies[p.Enemy], bd.Enemies[p.WildEnemy]
			if young == nil || young.TempNo != p.Temp || young.LvMin != 1 || young.LvMax != 1 || young.PetFlag != 1 || wild == nil || wild.LvMin != p.Normal[0] || wild.LvMax != p.Normal[1] || wild.PetFlag != 1 {
				t.Fatalf("invalid spawn %+v %+v", young, wild)
			}
			area := bd.AreaAt(p.Floor, p.X, p.Y)
			if area == nil || area.Index != p.Temp {
				t.Fatalf("missing actual habitat %+v", area)
			}
			if !g.Tiles.Walkable(g.Floors[p.Floor], p.X, p.Y) || !g.Tiles.Walkable(g.Floors[p.Floor], p.X+1, p.Y) {
				t.Fatal("habitat lacks walkable encounter pair")
			}
			total, youngWeight, wildWeight := 0, 0, 0
			for i, id := range area.Groups {
				if bd.Groups[id] == nil {
					t.Fatalf("missing group%d", id)
				}
				if gr := bd.Groups[id]; gr.AppearItem == -1 && gr.HideItem == -1 {
					total += area.GroupProbs[i]
				}
				if id == p.Group {
					youngWeight = area.GroupProbs[i]
				}
				if id == p.WildGroup {
					wildWeight = area.GroupProbs[i]
				}
			}
			if total == 0 || youngWeight*100 != total*12 || wildWeight*100 != total*18 {
				t.Fatalf("invalid encounter mixture %d/%d/%d", youngWeight, wildWeight, total)
			}
			t.Logf("%s %s[%d] rect(%d,%d)-(%d,%d), walkable(%d,%d)-(%d,%d), lv1=12%% wild%d..%d=18%%", p.Name, g.Floors[p.Floor].Name, p.Floor, area.X1, area.Y1, area.X2, area.Y2, p.X, p.Y, p.X+1, p.Y, wild.LvMin, wild.LvMax)
		})
	}
	original, err := LoadBattle(realData)
	if err != nil {
		t.Fatal(err)
	}
	if len(bd.Areas) != len(original.Areas)+4 {
		t.Fatalf("habitat count%d vs%d", len(bd.Areas), len(original.Areas))
	}
	if !reflect.DeepEqual(bd.Areas[:len(original.Areas)], original.Areas) {
		t.Fatal("original encounter data mutated")
	}
	for _, a := range original.Areas {
		if a.Index >= 29000 {
			t.Fatalf("area ID collision%d", a.Index)
		}
	}
	// Each overlay only replaces cells belonging to the same original area, and
	// retains every original weight proportion without aliasing its source slices.
	for _, p := range c.Pets {
		a, b := bd.AreaAt(p.Floor, p.X, p.Y), original.AreaAt(p.Floor, p.X, p.Y)
		n := len(a.Groups) - 2
		for y := a.Y1; y <= a.Y2; y++ {
			for x := a.X1; x <= a.X2; x++ {
				if original.AreaAt(p.Floor, x, y) != b {
					t.Fatal("overlay shadows adjacent original habitat")
				}
			}
		}
		if !reflect.DeepEqual(a.Groups[:n], b.Groups) {
			t.Fatal("lost original groups")
		}
		for i, v := range b.GroupProbs {
			if a.GroupProbs[i] != 70*v {
				t.Fatal("changed original relative weights")
			}
		}
	}
	before := len(bd.Areas)
	g.installAIPetHabitats()
	if len(bd.Areas) != before {
		t.Fatal("duplicate habitat install")
	}
	temps, enemies, groups, skills := len(bd.Temps), len(bd.Enemies), len(bd.Groups), len(bd.Skills)
	if err := bd.installAIPets(); err != nil {
		t.Fatal(err)
	}
	if temps != len(bd.Temps) || enemies != len(bd.Enemies) || groups != len(bd.Groups) || skills != len(bd.Skills) {
		t.Fatal("duplicate registry install")
	}
}

func TestAIPetsNoExternalExtensionFileRequired(t *testing.T) {
	// Only original required battle/map files are visible. No ai_pets.json or
	// graphics exists in this deployment, yet the compiled catalog still loads.
	dir := t.TempDir()
	for _, sub := range []string{"battle", "map"} {
		if err := os.Mkdir(filepath.Join(dir, sub), 0700); err != nil {
			t.Fatal(err)
		}
	}
	for _, name := range []string{"battle/enemybase1.txt", "battle/enemy1.txt", "battle/group1.txt", "battle/encount.txt", "battle/exp.txt", "battle/petskill2.txt", "map/battlemap.txt"} {
		src, err := filepath.Abs(filepath.Join(realData, name))
		if err != nil {
			t.Fatal(err)
		}
		if err := os.Symlink(src, filepath.Join(dir, name)); err != nil {
			t.Fatal(err)
		}
	}
	b, err := LoadBattle(dir)
	if err != nil {
		t.Fatal(err)
	}
	for id := 29001; id <= 29004; id++ {
		if b.Temps[id] == nil || b.Enemies[id] == nil {
			t.Fatalf("missing embedded pet%d", id)
		}
	}
	// A stray/invalid external extension cannot silently override the compiled one.
	if err := os.WriteFile(filepath.Join(dir, "battle", "ai_pets.json"), []byte("invalid external JSON"), 0600); err != nil {
		t.Fatal(err)
	}
	other, err := LoadBattle(dir)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(b.Temps[29001], other.Temps[29001]) {
		t.Fatal("external JSON changed compiled catalog")
	}
	missing := &Game{Battle: b, Floors: map[int]*Floor{}}
	missing.installAIPetHabitats()
	if len(missing.Warnings) != 4 {
		t.Fatalf("missing map warnings %v", missing.Warnings)
	}
}

func TestAIPetsCollisionsRejectWithoutChangingOriginals(t *testing.T) {
	c, err := decodeAIPets(aiPetCatalogJSON)
	if err != nil {
		t.Fatal(err)
	}
	fresh := func() *BattleData {
		return &BattleData{Temps: map[int]*EnemyTemp{}, Enemies: map[int]*Enemy{}, Groups: map[int]*Group{}, Skills: map[int]*Skill{1: {ID: 1}, 2: {ID: 2}}}
	}
	for _, kind := range []string{"template", "enemy", "group", "skill"} {
		t.Run(kind, func(t *testing.T) {
			d := fresh()
			switch kind {
			case "template":
				d.Temps[c.Pets[0].Temp] = &EnemyTemp{Name: "original"}
			case "enemy":
				d.Enemies[c.Pets[0].WildEnemy] = &Enemy{Name: "original"}
			case "group":
				d.Groups[c.Pets[0].WildGroup] = &Group{Name: "original"}
			case "skill":
				d.Skills[c.Skills[0].ID] = &Skill{Name: "original"}
			}
			before, _ := json.Marshal(d)
			if err := d.installAIPets(); err == nil || !strings.Contains(err.Error(), "collision") {
				t.Fatalf("expected collision, got%v", err)
			}
			after, _ := json.Marshal(d)
			if string(before) != string(after) {
				t.Fatal("partial registration on collision")
			}
		})
	}
}
