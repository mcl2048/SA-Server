package world

import (
	"math"
	"sa/server/internal/battle"
)

// battleGold rewards actual defeated enemies once per eligible winning player,
// like the existing item drops. Party members share the encounter, not a kill
// counter; summoned pets never create a separate wallet or duplicate this award.
func (w *World) battleGold(e *entity, b *battle.Battle) int {
	rate := w.Rules.BattleGoldRate
	if rate <= 0 || math.IsNaN(rate) || math.IsInf(rate, 0) {
		return 0
	}
	room := max(0, maxGold(e.char.Trans)-e.char.Gold)
	if room == 0 {
		return 0
	}
	base := 0
	for _, f := range b.F {
		if f == nil || !f.Enemy() || f.Level < 1 || f.HP > 0 || f.Escaped || f.Captured {
			continue
		}
		n := f.Level
		if n >= 5 {
			// Uniform inclusive integer range, wholly within 50%..80%. For example
			// level 5 => 3..4 and level 100 => 50..80.
			lo, hi := (n+1)/2, n*4/5
			n = lo + w.rnd.IntN(hi-lo+1)
		}
		base += n
	}
	// Multiply the full encounter once, then floor to whole stones. Saturate
	// before converting floats to int, and respect the existing carrying limit.
	amount := math.Floor(float64(base) * rate)
	if amount >= float64(room) {
		return room
	}
	return max(0, int(amount))
}

func (w *World) giveBattleGold(e *entity, b *battle.Battle) int {
	n := w.battleGold(e, b)
	if n > 0 {
		e.char.Gold += n
		w.sendInventory(e)
	}
	return n
}
