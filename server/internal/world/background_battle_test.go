package world

import (
	"context"
	"reflect"
	"testing"
	"time"

	"sa/server/internal/battle"
	"sa/server/internal/proto"
)

// This transport models the interval after a socket closes but before Detach
// reaches the world queue. fakeClient itself deliberately has no Connected method.
type battleConnectionClient struct {
	fakeClient
	online bool
}

func (c *battleConnectionClient) Connected() bool { return c.online }

func TestBackgroundBattleTurnAudience(t *testing.T) {
	w := &World{}
	cl, observer := &fakeClient{}, &fakeClient{}
	m := &entity{client: cl, connected: false}
	watcher := &entity{client: observer, connected: false}
	room := &battleRoom{turn: 7, members: []*entity{m}, watchers: []*entity{watcher}}
	ev := []battle.Event{{Actor: 0, Kind: battle.Attack, Target: 10, Damage: 13, HP: 87}}
	w.sendBattleTurn(room, ev)
	if len(cl.take()) != 0 || len(observer.take()) != 0 {
		t.Fatal("unwatched background turn was projected")
	}
	watcher.connected = true
	w.sendBattleTurn(room, ev)
	got, ok := find[*proto.BattleTurn](observer.take())
	if !ok || got.Turn != 7 || len(got.Events) != 1 || got.Events[0].Damage != 13 {
		t.Fatalf("attached observer missed turn: %+v", got)
	}
	if len(cl.take()) != 0 {
		t.Fatal("background member received observer presentation")
	}
	m.connected = true
	w.sendBattleTurn(room, ev)
	memberTurn, ok := find[*proto.BattleTurn](cl.take())
	observerTurn, observed := find[*proto.BattleTurn](observer.take())
	if !ok || !observed || !reflect.DeepEqual(memberTurn, observerTurn) {
		t.Fatal("member and observer protocol differs")
	}
	// Multi-pet join metadata is part of the existing foreground protocol.
	m.fight = &fight{slot: 2, pets: map[int]int{7: 3}}
	w.sendBattleTurn(room, []battle.Event{{Kind: battle.PetOut, Target: 7, Name: "pet", Sprite: 100, Level: 30, MaxHP: 200}})
	petTurn, _ := find[*proto.BattleTurn](cl.take())
	if petTurn == nil || !reflect.DeepEqual(petTurn.Events, []proto.BattleEvent{{Kind: string(battle.PetOut), Target: 7, Name: "pet", Sprite: 100, Level: 30, MaxHp: 200, OwnerSlot: 2, BagSlot: 3}}) {
		t.Fatalf("pet ownership presentation changed: %+v", petTurn)
	}
	observer.take()
	closed := &battleConnectionClient{}
	m.client = closed
	watcher.connected = false
	w.sendBattleTurn(room, ev)
	if len(closed.take()) != 0 {
		t.Fatal("closed transport counted as an attached recipient")
	}
	m.client = nil
	w.sendBattleTurn(room, ev) // A nil transport is never a recipient.
}

func TestBackgroundBattleProgressRewardAndReconnect(t *testing.T) {
	w, db, g := setup(t)
	c, cl := petOwner(t, w, db, "background-turn", 30, 100)
	id := int(c.ID)
	ene := petEnemy(t, g, 30)
	var room *battleRoom
	w.Do(func() {
		e := w.players[id]
		enemy := enemyFighter(w, ene, 30, battle.EnemySlot(0))
		enemy.HP, enemy.MaxHP, enemy.Atk = 1_000_000, 1_000_000, 0
		enemy.Tactics = "gu:1"
		w.startBattleWith(e, []*battle.Fighter{enemy}, nil, func(string, []*entity) {})
		room = e.fight.room
	})
	cl.take()
	w.Detach(id, cl)
	w.Do(func() {
		e := w.players[id]
		e.fight.cmd = &battle.Command{Kind: battle.Guard}
		w.resolveTurn(room)
		if room.turn != 1 || e.fight == nil || room.timer == nil || !room.deadline.After(w.now()) {
			t.Fatal("background turn failed to advance/rearm timer")
		}
	})
	if _, ok := find[*proto.BattleTurn](cl.take()); ok {
		t.Fatal("background turn allocated presentation")
	}
	observer := &fakeClient{}
	w.Do(func() {
		// Actual observer entry sends a fresh roster after the skipped turn.
		o := &entity{client: observer, connected: true}
		w.startWatch(o, room)
		w.players[id].fight.cmd = &battle.Command{Kind: battle.Guard}
		w.resolveTurn(room)
	})
	msgs := observer.take()
	if start, ok := find[*proto.BattleStart](msgs); !ok || !start.Watch {
		t.Fatal("new observer missed fresh roster")
	}
	if turn, ok := find[*proto.BattleTurn](msgs); !ok || turn.Turn != 2 {
		t.Fatal("new observer missed next live turn")
	}
	replacement := &fakeClient{}
	if !w.Attach(id, cl, replacement) {
		t.Fatal("background member did not reattach")
	}
	if start, ok := find[*proto.BattleStart](replacement.take()); !ok || len(start.Fighters) < 2 {
		t.Fatal("reattach missed complete live roster")
	}
	w.Detach(id, replacement)
	var expBefore, goldBefore int
	w.Do(func() {
		// Remove observation, then finish the same real battle without any audience.
		w.stopWatch(room.watchers[0], false)
		e := w.players[id]
		expBefore, goldBefore = e.char.Exp, e.char.Gold
		enemy := room.b.F[battle.EnemySlot(0)]
		enemy.HP, enemy.MaxHP, enemy.Def, enemy.Quick = 1, 1, 0, 0
		player := room.b.F[e.fight.slot]
		player.Atk = 1_000_000
		e.fight.cmd = &battle.Command{Kind: battle.Attack, Target: enemy.Slot}
		w.resolveTurn(room)
		if e.fight != nil {
			t.Fatal("background battle failed to finish")
		}
		if e.char.Gold <= goldBefore || e.char.Exp <= expBefore {
			t.Fatalf("background reward missing: gold %d -> %d, exp %d -> %d", goldBefore, e.char.Gold, expBefore, e.char.Exp)
		}
	})
	if _, ok := find[*proto.BattleTurn](replacement.take()); ok {
		t.Fatal("background final turn was projected")
	}
	if !w.Flush(5 * time.Second) {
		t.Fatal("reward persistence flush failed")
	}
	saved, err := db.GetCharacter(context.Background(), c.AccountID, c.ID)
	if err != nil || saved.Gold <= goldBefore || saved.Exp <= expBefore {
		t.Fatalf("background rewards were not persisted: %+v, %v", saved, err)
	}
}

// Count without retaining messages or allocating a growing test message queue.
type battleTurnCounter struct{ count int }

func (c *battleTurnCounter) Send(proto.Message) { c.count++ }
func (*battleTurnCounter) Kick(string)          {}
func BenchmarkBattleTurnAudience(b *testing.B) {
	events := make([]battle.Event, 64)
	for i := range events {
		events[i] = battle.Event{Actor: i % 5, Kind: battle.Attack, Target: 10 + i%5, Damage: 100, HP: 500}
	}
	for _, attached := range []bool{true, false} {
		name := "Detached"
		if attached {
			name = "Attached"
		}
		b.Run(name, func(b *testing.B) {
			cl := &battleTurnCounter{}
			room := &battleRoom{turn: 1, members: []*entity{{client: cl, connected: attached}}}
			w := &World{}
			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				w.sendBattleTurn(room, events)
			}
		})
	}
}
