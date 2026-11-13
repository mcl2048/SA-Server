package world

import (
	"strings"
	"testing"
	"time"

	"sa/server/internal/battle"
	"sa/server/internal/proto"
)

func TestAutomationDetachedWinSettlesRewardExactlyOnce(t *testing.T) {
	w, db, g := setup(t)
	c, cl := petOwner(t, w, db, "auto-reward", 30, 100)
	id := int(c.ID)
	ene := petEnemy(t, g, 1)
	w.Do(func() {
		e := w.players[id]
		e.connected = false
		w.Rules.BattleGoldRate = 1
		enemy := enemyFighter(w, ene, 1, battle.EnemySlot(0))
		enemy.HP, enemy.MaxHP = 1, 1
		enemy.Atk, enemy.Def, enemy.Quick = 0, 0, 0
		enemy.Tactics = "gu:1"
		w.startBattleWith(e, []*battle.Fighter{enemy}, nil, func(string, []*entity) {})
		e.fight.b.F[e.fight.slot].Atk = 1_000_000
		e.automation = &autoPlayState{autoBattle: true, quick: true, settings: defaultAutoSettings()}
		now := w.now()
		for i := 0; i < 20; i++ {
			w.automationTick(now.Add(time.Duration(i) * time.Second))
		}
		if e.fight != nil {
			t.Fatal("detached automated battle did not finish")
		}
		if e.char.Gold != 1 {
			t.Fatalf("expected one level-1 enemy reward, got %d", e.char.Gold)
		}
	})
	ends := 0
	for _, m := range cl.take() {
		if r, ok := m.(*proto.BattleEnd); ok {
			ends++
			if r.Result != "win" || r.Gold != 1 {
				t.Fatalf("invalid detached reward %+v", r)
			}
		}
	}
	if ends != 1 {
		t.Fatalf("expected one completion despite repeated ticks, got %d", ends)
	}
}

func TestAutomationCommandsAllFiveOwnedPets(t *testing.T) {
	w, db, g := setup(t)
	c, cl := petOwner(t, w, db, "auto-five-pets", 40, 100)
	id := int(c.ID)
	ene := petEnemy(t, g, 1)
	for i := 0; i < 5; i++ {
		givePet(t, w, id, ene, 20)
	}
	w.Do(func() {
		e := w.players[id]
		e.pets.Battle = 0
		e.pets.Standby = 31
		for _, p := range e.pets.Pets {
			if p != nil {
				p.HP = 10000
			}
		}
		enemy := enemyFighter(w, ene, 1, battle.EnemySlot(0))
		enemy.HP, enemy.MaxHP = 1_000_000, 1_000_000
		enemy.Atk = 0
		enemy.Tactics = "gu:1"
		w.startBattleWith(e, []*battle.Fighter{enemy}, nil, func(string, []*entity) {})
		if len(e.fight.petSlots()) != 5 {
			t.Fatalf("five pet deployment missing: %v", e.fight.petSlots())
		}
		a := &autoPlayState{autoBattle: true, quick: true, settings: defaultAutoSettings()}
		a.settings.First = autoAction{Kind: "guard"}
		a.settings.PetFirst = autoAction{Kind: "guard"}
		e.automation = a
		now := w.now()
		w.automationTick(now)
		w.automationTick(now.Add(time.Second))
		if e.fight.room.turn != 1 {
			t.Fatalf("five pets did not all submit exactly once: turn %d", e.fight.room.turn)
		}
		for _, slot := range e.fight.petSlots() {
			if e.fight.petCommand(slot) != nil {
				t.Fatalf("left a pet command queued for next turn: slot %d", slot)
			}
		}
	})
	var turns int
	for _, m := range cl.take() {
		if _, ok := m.(*proto.BattleTurn); ok {
			turns++
		}
	}
	if turns != 1 {
		t.Fatalf("expected one five-pet turn, got %d", turns)
	}
}

