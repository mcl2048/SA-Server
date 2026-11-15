package world

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"

	"sa/server/internal/battle"
	"sa/server/internal/proto"
)

// These tests exercise the public NPC reply state machine and real SQLite saves;
// a wrong capacity, fee, row/page check, or settlement hook must fail them.
func petCareWindow(t *testing.T, cl *fakeClient) *proto.NpcWindow {
	t.Helper()
	win, ok := find[*proto.NpcWindow](cl.take())
	if !ok {
		t.Fatal("expected NPC window")
	}
	return win
}

func trainingPet(t *testing.T, p *Pet) *Pet {
	t.Helper()
	b, err := json.Marshal(p)
	if err != nil {
		t.Fatal(err)
	}
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(b, &obj); err != nil {
		t.Fatal(err)
	}
	obj["training"] = json.RawMessage("true")
	b, err = json.Marshal(obj)
	if err != nil {
		t.Fatal(err)
	}
	var copy Pet
	if err := json.Unmarshal(b, &copy); err != nil {
		t.Fatal(err)
	}
	return &copy
}

func isTrainingPet(t *testing.T, p *Pet) bool {
	t.Helper()
	b, err := json.Marshal(p)
	if err != nil {
		t.Fatal(err)
	}
	var obj struct {
		Training bool `json:"training"`
	}
	if err := json.Unmarshal(b, &obj); err != nil {
		t.Fatal(err)
	}
	return obj.Training
}

func TestPetCareCapacity500AndPageBounds(t *testing.T) {
	w, db, g := setup(t)
	n := findNPC(t, w, "PetShop", "ps_1003_12_13")
	c, cl := besideNPC(t, w, db, "petcarecapacity", n)
	id := int(c.ID)
	slot := givePet(t, w, id, petEnemy(t, g, 1), 3)
	w.Do(func() {
		e := w.players[id]
		seed := e.pets.Pets[slot]
		for i := 0; i < 499; i++ {
			pet := *seed
			pet.FreeName = fmt.Sprintf("仓宠%03d", i+1)
			e.pets.Pool = append(e.pets.Pool, &pet)
		}
		e.char.Gold = 1000
		w.petPool(e, n, slot)
		if len(e.pets.Pool) != 500 || e.pets.Pets[slot] != nil || e.char.Gold != 946 {
			t.Errorf("untranscended character must store pet 500 atomically: pool=%d carried=%v gold=%d", len(e.pets.Pool), e.pets.Pets[slot], e.char.Gold)
		}
		pet := *seed
		e.pets.Pets[slot] = &pet
		w.petPool(e, n, slot)
		if len(e.pets.Pool) != 500 || e.pets.Pets[slot] == nil || e.char.Gold != 946 {
			t.Error("pet 501 must leave wallet and carried pet unchanged")
		}
		e.pets.Pets[slot] = nil
	})
	cl.take()
	w.Talk(id, n.id)
	win := petCareWindow(t, cl)
	w.NpcWindowReply(id, n.id, win.Seq, 0, "2")
	win = petCareWindow(t, cl)
	if win.Buttons&BtnPrev != 0 || win.Buttons&BtnNext == 0 || !strings.Contains(win.Text, "1/100") || !strings.Contains(win.Text, "500/500") {
		t.Fatalf("first page must expose next only and real capacity: %+v", win)
	}
	for page := 2; page <= 100; page++ {
		w.NpcWindowReply(id, n.id, win.Seq, BtnNext, "")
		win = petCareWindow(t, cl)
	}
	if win.Buttons&BtnNext != 0 || win.Buttons&BtnPrev == 0 || !strings.Contains(win.Text, "100/100") || !strings.Contains(win.Text, "仓宠499") {
		t.Fatalf("last page must expose actual pets, previous only: %+v", win)
	}
	w.NpcWindowReply(id, n.id, win.Seq, 0, "5")
	win = petCareWindow(t, cl)
	if !strings.Contains(win.Text, "领回[") {
		t.Fatalf("500th pet must be reachable: %+v", win)
	}
	w.NpcWindowReply(id, n.id, win.Seq, BtnYes, "")
	petCareWindow(t, cl)
	w.Do(func() {
		if e := w.players[id]; len(e.pets.Pool) != 499 || e.pets.Pets[0] == nil {
			t.Error("last page selection must retrieve exactly pet 500")
		}
	})
}

