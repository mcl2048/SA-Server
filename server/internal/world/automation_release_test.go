package world

import (
	"context"
	"math/rand/v2"
	"testing"
	"time"

	"sa/server/internal/battle"
	"sa/server/internal/data"
	"sa/server/internal/proto"
)

// Every automatic escape path needs the same bound. Counting selected intents
// would be wrong: status effects can prevent an intended escape from executing.
func TestAutomationImplicitEscapeThreeActualFailuresThenFight(t *testing.T) {
	for _, capture := range []bool{false, true} {
		name := "danger"
		if capture {
			name = "capture-without-target"
		}
		t.Run(name, func(t *testing.T) {
			w, db, g := setup(t)
			c, cl := petOwner(t, w, db, "bounded-"+name, 30, 100)
			w.Do(func() {
				e := w.players[int(c.ID)]
				foe := enemyFighter(w, petEnemy(t, g, 1), 1000, 15)
				foe.HP, foe.MaxHP, foe.Atk, foe.Tactics = 100000, 100000, 0, "gu:1"
				w.startBattleWith(e, []*battle.Fighter{foe}, nil, func(string, []*entity) {})
				me := e.fight.b.F[e.fight.slot]
				me.HP, me.MaxHP, me.MP = 200, 200, 100
				a := &autoPlayState{quick: true, settings: defaultAutoSettings()}
				a.settings.AutoEscape, a.settings.Capture, a.settings.Escape = false, capture, !capture
				a.settings.First, a.settings.Then = autoAction{Kind: "attack"}, autoAction{Kind: "attack"}
				e.automation = a
				now := w.now()
				for i := 0; i < 20 && e.fight != nil && e.fight.room.turn < 4; i++ {
					w.automationTick(now.Add(time.Duration(i) * 5 * time.Second))
				}
				if e.fight == nil || e.fight.room.turn != 4 || a.escapeFailures != 3 {
					t.Errorf("automatic escape was not bounded: fight=%v failures=%d", e.fight != nil, a.escapeFailures)
				}
			})
			var kinds []string
			for _, msg := range cl.take() {
				if turn, ok := msg.(*proto.BattleTurn); ok {
					for _, ev := range turn.Events {
						if ev.Actor == 0 {
							kinds = append(kinds, ev.Kind)
						}
					}
				}
			}
			if len(kinds) != 4 || kinds[0] != "escape" || kinds[1] != "escape" || kinds[2] != "escape" || kinds[3] != "attack" {
				t.Errorf("must fight after three confirmed failures: %v", kinds)
			}
		})
	}
}

func TestDetachedPresentationSkipsButReattachRestoresAuthoritativeState(t *testing.T) {
	w, db, g := setup(t)
	c, cl := petOwner(t, w, db, "offline-presentation", 30, 100)
	id := int(c.ID)
	givePet(t, w, id, petEnemy(t, g, 1), 10)
	cl.take()
	w.Detach(id, cl)
	cl.take()
	w.Do(func() {
		e := w.players[id]
		e.inv[data.EquipSlots] = w.newItem(g.Items[1500])
		e.pets.Pets[0].HP = 17
		e.char.Gold += 29
		w.itemsChanged(e)
		w.petsChanged(e)
		w.sendStatus(e)
		w.sendQuests(e)
		foe := enemyFighter(w, petEnemy(t, g, 1), 1, 15)
		w.startBattleWith(e, []*battle.Fighter{foe}, nil, func(string, []*entity) {})
	})
	for _, msg := range cl.take() {
		switch msg.(type) {
		case *proto.Inventory, *proto.Pets, *proto.Status, *proto.QuestLog, *proto.BattleStart:
			t.Errorf("detached actor built a discarded presentation: %T", msg)
		}
	}
	if !w.Flush(5 * time.Second) {
		t.Fatal("persistence flush failed")
	}
	saved, err := db.GetCharacter(context.Background(), c.AccountID, c.ID)
	if err != nil || saved.Gold != c.Gold+29 || parsePets(saved.Pets).Pets[0].HP != 17 || parseInventory(saved.Items)[data.EquipSlots] == nil {
		t.Fatalf("presentation optimization lost authoritative save: gold=%d err=%v", saved.Gold, err)
	}
	replacement := &fakeClient{}
	if !w.Attach(id, cl, replacement) {
		t.Fatal("reattach failed")
	}
	msgs := replacement.take()
	inv, invOK := find[*proto.Inventory](msgs)
	pets, petsOK := find[*proto.Pets](msgs)
	start, startOK := find[*proto.BattleStart](msgs)
	_, statusOK := find[*proto.Status](msgs)
	_, questsOK := find[*proto.QuestLog](msgs)
	if !invOK || inv.Gold != saved.Gold || !petsOK || len(pets.Pets) != 1 || pets.Pets[0].HP != 17 || !startOK || !start.Resume || !statusOK || !questsOK {
		t.Fatal("reattach did not restore current inventory, pets, status, quests and battle")
	}
}

