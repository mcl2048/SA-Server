package world

import "sa/server/internal/proto"

// Detach only removes browser control, not the character, its party or PvE
// battle. Identity fencing prevents an obsolete socket detaching a replacement.
func (w *World) Detach(charID int, cl Client, retained ...Client) {
	w.Do(func() {
		e := w.players[charID]
		if e == nil || e.client != cl || !e.connected {
			return
		}
		e.connected = false
		e.visible = nil
		// A lobby socket may immediately control a different actor. Swap its
		// world endpoint atomically so background events cannot reach that UI.
		if len(retained) > 0 && retained[0] != nil {
			e.client = retained[0]
		}
		w.cancelTrade(e)
		w.vendorClear(e)
		e.window = nil
		w.stopWatch(e, false)
		// Keep the established competitive disconnect/DP penalty. Retaining an
		// avatar must not make closing the browser an escape from a PvP loss.
		if e.fight != nil && e.fight.room.pvp {
			w.abandonBattle(e)
			e.fs &^= fsDuel
			w.broadcastMark(e)
			w.sendStatus(e)
		}
	})
}

// Attach transfers control of a live entity without reloading a stale database
// copy or rerunning login rewards, pet-mail returns, party joins or equipment
// attach effects. old is the exact previously installed transport.
func (w *World) Attach(charID int, old, replacement Client) (ok bool) {
	w.Do(func() {
		e := w.players[charID]
		if e == nil || e.client != old || replacement == nil {
			return
		}
		// A replacement may arrive before the old read loop notices its close.
		// Clear transient UI transactions here too, or a fresh browser could
		// inherit an invisible trade/window while the stale Detach is fenced.
		w.cancelTrade(e)
		w.vendorClear(e)
		e.window = nil
		w.stopWatch(e, false)
		e.client, e.connected = replacement, true
		w.snapshot(e)
		ok = true
	})
	return
}

// snapshot is a view refresh only. In particular placeOnFloor would cancel
// stay/transactions, warp followers and potentially remove this player from a
// party, so it must never serve as a reconnect helper.
func (w *World) snapshot(e *entity) {
	cl := e.client
	cl.Send(&proto.Self{ID: e.id, Name: e.name, Sprite: e.sprite})
	cl.Send(&proto.Flags{Flags: e.fs})
	cl.Send(w.statusOf(e))
	w.sendInventory(e)
	w.sendPets(e)
	w.sendQuests(e)
	w.sendAddressBook(e)
	func() { defer w.famLock()(); w.famSync(e) }()
	f := w.game.Floors[e.floor]
	if f != nil {
		cl.Send(&proto.EnterFloor{Floor: e.floor, Name: f.Name, Palette: f.Palette, Width: f.W, Height: f.H,
			X: e.x, Y: e.y, Dir: e.dir, Step: w.clientStepMs(), MapVer: w.floorVer(e.floor)})
	}
	e.visible = map[int]bool{}
	w.refreshView(e)
	cl.Send(e.mark())
	if e.party != nil {
		for slot := range e.party.slots {
			cl.Send(w.partyMember(e.party, slot))
		}
	}
	if e.gm {
		cl.Send(&proto.GmMenu{Items: w.gmMenuItems()})
	}
	// Restore browser automation settings before rebuilding a battle screen.
	w.sendAutoPlay(e)
	if e.fight != nil {
		w.sendResumedBattleStart(e)
		cl.Send(&proto.HelpFlag{On: e.fight.room.help})
	}
	w.deliverStoredMails(e)
}

// attached distinguishes a retained world actor from an interactive browser.
// The optional transport check closes the interval before its Detach command
// reaches the world goroutine.
func (e *entity) attached() bool {
	if !e.connected || e.client == nil {
		return false
	}
	if transport, ok := e.client.(interface{ Connected() bool }); ok {
		return transport.Connected()
	}
	return true
}

// CharacterSummary reads the actor on the world goroutine instead of a stale DB image.
func (w *World) CharacterSummary(charID int) (summary proto.CharSummary, ok bool) {
	w.Do(func() {
		e := w.players[charID]
		if e == nil {
			return
		}
		st := w.statusOf(e)
		summary = proto.CharSummary{Level: st.Level, HP: st.HP, Atk: st.Atk, Def: st.Def, Agi: st.Agi, DP: st.DP}
		ok = true
	})
	return
}
