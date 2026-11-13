package data

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"fmt"
	"io"
	"slices"
)

// This UTF-8 catalog is the single source of truth. It travels with the server,
// so existing external gamedata installs do not require a second deployment file.
//
//go:embed ai_pets.json
var aiPetCatalogJSON []byte

type aiPetCatalog struct {
	Skills []Skill           `json:"skills"`
	Pets   []aiPetDefinition `json:"pets"`
}

type aiPetDefinition struct {
	Key         string `json:"key"`
	Name        string `json:"name"`
	Story       string `json:"story"`
	Temp        int    `json:"temp"`
	Enemy       int    `json:"enemy"`
	WildEnemy   int    `json:"wildEnemy"`
	Group       int    `json:"group"`
	WildGroup   int    `json:"wildGroup"`
	Floor       int    `json:"floor"`
	X           int    `json:"x"`
	Y           int    `json:"y"`
	Image       int    `json:"image"`
	Base        [4]int `json:"base"`
	Attr        [4]int `json:"attr"`
	Skills      []int  `json:"skills"`
	Get         int    `json:"get"`
	Normal      [2]int `json:"normal"`
	YoungWeight int    `json:"youngWeight"`
	WildWeight  int    `json:"wildWeight"`
}

func decodeAIPets(raw []byte) (aiPetCatalog, error) {
	var c aiPetCatalog
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&c); err != nil {
		return c, err
	}
	if err := dec.Decode(new(any)); err != io.EOF {
		return c, fmt.Errorf("unexpected trailing catalog data")
	}
	if len(c.Pets) != 4 {
		return c, fmt.Errorf("mechanical catalog must define four pets")
	}
	return c, nil
}

func (d *BattleData) installAIPets() error {
	if d.aiPetsInstalled {
		return nil
	}
	c, err := decodeAIPets(aiPetCatalogJSON)
	if err != nil {
		return err
	}
	// Validate the whole catalog before touching any original registry.
	skills := map[int]*Skill{}
	for _, s := range c.Skills {
		if s.ID < 29000 || d.Skills[s.ID] != nil || skills[s.ID] != nil {
			return fmt.Errorf("mechanical skill ID collision %d", s.ID)
		}
		if s.Field != 1 || s.Target < 0 || s.Target > 7 || s.Price != 0 {
			return fmt.Errorf("invalid mechanical skill %d", s.ID)
		}
		v := s
		skills[s.ID] = &v
	}
	temps, enemies, groups := map[int]bool{}, map[int]bool{}, map[int]bool{}
	for _, p := range c.Pets {
		if p.Temp < 29000 || d.Temps[p.Temp] != nil || temps[p.Temp] {
			return fmt.Errorf("mechanical template ID collision %d", p.Temp)
		}
		temps[p.Temp] = true
		for _, id := range []int{p.Enemy, p.WildEnemy} {
			if id < 29000 || d.Enemies[id] != nil || enemies[id] {
				return fmt.Errorf("mechanical enemy ID collision %d", id)
			}
			enemies[id] = true
		}
		for _, id := range []int{p.Group, p.WildGroup} {
			if id < 29000 || d.Groups[id] != nil || groups[id] {
				return fmt.Errorf("mechanical group ID collision %d", id)
			}
			groups[id] = true
		}
		sum, attr := 0, 0
		for i, v := range p.Base {
			if v < 1 || p.Attr[i] < 0 || p.Attr[i] > 100 {
				return fmt.Errorf("invalid mechanical allocation %s", p.Key)
			}
			sum += v
			attr += p.Attr[i]
		}
		if sum > 104 || attr != 100 || p.Get < 0 || p.Get > 40 || p.Normal[0] < 2 || p.Normal[1] < p.Normal[0] || p.Normal[1] > 100 || len(p.Skills) < 2 || len(p.Skills) > 7 || !slices.Contains(p.Skills, 1) || !slices.Contains(p.Skills, 2) || p.YoungWeight < 10 || p.YoungWeight > 15 || p.WildWeight < 1 || p.YoungWeight+p.WildWeight >= 100 || p.Image <= 0 || p.Name == "" {
			return fmt.Errorf("invalid mechanical pet %s", p.Key)
		}
		for _, id := range p.Skills {
			if d.Skills[id] == nil && skills[id] == nil {
				return fmt.Errorf("missing mechanical skill %d", id)
			}
		}
	}
	for id, s := range skills {
		d.Skills[id] = s
	}
	for _, p := range c.Pets {
		t := &EnemyTemp{TempNo: p.Temp, Name: p.Name, Image: p.Image, InitNum: 28, LvUpPoint: 4, Base: p.Base, Attr: p.Attr, Get: p.Get, ModAI: 300, Slot: 6, LimitLevel: 0, Rare: 2, Critical: 5, Counter: 5, Status: [6]int{5, 5, 5, 5, 5, 5}, Skills: [7]int{-1, -1, -1, -1, -1, -1, -1}}
		copy(t.Skills[:], p.Skills)
		d.Temps[p.Temp] = t
		for _, variant := range []struct{ id, lo, hi int }{{p.Enemy, 1, 1}, {p.WildEnemy, p.Normal[0], p.Normal[1]}} {
			// Young ones are capturable. Wild adults use the same template and may also
			// be captured under ordinary level/space restrictions; no special currency.
			d.Enemies[variant.id] = &Enemy{ID: variant.id, TempNo: p.Temp, Name: p.Name, LvMin: variant.lo, LvMax: variant.hi, CreateMin: 1, CreateMax: 1, TacticsMode: 1, Exp: -1, PetFlag: 1, Tactics: "at:10;1;1|gu:2|es:0|wa:0;0;0;0;0;0;0;"}
		}
		d.Groups[p.Group] = &Group{ID: p.Group, Name: p.Name + "幼体", Enemies: []int{p.Enemy}, Probs: []int{1}, AppearItem: -1, HideItem: -1}
		d.Groups[p.WildGroup] = &Group{ID: p.WildGroup, Name: p.Name + "巡游体", Enemies: []int{p.WildEnemy}, Probs: []int{1}, AppearItem: -1, HideItem: -1}
	}
	d.aiPetsInstalled = true
	return nil
}

