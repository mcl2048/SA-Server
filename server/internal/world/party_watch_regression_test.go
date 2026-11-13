package world

import (
	"testing"

	"sa/server/internal/battle"
)

func TestPartyFollowerWatchingDoesNotEnterAnotherBattleOrMove(t *testing.T) {
	w, db, g := setup(t)
	ca, _ := petOwner(t, w, db, "watch-party-leader", 30, 100)
	cb, _ := petOwner(t, w, db, "watch-party-follower", 30, 100)
	cc, _ := petOwner(t, w, db, "watch-other-fighter", 30, 100)
	a, b, c := int(ca.ID), int(cb.ID), int(cc.ID)
	w.Do(func() {
		leader, follower, target := w.players[a], w.players[b], w.players[c]
		follower.x, follower.y = leader.x+1, leader.y
		w.joinPartyMain(follower, leader)
		en := enemyFighter(w, petEnemy(t, g, 1), 1, battle.EnemySlot(0))
		en.HP, en.MaxHP = 100000, 100000
		w.startBattleWith(target, []*battle.Fighter{en}, nil, func(string, []*entity) {})
		w.watchEntry(leader, target)
		if leader.watch == nil || follower.watch != target.fight.room {
			t.Fatal("party did not begin watching together")
		}
	})
	// Each character may leave watch independently. A follower still watching
	// must remain tied to that room while the leader resumes field play.
	w.BattleCommand(a, "leave", -1, -1)
	w.Do(func() {
		leader, follower, target := w.players[a], w.players[b], w.players[c]
		oldX, oldY := follower.x, follower.y
		w.partyFollow(leader, leader.x, leader.y)
		if follower.x != oldX || follower.y != oldY {
			t.Errorf("watching follower was moved from %d,%d to %d,%d", oldX, oldY, follower.x, follower.y)
		}
		en := enemyFighter(w, petEnemy(t, g, 1), 1, battle.EnemySlot(0))
		en.HP, en.MaxHP = 100000, 100000
		w.startBattleWith(leader, []*battle.Fighter{en}, nil, func(string, []*entity) {})
		if follower.fight != nil || follower.watch != target.fight.room || len(leader.fight.room.members) != 1 {
			t.Fatalf("watch/fight overlap: follower fight=%v watch=%v new members=%d", follower.fight != nil, follower.watch != nil, len(leader.fight.room.members))
		}
	})
}
