package battle

import "sa/server/internal/data"

// Ghost Storm uses the existing physical hit engine once per eligible opponent.
// Magic events describe its stationary, remote presentation; they do not cast a
// second spell or apply a second damage calculation. Result/guardian/HP fields
// retain the physical engine's reflection, absorption, dodge and mount outcomes.
func (b *Battle) ghostStorm(f *Fighter, c Command, ev *[]Event) {
	if !f.Alive() || !f.canMove() {
		return
	}
	first := len(*ev)
	for _, slot := range b.targetable(1 - f.Side()) {
		if !f.Alive() || !f.canMove() {
			break
		}
		target := b.F[slot]
		if !target.Alive() || target.hidden || b.autoAvoidTargets&(1<<slot) != 0 {
			continue
		}
		e, _ := b.attackOnce(f, target, attackOpts{name: c.Skill.Name, dmgMod: 0.75, noCounter: true}, false)
		if e.Kind == None {
			continue // A protected capture guardian may have canceled the hit.
		}
		actual := target
		if e.Guardian >= 0 {
			actual = b.F[e.Guardian]
		}
		// A vanished, absorbed or reflected hit cannot petrify its recipient.
		// Never replace another condition or attach one to a knocked-out slot.
		if (e.Result == Normal || e.Result == Critical) && e.Damage > 0 && actual.Alive() && actual.Status() == StNone && actual.dizzy <= 0 && b.Rnd.IntN(100) < ghostStormStoneChance(f.Level, actual.Level, actual.Resist[StStone]) {
			actual.status[StStone] = 3 // Three skipped actions, including its next one.
			actual.charge = -1
			e.Status = actual.Status()
		}
		e.Kind, e.Effect, e.Shoot, e.ActorMP = Magic, data.GhostStormEffect, 0, f.MP
		e.Att = "4|0|0|0|-45"
		if e.Result == Normal || e.Result == Critical {
			e.Result = MagicDamage
		}
		*ev = append(*ev, e)
	}
	if len(*ev) == first {
		*ev = append(*ev, Event{Actor: f.Slot, Kind: None, Target: -1, Guardian: -1, Skill: c.Skill.Name, HP: f.HP, Status: f.Status(), ActorHP: f.HP, ActorMP: f.MP})
	}
	b.combo(*ev, first)
}

// Equal levels and no resistance give 55%. Each two levels of advantage add
// one percentage point; resistance subtracts points. Both extremes remain
// inside the requested 35–80% range, including negative resistance data.
func ghostStormStoneChance(attackerLevel, defenderLevel, resistance int) int {
	return max(35, min(80, 55+(attackerLevel-defenderLevel)/2-max(0, resistance)))
}