func TestDetachedStatusStillUpdatesAttachedPartyMember(t *testing.T) {
	w, db, _ := setup(t)
	ca, cla := petOwner(t, w, db, "offline-party-owner", 30, 100)
	cb, clb := petOwner(t, w, db, "online-party-observer", 30, 100)
	w.Do(func() { w.joinPartyMain(w.players[int(cb.ID)], w.players[int(ca.ID)]) })
	w.Detach(int(ca.ID), cla)
	cla.take()
	clb.take()
	w.Do(func() {
		e := w.players[int(ca.ID)]
		e.char.HP = 23
		w.sendStatus(e)
	})
	m, ok := find[*proto.PartyMember](clb.take())
	if !ok || m.ID != int(ca.ID) || m.HP != 23 {
		t.Fatalf("online teammate missed detached HP: %+v", m)
	}
	if _, ok := find[*proto.Status](cla.take()); ok {
		t.Fatal("detached actor built its own status")
	}
}

func TestAutomationFarmRecoversBeforeDiscardAndSafetyStop(t *testing.T) {
	w, db, g := setup(t)
	c, cl := petOwner(t, w, db, "farm-prepare", 30, 100)
	w.Detach(int(c.ID), cl)
	w.Do(func() {
		e := w.players[int(c.ID)]
		e.char.HP = 1
		e.inv[9], e.inv[10] = w.newItem(g.Items[1500]), w.newItem(g.Items[1234])
		a := &autoPlayState{encounter: true, quick: true, floor: e.floor, direction: -1, settings: defaultAutoSettings(), lastRoom: &battleRoom{}}
		a.settings.Meat = true
		e.automation = a
		now := w.now()
		w.automationTick(now)
		if e.char.HP <= 1 || e.inv[10] != nil || e.inv[9] == nil || !a.encounter {
			t.Errorf("farm failed to heal with meat before discard/stop: hp=%d meat=%v medicine=%v encounter=%v", e.char.HP, e.inv[10] != nil, e.inv[9] != nil, a.encounter)
		}
		// A repeat of the same tick cannot consume another supply or move.
		hp, x, y := e.char.HP, e.x, e.y
		w.automationTick(now)
		if e.char.HP != hp || e.inv[9] == nil || e.x != x || e.y != y {
			t.Error("preparation was not paced")
		}
	})
}

func TestAutomationPostBattleMeatWaitsForInventoryTransaction(t *testing.T) {
	w, db, g := setup(t)
	c, _ := petOwner(t, w, db, "meat-transaction", 30, 100)
	w.Do(func() {
		e := w.players[int(c.ID)]
		e.inv[9] = w.newItem(g.Items[1234])
		a := &autoPlayState{quick: true, settings: defaultAutoSettings(), lastRoom: &battleRoom{}}
		a.settings.Meat = true
		e.automation, e.window = a, &npcWindow{}
		now := w.now()
		w.automationTick(now)
		if e.inv[9] == nil {
			t.Error("post-battle discard mutated an open inventory transaction")
		}
		e.window = nil
		w.automationTick(now.Add(time.Second))
		if e.inv[9] != nil {
			t.Error("post-battle discard did not resume after transaction")
		}
	})
}