// installAIPetHabitats uses actual maps and walkability. Missing/custom maps skip
// only their small habitat; the pets and GM catalog remain valid without assets.
// Original Areas and their group arrays are never modified or aliased.
func (g *Game) installAIPetHabitats() {
	d := g.Battle
	if d == nil || d.aiHabitatsInstalled {
		return
	}
	c, err := decodeAIPets(aiPetCatalogJSON)
	if err != nil {
		g.Warnings = append(g.Warnings, "机械伙伴分布："+err.Error())
		return
	}
	for _, p := range c.Pets {
		f := g.Floors[p.Floor]
		if f == nil {
			g.Warnings = append(g.Warnings, fmt.Sprintf("机械伙伴%s：地图%d不存在，跳过分布", p.Name, p.Floor))
			continue
		}
		base := d.AreaAt(p.Floor, p.X, p.Y)
		if base == nil || base.ProbMax <= 0 || !g.Tiles.Walkable(f, p.X, p.Y) || !g.Tiles.Walkable(f, p.X+1, p.Y) {
			g.Warnings = append(g.Warnings, "机械伙伴"+p.Name+"：指定位置无可行走遇敌区域，跳过分布")
			continue
		}
		id := p.Temp
		collision := false
		for _, a := range d.Areas {
			if a.Index == id {
				collision = true
				break
			}
		}
		if collision {
			g.Warnings = append(g.Warnings, fmt.Sprintf("机械伙伴%s：区域编号%d冲突，跳过分布", p.Name, id))
			continue
		}
		a := *base
		a.Index = id
		// Stay within cells that already resolve to this exact original area. This
		// cannot shadow a neighboring village/special-item habitat at the edge.
		for radius := 10; radius >= 0; radius-- {
			a.X1 = max(0, p.X-radius)
			a.Y1 = max(0, p.Y-radius)
			a.X2 = min(f.W-1, p.X+radius)
			a.Y2 = min(f.H-1, p.Y+radius)
			same := true
			for y := a.Y1; y <= a.Y2 && same; y++ {
				for x := a.X1; x <= a.X2; x++ {
					if d.AreaAt(p.Floor, x, y) != base {
						same = false
						break
					}
				}
			}
			if same {
				break
			}
		}
		a.ZOrder++
		a.Groups = nil
		a.GroupProbs = nil
		oldTotal := 0
		for i, id := range base.Groups {
			if i >= len(base.GroupProbs) || base.GroupProbs[i] <= 0 || d.Groups[id] == nil {
				continue
			}
			a.Groups = append(a.Groups, id)
			a.GroupProbs = append(a.GroupProbs, base.GroupProbs[i]*(100-p.YoungWeight-p.WildWeight))
			// Scale new groups against always-available originals. Conditional
			// quest groups stay intact, but cannot inflate the rare-pet chance
			// when the encounter picker filters them out for ordinary players.
			if gr := d.Groups[id]; gr.AppearItem == -1 && gr.HideItem == -1 {
				oldTotal += base.GroupProbs[i]
			}
		}
		if oldTotal == 0 {
			g.Warnings = append(g.Warnings, "机械伙伴"+p.Name+"：原区域没有有效敌群，跳过分布")
			continue
		}
		a.Groups = append(a.Groups, p.Group, p.WildGroup)
		a.GroupProbs = append(a.GroupProbs, oldTotal*p.YoungWeight, oldTotal*p.WildWeight)
		d.Areas = append(d.Areas, a)
	}
	d.aiHabitatsInstalled = true
}
