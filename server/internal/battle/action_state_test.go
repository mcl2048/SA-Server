package battle

import (
	"strconv"
	"testing"

	"sa/server/internal/data"
)

// Resolve must recheck the defender's action state before an immediate counter:
// its queued command was prepared before the incoming hit and status changes.
func TestCounterRequiresCurrentActionAbility(t *testing.T) {
	for _, tc := range []struct {
		name        string
		status      int
		dizzy       int
		miss        bool
		wantCounter bool
	}{
		{name: "active", wantCounter: true},
		{name: "paralysis", status: StParalysis},
		{name: "stone", status: StStone},
		{name: "barrier", status: StBarrier},
		{name: "dizzy", dizzy: 3},
		{name: "sleep-woken-by-damage", status: StSleep, wantCounter: true},
		{name: "sleep-without-damage", status: StSleep, miss: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			b := New(rnd(7))
			attacker, defender := player(0), enemy(10, "wa:1")
			attacker.HP, attacker.MaxHP, attacker.Atk, attacker.Quick = 100000, 100000, 100, 10
			defender.HP, defender.MaxHP, defender.Atk, defender.Quick = 100000, 100000, 100, 1
			defender.Skills[0] = &data.Skill{ID: 3, Func: "PETSKILL_NoGuard", Field: 1, Option: "反击%+1000", Target: 0}
			if tc.status != StNone {
				defender.status[tc.status] = 3
			}
			defender.dizzy = tc.dizzy
			b.Add(attacker)
			b.Add(defender)
			command := Command{Kind: Attack, Target: 10, Automatic: true}
			if tc.miss {
				defender.HP = 1
				command.Skill = &data.Skill{Func: "PETSKILL_ShowMercy"}
			}
			events := b.Resolve(map[int]Command{0: command})
			hit, countered := false, false
			for _, e := range events {
				if e.Kind == Attack && e.Actor == 0 && e.Target == 10 {
					hit = true
					if e.Result == Critical || (e.Damage == 0) != tc.miss {
						t.Fatalf("fixture must preserve the counter opportunity: %+v", e)
					}
				}
				countered = countered || e.Kind == Counter && e.Actor == 10
			}
			if !hit || !defender.Alive() || countered != tc.wantCounter {
				t.Fatalf("counter violated current action state: hit=%v alive=%v counter=%v want=%v events=%+v", hit, defender.Alive(), countered, tc.wantCounter, events)
			}
		})
	}
}

// The final disabled turn still consumes the action, but its events must leave
// clients with the current cured state rather than reinstating an expired icon.
func TestExpiredDisableStatusDoesNotReturnInEvents(t *testing.T) {
	for _, status := range []int{StParalysis, StStone, StSleep, StBarrier} {
		t.Run(strconv.Itoa(status), func(t *testing.T) {
			b := New(rnd(4))
			p := player(0)
			p.status[status], p.Quick = 1, 1000
			b.Add(p)
			b.Add(enemy(10, "gu:1"))
			events := b.Resolve(map[int]Command{0: {Kind: Attack, Target: 10, Automatic: true}})
			var own []Event
			for _, e := range events {
				if e.Actor == 0 {
					own = append(own, e)
				}
			}
			if len(own) != 2 || own[0].Kind != Cure || own[1].Kind != Stun {
				t.Fatalf("last disabled turn must expire status and skip its command: %+v", events)
			}
			if p.Status() != StNone || own[1].Status != StNone {
				t.Fatalf("expired status reinstated by last event: current=%d events=%+v", p.Status(), own)
			}
		})
	}
}
