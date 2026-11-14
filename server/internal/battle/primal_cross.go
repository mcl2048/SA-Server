package battle

import "sa/server/internal/data"

// PrimalCrossSlots describes the native 2x5 grid in stable playback order:
// selected slot, left, right, paired front/back. Row edges never wrap.
// Callers still validate current life, side, hidden and capture protection.
func PrimalCrossSlots(slot int) []int {
	if slot < 0 || slot >= Slots {
		return nil
	}
	out := []int{slot}
	if slot%5 > 0 {
		out = append(out, slot-1)
	}
	if slot%5 < 4 {
		out = append(out, slot+1)
	}
	if slot%SideOffset < 5 {
		out = append(out, slot+5)
	} else {
		out = append(out, slot-5)
	}
	return out
}

func (b *Battle) primalCross(f *Fighter, c Command, ev *[]Event) {
	none := func() {
		*ev = append(*ev, Event{Actor: f.Slot, Kind: None, Target: -1, Guardian: -1, Skill: c.Skill.Name, HP: f.HP, Status: f.Status(), ActorHP: f.HP, ActorMP: f.MP})
	}
	if !f.Alive() || !f.canMove() || f.Player {
		none()
		return
	}
	t := b.pickTarget(f, c.Target)
	if t == nil || t.Side() == f.Side() {
		none()
		return
	}
	// This happens at execution, after status/loyalty checks, exactly once per
	// cast. Native defense and endurance are the same working stat, not two
	// independent multipliers. Replacing our own contribution avoids stacking.
	f.Def -= f.primalDefApplied
	f.primalDefPercent, f.primalDefTurns = b.Rnd.IntN(31)+30, 5
	f.applyPrimalDefense()
	*ev = append(*ev, Event{Actor: f.Slot, Kind: StatChange, Target: f.Slot, Guardian: -1, Skill: c.Skill.Name, HP: f.HP, Status: f.Status(), Stat: 39, StatVal: f.primalDefPercent, StatTurns: 5})
	first := len(*ev)
	var totalLoss int64
	for _, slot := range PrimalCrossSlots(t.Slot) {
		if !f.Alive() || !f.canMove() {
			break
		}
		d := b.F[slot]
		if !d.Alive() || d.hidden || d.Side() == f.Side() || b.autoAvoidTargets&(1<<slot) != 0 {
			continue
		}
		// Snapshot bounded formation HP before the physical engine selects its
		// actual guardian recipient. Never estimate real loss from Event.Damage:
		// overkill, mounts and one-hit flight can all differ from that number.
		var beforeHP, beforeRide [Slots]int
		for i, x := range b.F {
			if x != nil {
				beforeHP[i], beforeRide[i] = max(0, x.HP), max(0, x.rideHP())
			}
		}
		e, _ := b.attackOnce(f, d, attackOpts{name: c.Skill.Name, noCounter: true, primalCross: true}, false)
		if e.Kind == None {
			continue
		}
		if e.Result == Normal || e.Result == Critical {
			recipient := e.Target
			if e.Guardian >= 0 {
				recipient = e.Guardian
			}
			if x := b.F[recipient]; x != nil {
				totalLoss += int64(max(0, beforeHP[recipient]-max(0, x.HP))) + int64(max(0, beforeRide[recipient]-max(0, x.rideHP())))
			}
		}
		e.Effect, e.Shoot, e.ActorMP = data.PrimalCrossEffect, 0, f.MP
		*ev = append(*ev, e)
	}
	b.combo(*ev, first)
	if f.Alive() && totalLoss > 0 {
		// One floor after summing all actual HP loss; dead casters cannot be
		// resurrected by damage dealt before a later reflected strike.
		recovery := totalLoss/1000*18 + totalLoss%1000*18/1000
		healed := int(min(recovery, int64(max(0, f.MaxHP-f.HP))))
		if healed > 0 {
			f.HP += healed
			*ev = append(*ev, Event{Actor: f.Slot, Kind: Heal, Target: f.Slot, Guardian: -1, Skill: c.Skill.Name, Effect: data.PrimalCrossEffect, Damage: healed, HP: f.HP, ActorHP: f.HP, ActorMP: f.MP, Status: f.Status()})
		}
	}
}

// DefenseBoost/DefenseTurns expose authoritative snapshots without allowing
// the world or client to mutate or invent the buff's remaining lifetime.
func (f *Fighter) DefenseBoost() int {
	if !f.Alive() {
		return 0
	}
	return f.primalDefPercent
}
func (f *Fighter) DefenseTurns() int {
	if !f.Alive() {
		return 0
	}
	return f.primalDefTurns
}

func (f *Fighter) applyPrimalDefense() {
	f.primalDefApplied = 0
	if f.primalDefTurns > 0 {
		f.primalDefApplied = f.Def * f.primalDefPercent / 100
		f.Def += f.primalDefApplied
	}
}

func (b *Battle) tickPrimalDefense(ev *[]Event) {
	for _, f := range b.F {
		if f == nil || f.primalDefTurns <= 0 {
			continue
		}
		f.primalDefTurns--
		if !f.Alive() {
			f.primalDefTurns = 0
		}
		percent := f.primalDefPercent
		if f.primalDefTurns == 0 {
			f.Def -= f.primalDefApplied
			f.primalDefApplied, f.primalDefPercent = 0, 0
			percent = -percent
		}
		*ev = append(*ev, Event{Actor: f.Slot, Kind: StatChange, Target: f.Slot, Guardian: -1, Skill: "赤爪裂阵", HP: f.HP, Status: f.Status(), Stat: 39, StatVal: percent, StatTurns: f.primalDefTurns})
	}
}

func primalPoisonChance(attacker, defender, resist int) int {
	return max(28, min(43, 35+(attacker-defender)/2-max(0, resist)))
}
