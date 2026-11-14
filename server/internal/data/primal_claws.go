package data

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"fmt"
	"io"
)

const (
	CyrufasTempID      = 29007
	ClaudesTempID      = 29008
	CyrufasWildEnemyID = 29017
	ClaudesWildEnemyID = 29018
	CyrufasSprite      = 199400
	ClaudesSprite      = 199401
	PrimalCrossSkillID = 29060
	PrimalCrossEffect  = 199402
	PrimalCrossFunc    = "PETSKILL_PrimalCross"
)

// Independent, append-only definitions; older companions and saved templates
// retain their identities. The client catalog is generated from these bytes.
//
//go:embed primal_claws.json
var primalClawsCatalogJSON []byte

type primalPetDefinition struct {
	aiPetDefinition
	Region    string `json:"region"`
	InitNum   int    `json:"initNum"`
	LvUpPoint int    `json:"lvUpPoint"`
}
type primalClawsCatalog struct {
	Skill           Skill                 `json:"skill"`
	SpecialEnemyIDs []int                 `json:"specialEnemyIds"`
	Pets            []primalPetDefinition `json:"pets"`
}

func decodePrimalClaws() (primalClawsCatalog, error) {
	var c primalClawsCatalog
	d := json.NewDecoder(bytes.NewReader(primalClawsCatalogJSON))
	d.DisallowUnknownFields()
	if err := d.Decode(&c); err != nil {
		return c, err
	}
	if err := d.Decode(new(any)); err != io.EOF {
		return c, fmt.Errorf("unexpected trailing primal claws catalog data")
	}
	if c.Skill.ID != PrimalCrossSkillID || c.Skill.Func != PrimalCrossFunc || c.Skill.Field != 1 || c.Skill.Target != 1 || len(c.Pets) != 2 {
		return c, fmt.Errorf("invalid primal claws catalog identities")
	}
	for i, p := range c.Pets {
		if p.Temp != CyrufasTempID+i || p.Enemy != p.Temp || p.Group != p.Temp || p.WildEnemy != CyrufasWildEnemyID+i || p.WildGroup != p.WildEnemy || p.Image != CyrufasSprite+i || p.Floor != 32017-i || p.X != 30 || p.Y != 29 || p.InitNum != 40 || p.LvUpPoint != 4 || p.Base[0]+p.Base[1]+p.Base[2]+p.Base[3] != 124 || p.Attr[0]+p.Attr[1]+p.Attr[2]+p.Attr[3] != 100 || len(p.Skills) != 3 || p.Skills[0] != 1 || p.Skills[1] != 2 || p.Skills[2] != PrimalCrossSkillID || p.Normal != [2]int{93, 95} || p.YoungWeight != 12 || p.WildWeight != 18 {
			return c, fmt.Errorf("invalid primal pet allocation %d", i)
		}
		for k, v := range p.Base {
			if v < 1 || p.Attr[k] < 0 || p.Attr[k] > 100 {
				return c, fmt.Errorf("invalid primal pet values %d", i)
			}
		}
	}
	return c, nil
}

// These are actual enemy1 IDs, not template IDs, names or sprites. The sky
// encounter tables reuse 323/477/1624; the bonus intentionally follows those
// identities anywhere they appear, including outside the island.
var primalCrossSpecialCatalog, _ = decodePrimalClaws()

func PrimalCrossSpecialEnemy(id int) bool {
	for _, known := range primalCrossSpecialCatalog.SpecialEnemyIDs {
		if id == known {
			return true
		}
	}
	return false
}