func TestAutomationFieldRecoveryHonorsFieldScopeAndPause(t *testing.T) {
	w, db, g := setup(t)
	c, _ := petOwner(t, w, db, "farm-scope", 30, 100)
	w.Do(func() {
		e := w.players[int(c.ID)]
		// Isolate definitions from the shared game loaded by other tests.
		copyGame, def := *g, *g.Items[1500]
		copyGame.Items = map[int]*data.ItemDef{def.ID: &def}
		w.game = &copyGame
		e.char.HP, e.char.MP = 1, 100
		e.inv[9] = w.newItem(&def)
		def.Field = 1
		if w.automationFieldRecovery(e, 30) || e.inv[9] == nil {
			t.Error("combat-only supply used in the field")
		}
		def.Field, def.Argument = 2, "体-10"
		if w.automationFieldRecovery(e, 30) || e.char.HP != 1 {
			t.Error("negative native effect treated as healing")
		}
		def.Argument = "体100"
		if w.automationFieldRecovery(e, 0) {
			t.Error("zero recovery threshold must disable preparation")
		}
		a := &autoPlayState{encounter: true, quick: true, paused: true, lastUpdate: w.now(), floor: e.floor, settings: defaultAutoSettings()}
		e.automation = a
		w.automationTick(w.now())
		if e.char.HP != 1 || e.inv[9] == nil {
			t.Error("live settings lease failed to pause preparation")
		}
		// A detached browser cannot indefinitely retain its UI lease.
		e.connected = false
		w.automationTick(w.now())
		if e.char.HP <= 1 || e.inv[9] != nil {
			t.Error("field-only healing did not resume after detach")
		}
	})
}

func TestAutomationReusedPrimaryPetStillGuardsOnFailedEscape(t *testing.T) {
	w, db, g := setup(t)
	c, cl := petOwner(t, w, db, "escape-primary-guard", 30, 100)
	givePet(t, w, int(c.ID), petEnemy(t, g, 1), 10)
	w.Do(func() {
		e := w.players[int(c.ID)]
		e.pets.Battle = 0
		foe := enemyFighter(w, petEnemy(t, g, 1), 1000, 15)
		foe.HP, foe.MaxHP, foe.Atk, foe.Tactics = 100000, 100000, 0, "gu:1"
		w.startBattleWith(e, []*battle.Fighter{foe}, nil, func(string, []*entity) {})
		pet := e.fight.b.F[5]
		pet.HP, pet.MaxHP, pet.Loyalty = 1000, 1000, 100
		pet.Skills = [7]*data.Skill{{ID: 1, Func: "PETSKILL_NormalAttack", Target: 1}, {ID: 2, Func: "PETSKILL_NormalGuard", Target: 0}}
		a := &autoPlayState{quick: true, settings: defaultAutoSettings()}
		a.settings.AutoEscape = true
		e.automation = a
		now := w.now()
		w.automationTick(now)
		w.automationTick(now.Add(time.Second))
	})
	guard := false
	for _, msg := range cl.take() {
		if turn, ok := msg.(*proto.BattleTurn); ok {
			for _, ev := range turn.Events {
				guard = guard || ev.Actor == 5 && ev.Kind == "guard"
			}
		}
	}
	if !guard {
		t.Error("primary pet lost defensive action during automatic escape")
	}
}

func TestAutomationChangedFloorStopsBeforeUsingSupplies(t *testing.T) {
	w, db, g := setup(t)
	c, _ := petOwner(t, w, db, "farm-floor-stop", 30, 100)
	w.Do(func() {
		e := w.players[int(c.ID)]
		a := &autoPlayState{encounter: true, quick: true, floor: e.floor + 1, settings: defaultAutoSettings()}
		e.automation, e.char.HP, e.inv[9] = a, 1, w.newItem(g.Items[1234])
		w.automationTick(w.now())
		if a.encounter || e.char.HP != 1 || e.inv[9] == nil || a.reason != "地图已改变，已停止自动遇敌。" {
			t.Errorf("changed-floor farm consumed supplies before stopping: hp=%d retained=%v active=%v reason=%s", e.char.HP, e.inv[9] != nil, a.encounter, a.reason)
		}
	})
}