func TestAutomationSettingsValidation(t *testing.T) {
	for _, raw := range []string{`{"v":2,"healAt":45,"first":{"kind":"magic","name":"滋润的精灵","target":"self"}}`, ""} {
		if _, ok := parseAutoSettings(raw); !ok {
			t.Fatalf("valid settings rejected: %q", raw)
		}
	}
	for _, raw := range []string{`{"v":3}`, `{"healAt":101}`, `{"healAt":-1}`, `{"healAt":NaN}`, `{"first":{"kind":"admin"}}`, `{"then":{"kind":"attack","target":"server"}}`, strings.Repeat(" ", 16385)} {
		if _, ok := parseAutoSettings(raw); ok {
			t.Fatalf("invalid settings accepted: %q", raw[:min(len(raw), 80)])
		}
	}
}
func TestAutomationDetachedBattlePacingAndStaleManualCommands(t *testing.T) {
	w, db, g := setup(t)
	c, cl := petOwner(t, w, db, "offline-auto", 50, 100)
	id := int(c.ID)
	ene := petEnemy(t, g, 1)
	w.Do(func() {
		e := w.players[id]
		e.connected = false
		enemy := enemyFighter(w, ene, 1, battle.EnemySlot(0))
		enemy.HP, enemy.MaxHP = 1_000_000, 1_000_000
		enemy.Atk = 0
		enemy.Tactics = "gu:1"
		w.startBattleWith(e, []*battle.Fighter{enemy}, nil, func(string, []*entity) {})
		e.automation = &autoPlayState{autoBattle: true, quick: true, settings: defaultAutoSettings()}
		now := w.now()
		w.automationTick(now)
		if e.fight.room.turn != 0 {
			t.Fatal("auto acted before pacing delay")
		}
		w.automationTick(now.Add(999 * time.Millisecond))
		if e.fight.room.turn != 0 {
			t.Fatal("quick interval shorter than one second")
		}
		w.automationTick(now.Add(time.Second))
		if e.fight.room.turn != 1 {
			t.Fatalf("detached auto did not advance: %d", e.fight.room.turn)
		}
		w.automationTick(now.Add(time.Second))
		if e.fight.room.turn != 1 {
			t.Fatal("same tick produced duplicate turn")
		}
	})
	w.BattleCommand(id, "escape", -1, -1)
	w.Do(func() {
		e := w.players[id]
		if e.fight == nil || e.fight.cmd != nil {
			t.Fatal("stale browser command overrode server-owned auto")
		}
	})
	var turns int
	for _, m := range cl.take() {
		if _, ok := m.(*proto.BattleTurn); ok {
			turns++
		}
	}
	if turns != 1 {
		t.Fatalf("expected exactly one server turn, got %d", turns)
	}
}
func TestAutomationExistingHumanCommandDoesNotLeakIntoNextTurn(t *testing.T) {
	w, db, g := setup(t)
	c, _ := petOwner(t, w, db, "auto-cmd-race", 40, 100)
	id := int(c.ID)
	ene := petEnemy(t, g, 1)
	givePet(t, w, id, ene, 30)
	w.Do(func() {
		e := w.players[id]
		e.pets.Battle = 0
		e.pets.Pets[0].HP = 10000
		enemy := enemyFighter(w, ene, 1, battle.EnemySlot(0))
		enemy.HP, enemy.MaxHP = 1_000_000, 1_000_000
		enemy.Atk = 0
		enemy.Tactics = "gu:1"
		w.startBattleWith(e, []*battle.Fighter{enemy}, nil, func(string, []*entity) {})
		ft := e.fight
		ft.cmd = &battle.Command{Kind: battle.Guard}
		a := &autoPlayState{autoBattle: true, quick: true, settings: defaultAutoSettings(), lastRoom: ft.room, lastTurn: ft.room.turn}
		e.automation = a
		w.automationTick(w.now())
		if e.fight != ft || ft.room.turn != 1 {
			t.Fatalf("expected pet submission to finish exactly one turn")
		}
		if ft.cmd != nil || ft.petCmd != nil {
			t.Fatal("automation leaked command into next turn after pet resolved old turn")
		}
	})
}
func TestAutomationEncounterPauseLeaseDetachAndLowHP(t *testing.T) {
	w, db, _ := setup(t)
	c, cl := petOwner(t, w, db, "auto-lease", 30, 100)
	id := int(c.ID)
	w.Do(func() {
		e := w.players[id]
		w.Rules.EncounterRate = 0
		e.connected = true
		now := w.now()
		e.automation = &autoPlayState{encounter: true, paused: true, lastUpdate: now, settings: defaultAutoSettings(), direction: -1, floor: e.floor}
		ox, oy := e.x, e.y
		w.automationTick(now.Add(time.Second))
		if e.x != ox || e.y != oy {
			t.Fatal("live panel pause lease ignored")
		}
		e.connected = false
		w.automationTick(now.Add(time.Second))
		if e.x == ox && e.y == oy {
			t.Fatal("detached character remained paused by stale UI flag")
		}
		e.connected = true
		ox, oy = e.x, e.y
		e.automation.nextMove = time.Time{}
		w.automationTick(now.Add(3 * time.Second))
		if e.x == ox && e.y == oy {
			t.Fatal("expired lease did not release frozen tab pause")
		}
		e.char.HP = 1
		e.automation.nextMove = time.Time{}
		w.automationTick(now.Add(4 * time.Second))
		if e.automation.encounter {
			t.Fatal("critically low HP kept seeking encounters")
		}
	})
	moves := 0
	for _, m := range cl.take() {
		if step, ok := m.(*proto.ObjMove); ok && step.ID == id {
			moves++
		}
	}
	if moves != 2 {
		t.Fatalf("server automated steps were not echoed to their own browser: %d", moves)
	}
}
func TestAutomationManualMovementStopsOnlyEncounterIntent(t *testing.T) {
	w, db, _ := setup(t)
	c, cl := petOwner(t, w, db, "auto-manual", 30, 100)
	id := int(c.ID)
	w.SetAutoPlay(id, true, true, true, false, "")
	w.Do(func() {
		e := w.players[id]
		w.manualAutomationMove(e)
		if e.automation.encounter || !e.automation.autoBattle || !e.automation.quick {
			t.Fatal("manual movement should stop encounter without disabling battle settings")
		}
	})
	messages := cl.take()
	state, ok := find[*proto.AutoPlayState](messages)
	if !ok || state.Encounter { // find returns the first state; inspect final explicitly.
		for _, m := range messages {
			if s, yes := m.(*proto.AutoPlayState); yes {
				state = s
				ok = true
			}
		}
	}
	if !ok || state.Encounter {
		t.Fatal("client did not receive stopped encounter state")
	}
	w.SetAutoPlay(id, true, true, true, false, `{"v":2,"healAt":999}`)
	w.Do(func() {
		if w.players[id].automation.encounter {
			t.Fatal("invalid settings changed accepted intent")
		}
	})
}
func TestAutomationDoesNotDrivePVP(t *testing.T) {
	w, db, g := setup(t)
	c, _ := petOwner(t, w, db, "auto-pvp", 30, 100)
	id := int(c.ID)
	ene := petEnemy(t, g, 1)
	w.Do(func() {
		e := w.players[id]
		enemy := enemyFighter(w, ene, 1, battle.EnemySlot(0))
		enemy.HP, enemy.MaxHP = 10000, 10000
		w.startBattleWith(e, []*battle.Fighter{enemy}, nil, func(string, []*entity) {})
		e.fight.room.pvp = true
		e.automation = &autoPlayState{autoBattle: true, quick: true, settings: defaultAutoSettings()}
		w.automationTick(w.now().Add(time.Hour))
		if e.fight.room.turn != 0 || e.fight.cmd != nil {
			t.Fatal("automation supplied a PVP command")
		}
	})
}
