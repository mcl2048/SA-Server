package world

import (
	"context"
	"math/rand/v2"
	"testing"
	"time"

	"sa/server/internal/battle"
	"sa/server/internal/proto"
	"sa/server/internal/store"
)

func goldEnemy(level int) *battle.Fighter {
	return &battle.Fighter{Slot: 10, Level: level, HP: 0, KilledBy: 0}
}

func TestBattleGoldRangesAndMultipliers(t *testing.T) {
	w, _, _ := setup(t)
	e := &entity{char: store.Character{Gold: 0}}
	for _, tc := range []struct {
		name   string
		rate   float64
		levels []int
		lo, hi int
	}{
		{"disabled", 0, []int{100}, 0, 0}, {"single", 1, []int{100}, 50, 80}, {"two", 1, []int{100, 100}, 100, 160},
		{"double", 2, []int{100, 100}, 200, 320}, {"decimal", 1.5, []int{100}, 75, 120},
		{"low", 1, []int{1, 2, 3, 4}, 10, 10}, {"five-uses-percent", 1, []int{5}, 3, 4},
		{"fractional-total-rounding", .5, []int{1, 2}, 1, 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			w.Rules.BattleGoldRate = tc.rate
			b := battle.New(rand.New(rand.NewPCG(1, 2)))
			for i, lv := range tc.levels {
				b.F[10+i] = goldEnemy(lv)
			}
			for n := 0; n < 256; n++ {
				v := w.battleGold(e, b)
				if v < tc.lo || v > tc.hi {
					t.Fatalf("gold=%d, range=%d..%d", v, tc.lo, tc.hi)
				}
			}
		})
	}
}

func TestBattleGoldIgnoresUndefeatedAndHonorsWallet(t *testing.T) {
	w, _, _ := setup(t)
	w.Rules.BattleGoldRate = 1
	b := battle.New(rand.New(rand.NewPCG(1, 2)))
	b.F[10] = goldEnemy(1)
	for i := 11; i < 17; i++ {
		b.F[i] = goldEnemy(1)
	}
	b.F[11].HP = 1
	b.F[12].Escaped = true
	b.F[13].Captured = true
	b.F[14].KilledBy = -1
	b.F[15].Pet = true
	b.F[16].Player = true
	e := &entity{char: store.Character{}}
	if got := w.battleGold(e, b); got != 2 {
		t.Fatalf("defeated enemies should count even after the killer retires; got %d", got)
	}
	e.char.Gold = 999_999
	if got := w.battleGold(e, b); got != 1 {
		t.Fatalf("capped award=%d", got)
	}
	e.char.Gold = 1_000_000
	if got := w.battleGold(e, b); got != 0 {
		t.Fatalf("full wallet=%d", got)
	}
}

func TestBattleGoldKeepsDefeatsAfterPetRetires(t *testing.T) {
	w, db, g := setup(t)
	w.Rules.BattleGoldRate = 1
	w.Rules.ShareExp = false
	a, _ := petOwner(t, w, db, "goldretireA", 30, 100)
	b, _ := petOwner(t, w, db, "goldretireB", 30, 100)
	w.Do(func() {
		ea, eb := w.players[int(a.ID)], w.players[int(b.ID)]
		for bag := range ea.pets.Pets {
			ea.pets.Pets[bag] = petFromFighter(enemyFighter(w, petEnemy(t, g, 1), 20, 15), ea.char.ID)
		}
		ea.pets.Battle = 0
		ea.pets.Standby = 30
		room := &battleRoom{b: battle.New(w.rnd)}
		w.joinRoom(room, ea, 0)
		foe := goldEnemy(3)
		foe.KilledBy = 9
		room.b.F[10] = foe
		w.joinRoom(room, eb, 1)
		if foe.KilledBy >= 0 {
			t.Fatalf("retired pet kill should stop pointing at reused slot: %d", foe.KilledBy)
		}
		if got := w.battleGold(ea, room.b); got != 3 {
			t.Fatalf("retiring pet lost an already defeated enemy's stone reward: %d", got)
		}
	})
}

func TestBattleGoldActualSettlementAndPersistence(t *testing.T) {
	for _, tc := range []struct {
		name                   string
		win, pvp, dead, escape bool
		want                   int
	}{
		{name: "win", win: true, want: 3}, {name: "loss"}, {name: "pvp", win: true, pvp: true}, {name: "dead", win: true, dead: true}, {name: "escaped", win: true, escape: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			w, db, g := setup(t)
			w.Rules.BattleGoldRate = 1
			c, cl := petOwner(t, w, db, "goldfixture", 30, 60)
			id := int(c.ID)
			before := 0
			w.Do(func() {
				e := w.players[id]
				before = e.char.Gold
				f := enemyFighter(w, petEnemy(t, g, 1), 3, battle.EnemySlot(0))
				w.startBattleWith(e, []*battle.Fighter{f}, nil, nil)
				ft := e.fight
				ft.room.pvp = tc.pvp
				f.HP = 0
				f.KilledBy = ft.slot
				if tc.dead {
					ft.b.F[ft.slot].HP = 0
				}
				ft.b.F[ft.slot].Escaped = tc.escape
				win := 1
				if tc.win {
					win = 0
				}
				w.endBattle(ft.room, win)
			})
			end, ok := find[*proto.BattleEnd](cl.take())
			if !ok || end.Gold != tc.want {
				t.Fatalf("BattleEnd=%+v wantGold%d", end, tc.want)
			}
			if !w.Flush(5 * time.Second) {
				t.Fatal("flush timeout")
			}
			saved, err := db.GetCharacter(context.Background(), c.AccountID, c.ID)
			if err != nil {
				t.Fatal(err)
			}
			if saved.Gold != before+tc.want {
				t.Fatalf("savedGold%d, want%d", saved.Gold, before+tc.want)
			}
		})
	}
}