func TestPetCareRejectsForgedPageRowsAndButtons(t *testing.T) {
	for _, tc := range []struct {
		name   string
		button int
		row    string
	}{
		{"previous-on-first", BtnPrev, ""}, {"far-row", 0, "6"}, {"negative-row", 0, "-1"}, {"malformed-row", 0, "1junk"},
		{"unexpected-button", BtnYes, "1"}, {"combined-buttons", BtnNext | BtnPrev, ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			w, db, g := setup(t)
			n := findNPC(t, w, "PetShop", "ps_1003_12_13")
			c, cl := besideNPC(t, w, db, "petcareforged", n)
			id := int(c.ID)
			givePet(t, w, id, petEnemy(t, g, 1), 3)
			w.Do(func() {
				e := w.players[id]
				for i := 0; i < 6; i++ {
					copy := *e.pets.Pets[0]
					e.pets.Pool = append(e.pets.Pool, &copy)
				}
				e.pets.Pets[0] = nil
			})
			cl.take()
			w.Talk(id, n.id)
			win := petCareWindow(t, cl)
			w.NpcWindowReply(id, n.id, win.Seq, 0, "2")
			win = petCareWindow(t, cl)
			w.NpcWindowReply(id, n.id, win.Seq, tc.button, tc.row)
			w.Do(func() {
				e := w.players[id]
				if e.window != nil && (e.window.seq == seqPetShopAskDraw || e.window.event < 0) {
					t.Errorf("forged request opened unauthorized row/page: %+v", e.window)
				}
				if len(e.pets.Pool) != 6 || e.pets.Pets[0] != nil {
					t.Error("forged request mutated inventory")
				}
			})
		})
	}
}