func (d *BattleData) installPrimalClaws() error {
	if d.primalClawsInstalled {
		return nil
	}
	c, err := decodePrimalClaws()
	if err != nil {
		return err
	}
	if d.Skills[c.Skill.ID] != nil {
		return fmt.Errorf("primal claws skill ID collision")
	}
	if d.Skills[1] == nil || d.Skills[2] == nil {
		return fmt.Errorf("primal claws requires native attack and guard")
	}
	for _, p := range c.Pets {
		if d.Temps[p.Temp] != nil {
			return fmt.Errorf("primal claws template collision %d", p.Temp)
		}
		for _, id := range []int{p.Enemy, p.WildEnemy} {
			if d.Enemies[id] != nil || d.Groups[id] != nil {
				return fmt.Errorf("primal claws enemy/group collision %d", id)
			}
		}
	}
	for _, t := range d.Temps {
		if t != nil && t.Image >= CyrufasSprite && t.Image <= PrimalCrossEffect {
			return fmt.Errorf("primal claws sprite collision %d", t.Image)
		}
	}
	// Validate the complete catalog before mutating any registry.
	s := c.Skill
	d.Skills[s.ID] = &s
	for _, p := range c.Pets {
		d.Temps[p.Temp] = &EnemyTemp{TempNo: p.Temp, Name: p.Name, Image: p.Image, InitNum: p.InitNum, LvUpPoint: p.LvUpPoint, Base: p.Base, Attr: p.Attr, Size: 1, Get: p.Get, ModAI: 300, Slot: 7, Rare: 2, Critical: 1, Counter: 1, Status: [6]int{1, 1, 1, 1, 1, 1}, Skills: [7]int{1, 2, s.ID, -1, -1, -1, -1}}
		for _, v := range []struct{ id, lo, hi int }{{p.Enemy, 1, 1}, {p.WildEnemy, p.Normal[0], p.Normal[1]}} {
			e := &Enemy{ID: v.id, TempNo: p.Temp, Name: p.Name, LvMin: v.lo, LvMax: v.hi, CreateMin: 1, CreateMax: 1, TacticsMode: 1, Exp: -1, PetFlag: 1, Tactics: "at:8;1;1|gu:2|wa:0;0;4;0;0;0;0"}
			if v.lo > 1 {
				// Adults have only attack/guard, both in their live fighter and
				// capture seed. The shared young template must retain the skill.
				e.SkillOverride = &[7]int{1, 2, -1, -1, -1, -1, -1}
				e.Tactics = "at:8;1;1|gu:2|wa:0;0;0;0;0;0;0"
			}
			d.Enemies[v.id] = e
			d.Groups[v.id] = &Group{ID: v.id, Name: p.Name, Enemies: []int{v.id}, Probs: []int{1}, AppearItem: -1, HideItem: -1}
		}
	}
	d.primalClawsInstalled = true
	return nil
}

func (g *Game) installPrimalClawsHabitats() {
	d := g.Battle
	if d == nil || d.primalClawsHabitatsInstalled {
		return
	}
	d.primalClawsHabitatsInstalled = true
	c, err := decodePrimalClaws()
	if err != nil {
		g.Warnings = append(g.Warnings, err.Error())
		return
	}
	for _, p := range c.Pets {
		f, base := g.Floors[p.Floor], d.AreaAt(p.Floor, p.X, p.Y)
		if f == nil || base == nil || base.ProbMax <= 0 || !g.Tiles.Walkable(f, p.X, p.Y) || !g.Tiles.Walkable(f, p.X+1, p.Y) {
			g.Warnings = append(g.Warnings, p.Name+"：缺少可行走的原生遇敌区域，跳过分布")
			continue
		}
		collision := false
		for _, a := range d.Areas {
			if a.Index == p.Temp {
				collision = true
			}
		}
		if collision {
			g.Warnings = append(g.Warnings, p.Name+"：遇敌区域编号冲突，跳过分布")
			continue
		}
		a := *base
		a.Index, a.ZOrder = p.Temp, base.ZOrder+1
		for radius := 8; radius >= 0; radius-- {
			a.X1, a.X2 = max(0, p.X-radius), min(f.W-1, p.X+radius)
			a.Y1, a.Y2 = max(0, p.Y-radius), min(f.H-1, p.Y+radius)
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
		a.Groups, a.GroupProbs = nil, nil
		available := 0
		for i, id := range base.Groups {
			if i >= len(base.GroupProbs) || base.GroupProbs[i] <= 0 || d.Groups[id] == nil {
				continue
			}
			a.Groups = append(a.Groups, id)
			a.GroupProbs = append(a.GroupProbs, base.GroupProbs[i]*(100-p.YoungWeight-p.WildWeight))
			if gr := d.Groups[id]; gr.AppearItem == -1 && gr.HideItem == -1 {
				available += base.GroupProbs[i]
			}
		}
		if available == 0 {
			g.Warnings = append(g.Warnings, p.Name+"：原区域没有无条件敌群，跳过分布")
			continue
		}
		a.Groups = append(a.Groups, p.Group, p.WildGroup)
		a.GroupProbs = append(a.GroupProbs, available*p.YoungWeight, available*p.WildWeight)
		d.Areas = append(d.Areas, a)
	}
}
