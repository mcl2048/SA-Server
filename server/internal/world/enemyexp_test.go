package world

import (
	"context"
	"fmt"
	"testing"
	"time"

	"sa/server/internal/battle"
	"sa/server/internal/proto"
)

// These fixtures use the shipped enemy/template data all the way through real
// settlement and SQLite. Overriding foe.Exp would hide the original defect.
func TestHighLevelNativeEnemySettlementAndPersistence(t *testing.T) {
	for _, shared := range []bool{false, true} {
		for _, tc := range []struct {
			name            string
			id, level, want int
		}{
			{"fire-jibi-130", 1969, 130, 3587},
			{"fire-jibi-140", 1971, 140, 4076},
			{"tears-busudi-130", 2165, 130, 3341},
			{"tears-chigela-140", 2168, 140, 4076},
		} {
			t.Run(fmt.Sprintf("%s/shared=%v", tc.name, shared), func(t *testing.T) {
				w, db, g := setup(t)
				w.Rules.ShareExp = shared
				c, cl := petOwner(t, w, db, "nativeexp", tc.level, 100)
				w.Do(func() {
					e := w.players[int(c.ID)]
					foe := enemyFighter(w, g.Battle.Enemies[tc.id], tc.level, battle.EnemySlot(0))
					w.startBattleWith(e, []*battle.Fighter{foe}, nil, nil)
					foe.HP, foe.KilledBy = 0, e.fight.slot
					w.endBattle(e.fight.room, 0)
				})
				end, ok := find[*proto.BattleEnd](cl.take())
				if !ok || end.Result != "win" || end.Exp != tc.want {
					t.Fatalf("real high-level settlement: got %+v want XP %d", end, tc.want)
				}
				if !w.Flush(5 * time.Second) {
					t.Fatal("save queue did not drain")
				}
				saved, err := db.GetCharacter(context.Background(), c.AccountID, c.ID)
				if err != nil {
					t.Fatal(err)
				}
				if saved.Exp != tc.want || saved.Level != tc.level {
					t.Fatalf("earned experience was not persisted: lv%d XP%d", saved.Level, saved.Exp)
				}
			})
		}
	}
}

func TestHighLevelNativeRewardExclusionsAndTraining(t *testing.T) {
	for _, shared := range []bool{false, true} {
		for _, mode := range []string{"win", "lose", "escape", "dead", "pvp", "zero-event", "enemy-escaped", "enemy-captured"} {
			t.Run(fmt.Sprintf("%s/shared=%v", mode, shared), func(t *testing.T) {
				w, db, g := setup(t)
				w.Rules.ShareExp = shared
				c, cl := petOwner(t, w, db, "nativeguard", 140, 100)
				w.Do(func() {
					e := w.players[int(c.ID)]
					seed := petFromFighter(enemyFighter(w, petEnemy(t, g, 1), 140, 15), e.char.ID)
					e.pets.Pool = []*Pet{trainingPet(t, seed), seed}
					w.petsChanged(e)
					id, level := 1971, 140
					if mode == "zero-event" {
						id, level = 2239, 80
					}
					foe := enemyFighter(w, g.Battle.Enemies[id], level, battle.EnemySlot(0))
					w.startBattleWith(e, []*battle.Fighter{foe}, nil, nil)
					ft := e.fight
					foe.HP, foe.KilledBy = 0, ft.slot
					win := 0
					switch mode {
					case "lose":
						win = 1
					case "escape":
						ft.b.F[ft.slot].Escaped = true
					case "dead":
						ft.b.F[ft.slot].HP = 0
					case "pvp":
						ft.room.pvp = true
					case "enemy-escaped":
						foe.HP, foe.KilledBy, foe.Escaped = 1, -1, true
					case "enemy-captured":
						foe.HP, foe.KilledBy, foe.Captured = 1, -1, true
					}
					w.endBattle(ft.room, win)
				})
				want, train := 0, 0
				if mode == "win" {
					want, train = 4076, 3260
				}
				end, ok := find[*proto.BattleEnd](cl.take())
				if !ok || end.Exp != want {
					t.Fatalf("%s XP got %+v want %d", mode, end, want)
				}
				w.Do(func() {
					pool := w.players[int(c.ID)].pets.Pool
					if pool[0].Exp != train || pool[1].Exp != 0 {
						t.Errorf("training XP %d/%d want %d/0", pool[0].Exp, pool[1].Exp, train)
					}
				})
			})
		}
	}
}

func TestHighLevelNativePartyPetAttribution(t *testing.T) {
	for _, shared := range []bool{false, true} {
		t.Run(fmt.Sprint(shared), func(t *testing.T) {
			w, db, g := setup(t)
			w.Rules.ShareExp = shared
			var owners []*entity
			var clients []*fakeClient
			for i := 0; i < 2; i++ {
				c, cl := petOwner(t, w, db, fmt.Sprintf("nativeparty%d", i), 140, 100)
				clients = append(clients, cl)
				w.Do(func() {
					e := w.players[int(c.ID)]
					seed := petFromFighter(enemyFighter(w, petEnemy(t, g, 1), 140, 15), e.char.ID)
					e.pets.Pets[0] = seed
					e.pets.Battle, e.pets.Standby = 0, 0
					e.pets.Pool = []*Pet{trainingPet(t, seed)}
					owners = append(owners, e)
				})
			}
			w.Do(func() {
				room := &battleRoom{b: battle.New(w.rnd)}
				for i, e := range owners {
					w.joinRoom(room, e, i)
				}
				// Each player kills one enemy; only owner 0's pet kills the third.
				for i, killer := range []int{0, 1, 5} {
					foe := enemyFighter(w, g.Battle.Enemies[1971], 140, battle.EnemySlot(i))
					room.b.Add(foe)
					foe.HP, foe.KilledBy = 0, killer
				}
				w.endBattle(room, 0)
			})
			for i, cl := range clients {
				end, ok := find[*proto.BattleEnd](cl.take())
				charWant, petWant, trainWant := 4076, 0, 3260
				if i == 0 {
					petWant = 4076
					if shared {
						charWant, petWant, trainWant = 8152, 8152, 6521
					}
				} else if shared {
					petWant = 4076
				}
				if !ok || end.Exp != charWant || len(end.Pets) != 1 || end.Pets[0].Exp != petWant {
					t.Fatalf("owner %d reward %+v want character/pet %d/%d", i, end, charWant, petWant)
				}
				w.Do(func() {
					if got := owners[i].pets.Pool[0].Exp; got != trainWant {
						t.Errorf("owner %d training reward %d want %d", i, got, trainWant)
					}
				})
			}
		})
	}
}
