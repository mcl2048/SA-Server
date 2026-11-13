package world

import (
	"context"
	"testing"
	"time"

	"sa/server/internal/data"
	"sa/server/internal/proto"
)

func TestPresenceRetainsPartyAndSnapshotsWithoutLoginSideEffects(t *testing.T) {
	w, db, _ := setup(t)
	home := data.Hometowns[0]
	ca := newChar(t, db, "presentA", home.Floor, home.X, home.Y)
	cb := newChar(t, db, "presentB", home.Floor, home.X, home.Y)
	a, b := &fakeClient{}, &fakeClient{}
	w.Enter(ca, a)
	w.Enter(cb, b)
	a.take()
	b.take()
	var original *entity
	var group *party
	w.Do(func() {
		original = w.players[int(ca.ID)]
		original.char.Gold = 12345
		w.joinPartyMain(w.players[int(cb.ID)], original)
		group = original.party
	})
	w.Detach(int(ca.ID), a)
	w.Do(func() {
		e := w.players[int(ca.ID)]
		if e != original || e.connected || e.party != group || group.slots[1] != w.players[int(cb.ID)] {
			t.Fatal("detach changed world/party identity")
		}
	})
	fresh := &fakeClient{}
	if !w.Attach(int(ca.ID), a, fresh) {
		t.Fatal("live attach failed")
	}
	w.Detach(int(ca.ID), a)
	w.Leave(int(ca.ID), a)
	w.Do(func() {
		e := w.players[int(ca.ID)]
		if e != original || !e.connected || e.client != fresh || e.char.Gold != 12345 || e.party != group {
			t.Fatal("stale transport damaged replacement")
		}
	})
	messages := fresh.take()
	if _, ok := find[*proto.Self](messages); !ok {
		t.Fatal("missing Self")
	}
	if _, ok := find[*proto.EnterFloor](messages); !ok {
		t.Fatal("missing EnterFloor")
	}
	if _, ok := find[*proto.PartyMember](messages); !ok {
		t.Fatal("missing party snapshot")
	}
	inv, ok := find[*proto.Inventory](messages)
	if !ok || inv.Gold != 12345 {
		t.Fatal("wallet not refreshed", inv)
	}
	w.Leave(int(ca.ID), fresh)
	if w.Online() != 1 {
		t.Fatal("explicit leave did not remove character")
	}
}

func TestPresenceDetachKeepsPveRoomAndSubmittedTurn(t *testing.T) {
	w, db, g := setup(t)
	home := data.Hometowns[0]
	c := newChar(t, db, "pveresume", home.Floor, home.X, home.Y)
	old := &fakeClient{}
	w.Enter(c, old)
	w.SetAutoPlay(int(c.ID), false, true, true, false, "")
	area := g.Battle.AreaAt(100, 650, 450)
	if area == nil {
		t.Fatal("missing encounter fixture")
	}
	var room *battleRoom
	w.Do(func() {
		e := w.players[int(c.ID)]
		w.startBattle(e, area)
		if e.fight == nil {
			t.Fatal("failed to start fixture")
		}
		room = e.fight.room
	})
	w.Detach(int(c.ID), old)
	w.Do(func() {
		e := w.players[int(c.ID)]
		if e == nil || e.fight == nil || e.fight.room != room || len(room.members) != 1 {
			t.Fatal("disconnect abandoned PvE room")
		}
	})
	fresh := &fakeClient{}
	if !w.Attach(int(c.ID), old, fresh) {
		t.Fatal("failed attach")
	}
	messages := fresh.take()
	floorAt, autoAt, battleAt := -1, -1, -1
	for i, message := range messages {
		switch m := message.(type) {
		case *proto.EnterFloor:
			floorAt = i
		case *proto.AutoPlayState:
			autoAt = i
			if !m.Quick || !m.AutoBattle {
				t.Fatal("resume lost automation intent")
			}
		case *proto.BattleStart:
			battleAt = i
		}
	}
	if floorAt < 0 || autoAt <= floorAt || battleAt <= autoAt {
		t.Fatalf("resume must deliver floor then automation before battle: %d %d %d", floorAt, autoAt, battleAt)
	}
	snapshot, ok := find[*proto.BattleStart](messages)
	if !ok || !snapshot.Resume {
		t.Fatal("missing resumed battle", snapshot)
	}
	w.Do(func() {
		if w.players[int(c.ID)].fight.room != room || len(room.members) != 1 {
			t.Fatal("resume created a second battle")
		}
	})
}

