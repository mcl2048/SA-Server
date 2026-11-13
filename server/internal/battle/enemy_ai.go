package battle

import (
	"math"
	"strconv"
	"strings"
)

// enemyTactics stores only table data, never a cached target or current skill.
// A fighter's seven skills and both sides' live state are checked every turn.
type enemyTactics struct {
	source  string
	attack  [3]int
	weights [11]int // attack, guard, magic fallback, escape, seven skill slots
}

func parseEnemyTactics(source string) enemyTactics {
	p := enemyTactics{source: source}
	// Keep a malformed custom table from overflowing the weighted sum. The
	// shipped weights are much smaller; this bound does not change their odds.
	limit := int(^uint(0)>>1) / 12
	for rest := source; rest != ""; {
		part, next, _ := strings.Cut(rest, "|")
		rest = next
		key, raw, ok := strings.Cut(part, ":")
		if !ok {
			continue
		}
		var values []int
		switch strings.TrimSpace(key) {
		case "at":
			values = p.attack[:]
		case "gu":
			values = p.weights[1:2]
		case "ma":
			values = p.weights[2:3]
		case "es":
			values = p.weights[3:4]
		case "wa":
			values = p.weights[4:]
		default:
			continue
		}
		for i := 0; i < len(values); i++ {
			value, next, more := strings.Cut(raw, ";")
			if n, err := strconv.Atoi(strings.TrimSpace(value)); err == nil {
				values[i] = min(limit, max(0, n))
			} else {
				values[i] = 0
			}
			if !more {
				break
			}
			raw = next
		}
	}
	p.weights[0] = p.attack[0]
	return p
}

// enemyAI retains the table's weighted actions and attack preferences:
// at[1] filters players/pets, at[2] selects random/highest/lowest HP. Unavailable
// skill slots are excluded; a table with no usable action falls back to attack.
// The unimplemented ma branch keeps its historical ordinary-attack fallback.
func (b *Battle) enemyAI(f *Fighter) Command {
	if f.ai == nil || f.ai.source != f.Tactics {
		parsed := parseEnemyTactics(f.Tactics)
		f.ai = &parsed
	}
	weights := f.ai.weights
	switch {
	case b.NoEnemyGuard:
		weights[1] = 0
	case b.GuardScale > 0 && b.GuardScale != 1:
		limit := int(^uint(0)>>1) / 12
		weights[1] = int(math.Min(float64(limit), math.Round(float64(weights[1])*b.GuardScale)))
	}
	for i, sk := range f.Skills {
		if sk == nil || (sk.Field != 0 && sk.Field != 1) {
			weights[4+i] = 0
		}
	}
	total := 0
	for _, weight := range weights {
		total += weight
	}
	choice := 0
	if total > 0 {
		r := b.randi(0, total-1)
		for i, weight := range weights {
			if r < weight {
				choice = i
				break
			}
			r -= weight
		}
	}
	switch choice {
	case 1:
		return Command{Kind: Guard}
	case 3:
		return Command{Kind: Escape}
	}
	// A fixed stack buffer avoids constructing three target slices per enemy.
	var available, selected [SideOffset]int
	n, count := 0, 0
	side := 1 - f.Side()
	for slot := side * SideOffset; slot < (side+1)*SideOffset; slot++ {
		x := b.F[slot]
		if !x.Alive() || x.hidden {
			continue
		}
		available[n], n = slot, n+1
		player := x.Player && slot%SideOffset < 5
		if f.ai.attack[1] == 2 && !player || f.ai.attack[1] == 3 && player {
			continue
		}
		selected[count], count = slot, count+1
	}
	if count == 0 {
		selected, count = available, n
	}
	if count == 0 {
		return Command{Kind: None}
	}
	target := selected[0]
	switch f.ai.attack[2] {
	case 2, 3:
		for _, slot := range selected[1:count] {
			if f.ai.attack[2] == 2 && b.F[slot].HP > b.F[target].HP || f.ai.attack[2] == 3 && b.F[slot].HP < b.F[target].HP {
				target = slot
			}
		}
	default:
		target = selected[b.randi(0, count-1)]
	}
	c := Command{Kind: Attack, Target: target}
	if choice >= 4 {
		c.Skill = f.Skills[choice-4]
		// Scope applies before execution, so self/group skills cannot inherit
		// the ordinary attack's opponent slot and affect the wrong side.
		switch c.Skill.Target {
		case 0, 5:
			c.Target = f.Slot
		case 2:
			c.Target = 20 + f.Side()
		case 3, 8, 11:
			c.Target = 21 - f.Side()
		case 4:
			c.Target = 22
		case 10:
			c.Target = [4]int{26, 25, 23, 24}[target/5]
		}
	}
	return c
}
