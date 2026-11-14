package data

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"fmt"
	"io"
)

const (
	LisaridoTempID               = 29006
	LisaridoEnemyID              = 29006
	LisaridoWildEnemyID          = 29016
	LisaridoSprite               = 199300
	ElectromagneticCannonSkillID = 29050
	ElectromagneticCannonEffect  = 199301
	ElectromagneticCannonFunc    = "PETSKILL_ElectromagneticCannon"
)

// Independent from Lilith and the four mechanical companions: adding Lisarido must not
// alter their embedded catalog, append-only album identities, or migrations.
//
//go:embed lisarido.json
var lisaridoCatalogJSON []byte

type lisaridoDefinition struct {
	aiPetDefinition
	Region    string `json:"region"`
	InitNum   int    `json:"initNum"`
	LvUpPoint int    `json:"lvUpPoint"`
	Skill     Skill  `json:"skill"`
}

func decodeLisarido() (lisaridoDefinition, error) {
	var p lisaridoDefinition
	d := json.NewDecoder(bytes.NewReader(lisaridoCatalogJSON))
	d.DisallowUnknownFields()
	if err := d.Decode(&p); err != nil {
		return p, err
	}
	if err := d.Decode(new(any)); err != io.EOF {
		return p, fmt.Errorf("unexpected trailing Lisarido catalog data")
	}
	if p.Temp != LisaridoTempID || p.Enemy != LisaridoEnemyID || p.WildEnemy != LisaridoWildEnemyID || p.Group != LisaridoEnemyID || p.WildGroup != LisaridoWildEnemyID || p.Image != LisaridoSprite || p.Skill.ID != ElectromagneticCannonSkillID || p.Skill.Func != ElectromagneticCannonFunc || p.Skill.Field != 1 || p.Skill.Target != 1 {
		return p, fmt.Errorf("invalid Lisarido registry identities")
	}
	if p.InitNum != 40 || p.LvUpPoint != 4 || p.Base != [4]int{26, 60, 16, 47} || p.Attr != [4]int{0, 0, 70, 30} || p.Name != "雷萨利朵" || len(p.Skills) != 3 || p.Skills[0] != 1 || p.Skills[1] != 2 || p.Skills[2] != ElectromagneticCannonSkillID || p.YoungWeight != 12 || p.WildWeight != 18 {
		return p, fmt.Errorf("invalid Lisarido growth or encounter allocation")
	}
	return p, nil
}

func (d *BattleData) installLisarido() error {
	if d.lisaridoInstalled {
		return nil
	}
	p, err := decodeLisarido()
	if err != nil {
		return err
	}
	// Validate every registry before any mutation so a custom gamedata collision
	// never overwrites an existing pet or leaves a partially installed skill.
	if d.Temps[p.Temp] != nil || d.Skills[p.Skill.ID] != nil {
		return fmt.Errorf("Lisarido template/skill ID collision")
	}
	for _, existing := range d.Temps {
		if existing != nil && existing.Image == p.Image {
			return fmt.Errorf("Lisarido sprite ID collision %d", p.Image)
		}
	}
	for _, id := range []int{p.Enemy, p.WildEnemy} {
		if d.Enemies[id] != nil || d.Groups[id] != nil {
			return fmt.Errorf("Lisarido enemy/group ID collision %d", id)
		}
	}
	if d.Skills[1] == nil || d.Skills[2] == nil {
		return fmt.Errorf("Lisarido requires native attack and guard skills")
	}
	skill := p.Skill
	d.Skills[skill.ID] = &skill
	d.Temps[p.Temp] = &EnemyTemp{TempNo: p.Temp, Name: p.Name, Image: p.Image,
		InitNum: p.InitNum, LvUpPoint: p.LvUpPoint, Base: p.Base, Attr: p.Attr,
		Get: p.Get, ModAI: 300, Slot: 7, Rare: 2, Critical: 1, Counter: 1,
		Status: [6]int{1, 1, 1, 1, 1, 1}, Skills: [7]int{1, 2, p.Skill.ID, -1, -1, -1, -1}}
	for _, variant := range []struct{ id, lo, hi int }{{p.Enemy, 1, 1}, {p.WildEnemy, p.Normal[0], p.Normal[1]}} {
		d.Enemies[variant.id] = &Enemy{ID: variant.id, TempNo: p.Temp, Name: p.Name,
			LvMin: variant.lo, LvMax: variant.hi, CreateMin: 1, CreateMax: 1,
			TacticsMode: 1, Exp: -1, PetFlag: 1, Tactics: "at:8;1;1|gu:2|wa:0;0;3;0;0;0;0"}
		d.Groups[variant.id] = &Group{ID: variant.id, Name: p.Name, Enemies: []int{variant.id}, Probs: []int{1}, AppearItem: -1, HideItem: -1}
	}
	d.lisaridoInstalled = true
	return nil
}

func (g *Game) installLisaridoHabitat() {
	d := g.Battle
	if d == nil || d.lisaridoHabitatInstalled {
		return
	}
	d.lisaridoHabitatInstalled = true
	p, err := decodeLisarido()
	if err != nil {
		g.Warnings = append(g.Warnings, "雷萨利朵分布："+err.Error())
		return
	}
	f := g.Floors[p.Floor]
	base := d.AreaAt(p.Floor, p.X, p.Y)
	if f == nil || base == nil || base.ProbMax <= 0 || !g.Tiles.Walkable(f, p.X, p.Y) || !g.Tiles.Walkable(f, p.X+1, p.Y) {
		g.Warnings = append(g.Warnings, "雷萨利朵：缺少可行走的原生遇敌区域，跳过分布")
		return
	}
	for _, area := range d.Areas {
		if area.Index == p.Temp {
			g.Warnings = append(g.Warnings, "雷萨利朵：遇敌区域编号冲突，跳过分布")
			return
		}
	}
	a := *base
	a.Index, a.ZOrder = p.Temp, base.ZOrder+1
	// Keep the complete overlay inside one original area. The adjacent walking
	// pair remains discoverable without taking over other companions' habitats.
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
		if group := d.Groups[id]; group.AppearItem == -1 && group.HideItem == -1 {
			available += base.GroupProbs[i]
		}
	}
	if available == 0 {
		g.Warnings = append(g.Warnings, "雷萨利朵：原区域没有无条件敌群，跳过分布")
		return
	}
	a.Groups = append(a.Groups, p.Group, p.WildGroup)
	a.GroupProbs = append(a.GroupProbs, available*p.YoungWeight, available*p.WildWeight)
	d.Areas = append(d.Areas, a)
}