func TestPresenceCancelsTradeAndRejectsOfflineTradeAndDuel(t *testing.T) {
	w, db, _ := setup(t)
	h := data.Hometowns[0]
	ca := newChar(t, db, "tradeoffA", h.Floor, h.X, h.Y)
	cb := newChar(t, db, "tradeoffB", h.Floor, h.X, h.Y)
	a, b := &fakeClient{}, &fakeClient{}
	w.Enter(ca, a)
	w.Enter(cb, b)
	w.Do(func() {
		e, o := w.players[int(ca.ID)], w.players[int(cb.ID)]
		o.x, o.y = e.x+MOVE[e.dir][0], e.y+MOVE[e.dir][1]
		o.fs |= fsTrade | fsDuel
		w.tradeRequest(e)
		if e.trade == nil {
			t.Fatal("fixture trade not opened")
		}
	})
	replacement := &fakeClient{}
	if !w.Attach(int(cb.ID), b, replacement) {
		t.Fatal("takeover failed")
	}
	w.Detach(int(cb.ID), b) // late close from the replaced socket is harmless
	w.Do(func() {
		e, o := w.players[int(ca.ID)], w.players[int(cb.ID)]
		if !o.connected || e.trade != nil || o.trade != nil {
			t.Fatal("takeover retained invisible trade or stale detach won")
		}
		w.tradeRequest(e)
		if e.trade == nil {
			t.Fatal("replacement could not start a new trade")
		}
	})
	w.Detach(int(cb.ID), replacement)
	w.Do(func() {
		e, o := w.players[int(ca.ID)], w.players[int(cb.ID)]
		if e.trade != nil || o.trade != nil {
			t.Fatal("detach left active trade")
		}
		w.tradeRequest(e)
		if e.trade != nil {
			t.Fatal("offline accepted trade")
		}
		if w.startDuel(e, o) {
			t.Fatal("offline accepted duel")
		}
	})
}

func TestOfflineOrdinaryMailPersistsUntilReattach(t *testing.T) {
	w, db, _ := setup(t)
	h := data.Hometowns[0]
	ca := newChar(t, db, "mailoffA", h.Floor, h.X, h.Y)
	cb := newChar(t, db, "mailoffB", h.Floor, h.X, h.Y)
	a, b := &fakeClient{}, &fakeClient{}
	w.Enter(ca, a)
	w.Enter(cb, b)
	w.Do(func() {
		e, o := w.players[int(ca.ID)], w.players[int(cb.ID)]
		e.book[0] = cardOf(o)
		o.book[0] = cardOf(e)
	})
	w.Detach(int(cb.ID), b)
	b.take()
	w.MailSend(int(ca.ID), 0, "关闭浏览器后仍保存的信")
	if !w.Flush(3 * time.Second) {
		t.Fatal("mail not persisted")
	}
	fresh := &fakeClient{}
	if !w.Attach(int(cb.ID), b, fresh) {
		t.Fatal("attach failed")
	}
	deadline := time.Now().Add(3 * time.Second)
	found := false
	for !found && time.Now().Before(deadline) {
		for _, message := range fresh.take() {
			if mail, ok := message.(*proto.MailRecv); ok && mail.Text == "关闭浏览器后仍保存的信" {
				found = true
			}
		}
		if !found {
			time.Sleep(time.Millisecond)
		}
	}
	if !found {
		t.Fatal("offline mail not delivered on resume")
	}
	if !w.Flush(3 * time.Second) {
		t.Fatal("mail queue not drained")
	}
	remaining, err := db.TakeMails(context.Background(), cb.ID)
	if err != nil || len(remaining) != 0 {
		t.Fatal("delivered mail duplicated", remaining, err)
	}
}