func TestPetCareTrainingEveryShopFeePersistenceAndDraw(t *testing.T) {
	for _, hasPool := range []bool{true, false} {
		t.Run(fmt.Sprint(hasPool), func(t *testing.T) {
			w, db, g := setup(t)
			n := findNPC(t, w, "PetShop", "ps_1003_12_13")
			w.Do(func() {
				copy := *n.npc
				n.npc = &copy
				if !hasPool {
					n.npc.Arg = strings.ReplaceAll(n.npc.Arg, "pool_flg:1", "pool_flg:0")
				}
			})
			c, cl := besideNPC(t, w, db, "petcaretrain", n)
			id := int(c.ID)
			givePet(t, w, id, petEnemy(t, g, 1), 3)
			w.Do(func() { w.players[id].char.Level = 12; w.players[id].char.Gold = 4000 })
			cl.take()
			w.Talk(id, n.id)
			win := petCareWindow(t, cl)
			if !strings.Contains(win.Text, "培养宠物") || !strings.Contains(win.Text, "领取宠物") {
				t.Fatalf("every shop needs both training and retrieval: %+v", win)
			}
			trainOption, drawOption := "4", "2"
			if !hasPool {
				trainOption, drawOption = "3", "1"
			}
			w.NpcWindowReply(id, n.id, win.Seq, 0, trainOption)
			win = petCareWindow(t, cl)
			if win.Kind != "petselect" {
				t.Fatalf("expected native pet selection: %+v", win)
			}
			w.NpcWindowReply(id, n.id, win.Seq, 0, "1")
			win = petCareWindow(t, cl)
			if win.Kind != "message" || win.Buttons != BtnYesNo || !strings.Contains(win.Text, "1500") || !strings.Contains(win.Text, "80%") {
				t.Fatalf("fee must quote (12+3)*100 and experience rule: %+v", win)
			}
			w.NpcWindowReply(id, n.id, win.Seq, BtnNo, "")
			petCareWindow(t, cl)
			w.Do(func() {
				if e := w.players[id]; e.char.Gold != 4000 || e.pets.Pets[0] == nil || len(e.pets.Pool) != 0 {
					t.Error("cancel charged or removed pet")
				}
			})
			w.Talk(id, n.id)
			win = petCareWindow(t, cl)
			w.NpcWindowReply(id, n.id, win.Seq, 0, trainOption)
			win = petCareWindow(t, cl)
			w.NpcWindowReply(id, n.id, win.Seq, 0, "1")
			win = petCareWindow(t, cl)
			w.NpcWindowReply(id, n.id, win.Seq, BtnYes, "")
			w.NpcWindowReply(id, n.id, win.Seq, BtnYes, "") // a replay cannot charge twice
			win = petCareWindow(t, cl)
			w.Do(func() {
				e := w.players[id]
				if e.char.Gold != 2500 || e.pets.Pets[0] != nil || len(e.pets.Pool) != 1 || !isTrainingPet(t, e.pets.Pool[0]) {
					t.Errorf("training must atomically move one marked pet and charge once: gold=%d pool=%v", e.char.Gold, e.pets.Pool)
				}
			})
			if !w.Flush(5 * time.Second) {
				t.Fatal("flush timeout")
			}
			saved, err := db.GetCharacter(context.Background(), c.AccountID, c.ID)
			if err != nil {
				t.Fatal(err)
			}
			if saved.Gold != 2500 || len(parsePets(saved.Pets).Pool) != 1 || !isTrainingPet(t, parsePets(saved.Pets).Pool[0]) {
				t.Fatalf("training state and fee must persist together: %+v", saved)
			}
			w.NpcWindowReply(id, n.id, win.Seq, BtnOK, "")
			win = petCareWindow(t, cl)
			w.NpcWindowReply(id, n.id, win.Seq, 0, drawOption)
			win = petCareWindow(t, cl)
			if !strings.Contains(win.Text, "培养") {
				t.Fatalf("pooled training must be visible: %+v", win)
			}
			w.NpcWindowReply(id, n.id, win.Seq, 0, "1")
			win = petCareWindow(t, cl)
			w.NpcWindowReply(id, n.id, win.Seq, BtnYes, "")
			cl.take()
			w.Do(func() {
				if e := w.players[id]; len(e.pets.Pool) != 0 || e.pets.Pets[0] == nil || isTrainingPet(t, e.pets.Pets[0]) {
					t.Error("retrieval must stop training and keep the same pet")
				}
			})
		})
	}
}

func TestPetCareBattleExperienceAndNoActivePetPersistence(t *testing.T) {
	for _, tc := range []struct {
		name                    string
		win, dead, escaped, pvp bool
	}{
		{name: "win", win: true}, {name: "lose"}, {name: "dead", win: true, dead: true}, {name: "escaped", win: true, escaped: true}, {name: "pvp", win: true, pvp: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			w, db, g := setup(t)
			w.Rules.ShareExp = false
			c, cl := petOwner(t, w, db, "petcarebattle", 30, 100)
			id := int(c.ID)
			var trained, ordinary *Pet
			w.Do(func() {
				e := w.players[id]
				seed := petFromFighter(enemyFighter(w, petEnemy(t, g, 1), 1, 15), e.char.ID)
				trained, ordinary = trainingPet(t, seed), seed
				e.pets.Pool = []*Pet{trained, ordinary}
				w.petsChanged(e)
				foe := enemyFighter(w, petEnemy(t, g, 1), 30, battle.EnemySlot(0))
				w.startBattleWith(e, []*battle.Fighter{foe}, nil, nil)
				ft := e.fight
				ft.room.pvp = tc.pvp
				foe.HP, foe.KilledBy, foe.Exp = 0, ft.slot, 127
				if tc.dead {
					ft.b.F[ft.slot].HP = 0
				}
				ft.b.F[ft.slot].Escaped = tc.escaped
				win := 1
				if tc.win {
					win = 0
				}
				w.endBattle(ft.room, win)
			})
			end, ok := find[*proto.BattleEnd](cl.take())
			if !ok {
				t.Fatal("missing actual battle settlement")
			}
			want := end.Exp * 4 / 5
			if tc.name == "win" && want <= 0 {
				t.Fatalf("fixture needs positive battle XP: %+v", end)
			}
			w.Do(func() {
				// Convert the earned total back from per-level accounting to
				// compare independently with the owner's actual settlement.
				total := trained.Exp
				for lv := 1; lv < trained.Level; lv++ {
					total += w.game.Battle.NextLevelExp(lv)
				}
				if total != want || ordinary.Exp != 0 || ordinary.Level != 1 {
					t.Errorf("only training pet earns floor(owner actual XP*80%%): trained total=%d want=%d ordinary=%+v", total, want, ordinary)
				}
				if want > 2 && (trained.Level <= 1 || trained.Vital <= ordinary.Vital) {
					t.Error("training must run real automatic stat growth")
				}
			})
			if !w.Flush(5 * time.Second) {
				t.Fatal("flush timeout")
			}
			saved, err := db.GetCharacter(context.Background(), c.AccountID, c.ID)
			if err != nil {
				t.Fatal(err)
			}
			pool := parsePets(saved.Pets).Pool
			if len(pool) != 2 || pool[0].Level != trained.Level || pool[0].Exp != trained.Exp || !isTrainingPet(t, pool[0]) {
				t.Errorf("training-only battle must persist without any active pet: %s", saved.Pets)
			}
		})
	}
}

