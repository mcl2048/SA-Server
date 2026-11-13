package world

import "sa/server/internal/battle"

// automationCapturePlan reserves legal captures before submission, in room
// member order. It is recomputed from live state so quick/auto pacing and the
// world's map iteration cannot make teammates attack or duplicate a target.
// Existing manual captures are preserved and reserve their explicit target.
func (w *World) automationCapturePlan(e *entity, own *autoPlayState) (uint32, int) {
	ft := e.fight
	if ft == nil || ft.room == nil || ft.room.pvp {
		return 0, -1
	}
	protected, mine := uint32(0), -1
	valid := func(m *entity, target *battle.Fighter) bool {
		actor := ft.b.F[m.fight.slot]
		return actor.Alive() && target.Alive() && target.Side() != actor.Side() && target.Seed != nil && target.Seed.Capture && actor.Level+5 >= target.Level && w.canCapture(m, target)
	}
	// Already queued commands take precedence over proposed automatic plans.
	for _, m := range ft.room.members {
		if m == nil || m.fight == nil || m.fight.room != ft.room || m.fight.slot/battle.SideOffset != ft.slot/battle.SideOffset {
			continue
		}
		c := m.fight.cmd
		if c == nil || c.Kind != battle.Capture {
			continue
		}
		if c.Target >= 0 && c.Target < battle.Slots && valid(m, ft.b.F[c.Target]) {
			protected |= 1 << c.Target
			if m == e {
				mine = c.Target
			}
		}
	}
	for _, m := range ft.room.members {
		if m == nil || m.fight == nil || m.fight.room != ft.room || m.fight.cmd != nil || m.fight.slot/battle.SideOffset != ft.slot/battle.SideOffset {
			continue
		}
		a := m.automation
		active := a != nil && (a.autoBattle || a.quick)
		if m == e {
			a, active = own, true
		} // this call itself is a strategy decision
		if !active || a == nil || !a.settings.Capture {
			continue
		}
		for _, f := range ft.b.F {
			if f != nil && f.Level == 1 && protected&(1<<f.Slot) == 0 && valid(m, f) {
				protected |= 1 << f.Slot
				if m == e {
					mine = f.Slot
				}
				break
			}
		}
	}
	return protected, mine
}

func automationCaptureInScope(mask uint32, target int) bool {
	if mask == 0 {
		return false
	}
	switch {
	case target >= 0 && target < battle.Slots:
		return mask&(1<<target) != 0
	case target == 20 || target == 21:
		return mask&(uint32(0x3ff)<<((target-20)*battle.SideOffset)) != 0
	case target == 22:
		return true
	case target >= 23 && target <= 26:
		start := [4]int{10, 15, 5, 0}[target-23]
		return mask&(uint32(0x1f)<<start) != 0
	}
	return true // unknown/random retargeting cannot safely promise an exclusion
}
