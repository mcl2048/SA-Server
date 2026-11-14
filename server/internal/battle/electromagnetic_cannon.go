package battle

import "sa/server/internal/data"

// Five physical hits use current targets, never a cached first-shot slot. Each
// magic event presents one remote blast; its HP/guardian/barrier fields remain
// authoritative physical results. Flee is separate from lethal knockback.
func (b *Battle) electromagneticCannon(f *Fighter, c Command, ev *[]Event) {
	first := len(*ev)
	for shot := 0; shot < 5 && f.Alive() && f.canMove(); shot++ {
		targets := b.targetable(1 - f.Side())
		if len(targets) == 0 {
			break
		}
		target := b.F[targets[b.Rnd.IntN(len(targets))]]
		factor := float64(15+b.Rnd.IntN(4)) / 100
		e, _ := b.attackOnce(f, target, attackOpts{name: c.Skill.Name, dmgMod: factor, noCounter: true}, false)
		if e.Kind == None {
			continue // A capture-protected guardian canceled this shot.
		}
		actual := target
		if e.Guardian >= 0 {
			actual = b.F[e.Guardian]
		}
		leave := false
		if (e.Result == Normal || e.Result == Critical) && e.Damage > 0 && actual.Alive() {
			// Select exactly one effect class. An immune/occupied target does
			// not earn a second attempt at the other class.
			if b.Rnd.IntN(2) == 0 {
				if actual.Status() == StNone && actual.dizzy <= 0 && b.Rnd.IntN(100) < cannonParalysisChance(f.Level, actual.Level, actual.Resist[StParalysis]) {
					actual.status[StParalysis], actual.charge = 3, -1
					e.Status = actual.Status()
				}
			} else if b.cannonCanDisplace(actual) && b.Rnd.IntN(100) < cannonDisplacementChance(f.Level, actual.Level) {
				leave = true
			}
		}
		e.Kind, e.Effect, e.Shoot, e.ActorMP = Magic, data.ElectromagneticCannonEffect, 0, f.MP
		e.Att = "1|0|0|0|-35"
		if e.Result == Normal || e.Result == Critical {
			e.Result = MagicDamage
		}
		*ev = append(*ev, e) // Combo=false: five ordered single-target effects.
		if leave {
			b.flee(actual, ev)
		}
	}
	if len(*ev) == first {
		*ev = append(*ev, Event{Actor: f.Slot, Kind: None, Target: -1, Guardian: -1, Skill: c.Skill.Name, HP: f.HP, Status: f.Status(), ActorHP: f.HP, ActorMP: f.MP})
	}
}

func cannonParalysisChance(attacker, defender, resistance int) int {
	return max(20, min(50, 35+(attacker-defender)/2-max(0, resistance)))
}

func cannonDisplacementChance(attacker, defender int) int {
	return max(10, min(30, 20+(attacker-defender)/4))
}

// A capture flag is a conservative whitelist for ordinary wild opponents.
// NPC/WinFunc, no-escape floors and PvP retain their encounter protections.
func (b *Battle) cannonCanDisplace(t *Fighter) bool {
	return !b.PvP && !b.NoAbduct && !b.NoDisplacement && t.Alive() && !t.Player && !t.Pet && t.Seed != nil && t.Seed.Capture
}