func TestPetCareTrainingLiveGuardsAreAtomic(t *testing.T) {
	w, db, g := setup(t)
	n := findNPC(t, w, "PetShop", "ps_1003_12_13")
	for i, name := range []string{"poor", "riding", "mail", "guard", "full", "fight", "trade", "stall"} {
		t.Run(name, func(t *testing.T) {
			c, cl := besideNPC(t, w, db, fmt.Sprintf("careguard%d", i), n)
			id := int(c.ID)
			givePet(t, w, id, petEnemy(t, g, 1), 3)
			w.Do(func() {
				e := w.players[id]
				pet := e.pets.Pets[0]
				e.char.Level, e.char.Gold = 12, 4000
				switch name {
				case "poor":
					e.char.Gold = 1499
				case "riding":
					e.pets.Ride = 0
				case "mail":
					pet.Away = true
				case "guard":
					pet.Guard = true
				case "full":
					for j := 0; j < 500; j++ {
						copy := *pet
						e.pets.Pool = append(e.pets.Pool, &copy)
					}
				case "fight":
					e.fight = &fight{}
				case "trade":
					e.trade = &trade{}
				case "stall":
					e.stall = &vendorStall{}
				}
				gold, pool := e.char.Gold, len(e.pets.Pool)
				w.petStore(e, n, 0, true)
				if e.char.Gold != gold || len(e.pets.Pool) != pool || e.pets.Pets[0] != pet || isTrainingPet(t, pet) {
					t.Errorf("%s changed pet/wallet before a failed constraint", name)
				}
				// These minimal blockers intentionally have no live sessions.
				e.fight, e.trade, e.stall = nil, nil, nil
			})
			cl.take()
		})
	}
}

