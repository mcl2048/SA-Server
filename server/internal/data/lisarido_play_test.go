package data_test

import (
	"math/rand/v2"
	"testing"

	"sa/server/internal/battle"
	"sa/server/internal/data"
)

func TestLisaridoNaturalPickerAndRealSkillExecution(t *testing.T) {
	g, err := data.Load("../../../gamedata")
	if err != nil {
		t.Fatal(err)
	}
	rnd := rand.New(rand.NewPCG(53, 77))
	a := g.Battle.AreaAt(11202, 40, 40)
	young, wild, original := 0, 0, 0
	for n := 0; n < 5000; n++ {
		pick := battle.PickEnemies(g.Battle, a, rnd, nil)
		if len(pick) == 0 {
			t.Fatal("empty natural encounter")
		}
		switch pick[0].Enemy.ID {
		case data.LisaridoEnemyID:
			young++
		case data.LisaridoWildEnemyID:
			wild++
		default:
			original++
		}
	}
	if young < 450 || young > 750 || wild < 750 || wild > 1050 || original < 3200 {
		t.Fatalf("unexpected actual encounter mixture: young=%d wild=%d original=%d", young, wild, original)
	}
	lisarido := battle.NewEnemy(battle.EnemySpec{Enemy: g.Battle.Enemies[data.LisaridoEnemyID], Temp: g.Battle.Temps[data.LisaridoTempID], Level: 1}, 5, g.Battle.Skills, rnd)
	if lisarido.Seed == nil || !lisarido.Seed.Capture || lisarido.Sprite != data.LisaridoSprite || lisarido.Seed.Skills[2] != data.ElectromagneticCannonSkillID {
		t.Fatalf("natural pet lacks capture/skill metadata: %+v", lisarido)
	}
	lisarido.Pet, lisarido.Loyalty, lisarido.Quick, lisarido.Atk = true, 100, 20, 500
	b := battle.New(rnd)
	b.Add(&battle.Fighter{Slot: 0, Player: true, HP: 10000, MaxHP: 10000})
	b.Add(lisarido)
	for _, slot := range []int{10, 15} {
		b.Add(&battle.Fighter{Slot: slot, HP: 100000, MaxHP: 100000, Level: 1, Tactics: "gu:1"})
	}
	events := b.Resolve(map[int]battle.Command{0: {Kind: battle.Guard}, 5: {Kind: battle.Attack, Target: 10, Skill: lisarido.Skills[2]}})
	hits := 0
	for _, e := range events {
		if e.Actor == 5 && e.Kind == battle.Magic && e.Effect == data.ElectromagneticCannonEffect && e.Damage > 0 {
			hits++
		}
	}
	if hits != 5 {
		t.Fatalf("natural registered skill did not execute on five remote shots: %+v", events)
	}
	t.Logf("5000 real encounters: young=%d wild=%d original=%d; native skill hits=%d", young, wild, original, hits)
}