func TestAutomationFieldRecoveryMPAndParticipatingPetsUseNativeEffects(t *testing.T) {
	w, db, g := setup(t)
	c, _ := petOwner(t, w, db, "farm-mp-pets", 30, 100)
	for i := 0; i < 2; i++ {
		givePet(t, w, int(c.ID), petEnemy(t, g, 1), 10)
	}
	w.Do(func() {
		e := w.players[int(c.ID)]
		e.char.HP, e.char.MP = -1, 0
		e.inv[9] = w.newItem(g.Items[1510])
		if !w.automationFieldRecovery(e, 30) || e.char.MP <= 0 || e.inv[9] != nil || e.char.HP != -1 {
			t.Error("native field MP medicine was not consumed exactly once")
		}
		e.char.MP = 100
		e.pets.Battle, e.pets.Standby = 0, 0
		e.pets.Pets[0].HP, e.pets.Pets[1].HP = 1, 1
		e.inv[9] = w.newItem(g.Items[1500])
		if !w.automationFieldRecovery(e, 30) || e.pets.Pets[0].HP <= 1 || e.pets.Pets[1].HP != 1 || e.inv[9] != nil {
			t.Error("field medicine must heal the participating pet, preserving resting pets")
		}
		if w.automationFieldRecovery(e, 30) {
			t.Error("empty bag must not invent recovery")
		}
	})
}

// Real game definitions, five carried pets and a full bag; network encoding and
// SQL are deliberately outside these measurements. They isolate discarded view
// construction and the decision allocator, rather than claiming server QPS.
func releaseBenchmarkEntity(b *testing.B) (*World, *entity) {
	b.Helper()
	g, err := data.Load("../../../gamedata")
	if err != nil {
		b.Fatal(err)
	}
	w := &World{game: g, rnd: rand.New(rand.NewPCG(1, 2))}
	e := &entity{kind: "player", client: &battleTurnCounter{}, connected: true, inv: &inventory{}, pets: parsePets("")}
	e.char.Level, e.char.HP, e.char.Vital, e.char.Str = 30, 100, 20, 20
	for slot := data.EquipSlots; slot < data.ItemSlots; slot++ {
		e.inv[slot] = w.newItem(g.Items[1500])
	}
	var native *data.Enemy
	for _, enemy := range g.Battle.Enemies {
		if enemy.TempNo == 1 && enemy.PetFlag != 0 {
			native = enemy
			break
		}
	}
	if native == nil {
		b.Fatal("missing native pet fixture")
	}
	room := &battleRoom{b: battle.New(w.rnd), members: []*entity{e}}
	e.fight = &fight{room: room, b: room.b, slot: 0, pets: map[int]int{}, petCmds: map[int]*battle.Command{}}
	room.b.Add(w.playerFighter(e, 0))
	for i := 0; i < 5; i++ {
		f := enemyFighter(w, native, 10, i+5)
		f.HP, f.MaxHP, f.Pet = 1000, 1000, true
		f.Skills = [7]*data.Skill{{ID: 1, Func: "PETSKILL_NormalAttack", Target: 1}, {ID: 2, Func: "PETSKILL_NormalGuard", Target: 0}}
		room.b.Add(f)
		e.pets.Pets[i] = petFromFighter(f, e.char.ID)
		e.fight.pets[i+5] = i
	}
	for i := 10; i < 20; i++ {
		f := enemyFighter(w, native, 10, i)
		f.HP, f.MaxHP = 10000, 10000
		room.b.Add(f)
	}
	return w, e
}

func BenchmarkAutomationDecision(b *testing.B) {
	w, e := releaseBenchmarkEntity(b)
	a := &autoPlayState{settings: defaultAutoSettings()}
	a.settings.Escape = false
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		w.chooseAutomation(e, a)
	}
}

func BenchmarkBackgroundPresentation(b *testing.B) {
	w, e := releaseBenchmarkEntity(b)
	for _, connected := range []bool{true, false} {
		name := "Detached"
		if connected {
			name = "Attached"
		}
		b.Run(name, func(b *testing.B) {
			e.connected = connected
			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				w.sendStatus(e)
				w.sendInventory(e)
				w.sendPets(e)
				w.sendBattleStart(e, 0, 0)
			}
		})
	}
}
