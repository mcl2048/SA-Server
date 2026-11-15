package battle

// The original ComboCheck groups adjacent initiative entries. Similar speed
// makes allies adjacent; there is no historical fixed speed-difference cutoff.
// See Report/SA-1115-01/server/RESEARCH.md for source/provenance and limits.
type battleOrder struct {
	slot, dex int
	f         *Fighter // A pet swapped into this slot cannot inherit its predecessor's turn.
}

type coattackActor struct {
	f       *Fighter
	command Command
	avoid   uint32
}

func (b *Battle) coattackEligible(f *Fighter, c Command, avoid uint32) bool {
	return f.Alive() && f.canMove() && f.status[StConfusion] == 0 &&
		!f.hidden && f.charge < 0 && !f.throwing() && c.Kind == Attack && c.Skill == nil &&
		c.Target >= 0 && c.Target < Slots && b.F[c.Target].Alive() &&
		!b.F[c.Target].hidden && b.F[c.Target].Side() != f.Side() && avoid&(1<<c.Target) == 0
}

func (b *Battle) coattackGroups(order []battleOrder, commands map[int]Command, avoid [Slots]uint32) [Slots]int {
	var groups [Slots]int
	start, group := -1, 0
	for i, entry := range order {
		f, c := entry.f, commands[entry.slot]
		eligible := b.coattackEligible(f, c, avoid[entry.slot])
		if start >= 0 && eligible && f.Side() == order[start].f.Side() && c.Target == commands[order[start].slot].Target {
			groups[order[start].slot], groups[entry.slot] = group, group
			continue
		}
		start = -1
		if eligible {
			chance := 50
			if f.Enemy() {
				chance = 20
			}
			if b.randi(1, 100) <= chance {
				start, group = i, group+1
			}
		}
	}
	return groups
}

// Status and loyalty always run exactly once, including every member brought
// forward by a group. Checks can revoke participation but cannot grant an
// additional action or bypass capture-target protection.
func (b *Battle) prepareAction(o battleOrder, c Command, ev *[]Event) (Command, bool) {
	f := b.F[o.slot]
	if f != o.f || !f.Alive() {
		return c, false
	}
	c, ok := b.statusSeq(f, c, ev)
	if !ok || !f.Alive() {
		return c, false
	}
	if f.Pet && !(b.Turn == 1 && b.Surprised == 1-f.Side()) {
		if c, ok = b.loyalCheck(f, c, ev); !ok {
			return c, false
		}
	}
	if c.Kind == Capture {
		b.autoAvoidTargets = 0
	}
	return c, true
}

// Native BATTLE_Combo adds 100% of each physical contribution, without dodge,
// guardian interception or counterattacks. Hold damage until the whole group
// finishes so an early lethal contribution cannot retarget later members.
// Barriers still consume native charges and reflection still damages its actor.
func (b *Battle) coattackSeq(members []coattackActor, group int, ev *[]Event) {
	d := b.F[members[0].command.Target]
	first := len(*ev)
	damage, petDamage := 0, 0
	lastAttacker := members[0].f
	for _, member := range members {
		a := member.f
		if !a.Alive() {
			continue
		}
		b.autoAvoidTargets = member.avoid
		hp, flown, ultimate, killedBy, killedRide := d.HP, d.Flown, d.ultimate, d.KilledBy, d.KilledRide
		rideHP, rideFell := 0, false
		if d.Ride != nil {
			rideHP, rideFell = d.Ride.HP, d.Ride.Fell
		}
		e, _ := b.attackOnce(a, d, attackOpts{coattack: true, noCounter: true}, false)
		e.Coattack = group
		switch e.Result {
		case Absorbed, Reflected, Vanished:
			// Absorption changes real HP immediately; only ordinary damage is
			// accumulated. Reflection changes the actor, never the defender.
		default:
			damage += e.Damage
			petDamage += e.PetDamage
			d.HP = hp
			if d.Ride != nil {
				d.Ride.HP, d.Ride.Fell = rideHP, rideFell
			}
			lastAttacker = a
		}
		d.Flown, d.ultimate, d.KilledBy, d.KilledRide = flown, ultimate, killedBy, killedRide
		e.Dead, e.Fly, e.Fall = false, 0, false
		e.HP, e.RideHP = d.HP, d.rideHP()
		*ev = append(*ev, e)
	}
	if len(*ev) == first {
		return
	}
	d.HP = max(0, d.HP-damage)
	last := &(*ev)[len(*ev)-1]
	if d.Ride != nil && petDamage > 0 {
		d.Ride.HP = max(0, d.Ride.HP-petDamage)
		if d.Ride.HP == 0 {
			d.Ride.Fell, last.Fall = true, true
		}
	}
	if full := damage + petDamage; full > 0 && d.Sprite != 101813 && d.Sprite != 101814 {
		threshold := int(float64(d.MaxHP)*1.2 + 20)
		if full >= threshold {
			last.Fly = 2
		} else if d.ultimate += damage; d.ultimate >= threshold {
			last.Fly = 1
		}
		if last.Fly > 0 {
			d.HP, d.Flown, d.ultimate = 0, true, 0
		}
	}
	if d.HP == 0 {
		last.Dead = true
		d.KilledBy, d.KilledRide = lastAttacker.Slot, lastAttacker.riding()
	}
	last.HP, last.RideHP, last.Status = d.HP, d.rideHP(), d.Status()
}