func TestPetCareConfirmationBindsObjectAndRequotesChangedFee(t *testing.T) {
	w, db, g := setup(t)
	n := findNPC(t, w, "PetShop", "ps_1003_12_13")
	c, cl := besideNPC(t, w, db, "carequoted", n)
	id := int(c.ID)
	givePet(t, w, id, petEnemy(t, g, 1), 3)
	w.Do(func() { w.players[id].char.Level = 12; w.players[id].char.Gold = 4000 })
	cl.take()
	quote := func() *proto.NpcWindow {
		w.Talk(id, n.id)
		win := petCareWindow(t, cl)
		w.NpcWindowReply(id, n.id, win.Seq, 0, "4")
		win = petCareWindow(t, cl)
		w.NpcWindowReply(id, n.id, win.Seq, 0, "1")
		return petCareWindow(t, cl)
	}
	win := quote()
	w.Do(func() { copy := *w.players[id].pets.Pets[0]; w.players[id].pets.Pets[0] = &copy })
	w.NpcWindowReply(id, n.id, win.Seq, BtnYes, "")
	petCareWindow(t, cl)
	w.Do(func() {
		if e := w.players[id]; e.char.Gold != 4000 || e.pets.Pets[0] == nil || len(e.pets.Pool) != 0 {
			t.Error("confirmation cultivated a replacement pet")
		}
	})
	win = quote()
	w.Do(func() { w.players[id].char.Level = 13 })
	w.NpcWindowReply(id, n.id, win.Seq, BtnYes, "")
	win = petCareWindow(t, cl)
	if win.Seq != 271 || !strings.Contains(win.Text, "1600") {
		t.Fatalf("changed levels need a new quote: %+v", win)
	}
	w.Do(func() {
		if e := w.players[id]; e.char.Gold != 4000 || len(e.pets.Pool) != 0 {
			t.Error("stale quote charged before confirmation")
		}
	})
	w.NpcWindowReply(id, n.id, win.Seq, BtnYes, "")
	petCareWindow(t, cl)
	w.Do(func() {
		if e := w.players[id]; e.char.Gold != 2400 || len(e.pets.Pool) != 1 {
			t.Error("newly confirmed quote did not charge exact current fee")
		}
	})
}

func TestPetCareAllPetsUseFullBoostedTeamBattleAward(t *testing.T) {
	for _, shared := range []bool{false, true} {
		t.Run(fmt.Sprint(shared), func(t *testing.T) {
			w, db, g := setup(t)
			w.Rules.ExpRate, w.Rules.ShareExp = 2, shared
			owners := make([]int, 2)
			clients := make([]*fakeClient, 2)
			for i := range owners {
				c, cl := petOwner(t, w, db, fmt.Sprintf("careteam%d", i), 30, 100)
				owners[i], clients[i] = int(c.ID), cl
			}
			w.Do(func() {
				room := &battleRoom{b: battle.New(w.rnd)}
				for i, id := range owners {
					e := w.players[id]
					pet := petFromFighter(enemyFighter(w, petEnemy(t, g, 1), 30, 15), e.char.ID)
					e.pets.Pool = []*Pet{trainingPet(t, pet), trainingPet(t, pet), pet}
					e.addExp = addExp{power: 50, secs: 60}
					w.petsChanged(e)
					w.joinRoom(room, e, i)
					foe := enemyFighter(w, petEnemy(t, g, 1), 30, battle.EnemySlot(i))
					foe.Exp, foe.HP, foe.KilledBy = 127, 0, i
					room.b.F[foe.Slot] = foe
				}
				w.endBattle(room, 0)
			})
			for i, id := range owners {
				end, ok := find[*proto.BattleEnd](clients[i].take())
				// 127 base * 2 configured multiplier * 1.5 wisdom boost =381;
				// each of the two stored training pets independently receives304.
				if !ok || end.Exp != 381 {
					t.Fatalf("team member%d actual boosted XP=%+v", i, end)
				}
				w.Do(func() {
					e := w.players[id]
					if e.pets.Pool[0].Exp != 304 || e.pets.Pool[1].Exp != 304 || e.pets.Pool[2].Exp != 0 {
						t.Errorf("member%d did not give every training pet full 80%% without splitting", i)
					}
				})
			}
		})
	}
}

func TestPetCareAutomationAndDetachedSettlementExactlyOnce(t *testing.T) {
	for _, mode := range []struct {
		name            string
		quick, detached bool
	}{
		{"auto", false, false}, {"quick", true, false}, {"background", true, true},
	} {
		t.Run(mode.name, func(t *testing.T) {
			w, db, g := setup(t)
			c, cl := petOwner(t, w, db, "careautomated", 30, 100)
			id := int(c.ID)
			w.Do(func() {
				e := w.players[id]
				seed := petFromFighter(enemyFighter(w, petEnemy(t, g, 1), 30, 15), e.char.ID)
				e.pets.Pool = []*Pet{trainingPet(t, seed), trainingPet(t, seed)}
				w.petsChanged(e)
				e.connected = !mode.detached
				enemy := enemyFighter(w, petEnemy(t, g, 1), 30, battle.EnemySlot(0))
				enemy.HP, enemy.MaxHP, enemy.Atk, enemy.Def, enemy.Quick = 1, 1, 0, 0, 0
				enemy.Exp, enemy.Tactics = 127, "gu:1"
				w.startBattleWith(e, []*battle.Fighter{enemy}, nil, func(string, []*entity) {})
				e.fight.b.F[e.fight.slot].Atk = 1_000_000
				e.automation = &autoPlayState{autoBattle: true, quick: mode.quick, settings: defaultAutoSettings()}
				now := w.now()
				for i := 0; i < 20; i++ {
					w.automationTick(now.Add(time.Duration(i) * time.Second))
				}
				if e.fight != nil {
					t.Error("automated battle failed to finish")
					return
				}
				for _, pet := range e.pets.Pool {
					if pet.Exp != 101 {
						t.Errorf("repeated automation ticks must award each training pet exactly101, got%d", pet.Exp)
					}
				}
			})
			ends := 0
			for _, msg := range cl.take() {
				if end, ok := msg.(*proto.BattleEnd); ok {
					ends++
					if end.Exp != 127 || end.Result != "win" {
						t.Errorf("invalid automated settlement %+v", end)
					}
				}
			}
			if ends != 1 {
				t.Errorf("expected exactly one completion, got%d", ends)
			}
		})
	}
}

func TestPetCareNonBattleExperienceAndLevelCeiling(t *testing.T) {
	w, db, g := setup(t)
	c, _ := petOwner(t, w, db, "carelevelcap", 30, 100)
	w.Do(func() {
		e := w.players[int(c.ID)]
		seed := petFromFighter(enemyFighter(w, petEnemy(t, g, 1), 49, 15), e.char.ID)
		trained := trainingPet(t, seed)
		trained.LimitLevel = 50
		e.pets.Pool = []*Pet{trained}
		w.gainExp(e, 100)
		if trained.Exp != 0 || trained.Level != 49 {
			t.Error("non-battle character XP must not train pool pets")
		}
		if w.trainPoolPets(e, 1) || trained.Exp != 0 {
			t.Error("80% rounds down; one owner XP grants zero")
		}
		trained.Exp = w.game.Battle.NextLevelExp(49) - 1
		w.trainPoolPets(e, 100)
		if trained.Level != 50 || trained.Exp != 79 {
			t.Errorf("native template ceiling/retained XP violated: %+v", trained)
		}
		w.trainPoolPets(e, 100)
		if trained.Level != 50 || trained.Exp != 159 {
			t.Error("ceiling must retain XP without additional growth")
		}
	})
}

func TestPetCareExistingGoldOverflowSaleStillConfirms(t *testing.T) {
	w, db, g := setup(t)
	n := findNPC(t, w, "PetShop", "ps_1003_12_13")
	c, cl := besideNPC(t, w, db, "caregoldcap", n)
	id := int(c.ID)
	givePet(t, w, id, petEnemy(t, g, 1), 3)
	w.Do(func() { w.players[id].char.Gold = 999_999 })
	cl.take()
	w.Talk(id, n.id)
	win := petCareWindow(t, cl)
	w.NpcWindowReply(id, n.id, win.Seq, 0, "3")
	win = petCareWindow(t, cl)
	w.NpcWindowReply(id, n.id, win.Seq, 0, "1")
	win = petCareWindow(t, cl)
	w.NpcWindowReply(id, n.id, win.Seq, BtnYes, "")
	win = petCareWindow(t, cl)
	if win.Seq != seqPetShopGoldOver {
		t.Fatalf("expected capped-wallet confirmation: %+v", win)
	}
	w.NpcWindowReply(id, n.id, win.Seq, BtnYes, "")
	petCareWindow(t, cl)
	w.Do(func() {
		if e := w.players[id]; e.pets.Pets[0] != nil || e.char.Gold != 1_000_000 {
			t.Error("existing over-cap sale regressed")
		}
	})
}
