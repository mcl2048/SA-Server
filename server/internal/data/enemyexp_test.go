package data

import (
	"bufio"
	"fmt"
	"math"
	"os"
	"strings"
	"testing"
)

// A truncated native table must fail even when sampling happens to pick low
// levels. The independent fixture retains every historical/native reward.
func TestEnemyExpPreservesCompleteNativeTable(t *testing.T) {
	f, err := os.Open("testdata/enemy_base_exp.txt")
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	count := 0
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "#") {
			continue
		}
		var level, want int
		if _, err := fmt.Sscanf(line, "%d %d", &level, &want); err != nil {
			t.Fatal(err)
		}
		if got := EnemyExp(&Enemy{Exp: -1}, &EnemyTemp{}, level); got != want {
			t.Errorf("native level %d reward: got %d want %d", level, got, want)
		}
		count++
	}
	if err := scanner.Err(); err != nil {
		t.Fatal(err)
	}
	if count != 200 {
		t.Fatalf("incomplete independent native fixture: %d", count)
	}
}

func TestEnemyExpExtendedLevelsAndExplicitRewards(t *testing.T) {
	for _, tc := range []struct {
		name             string
		exp, level, want int
	}{
		{"negative-level", -1, -1, 0},
		{"zero-level", -1, 0, 0},
		{"native-tail", -1, 200, 6460},
		{"after-native-tail", -1, 201, 6515},
		{"real-data-maximum", -1, 700, 33960},
		{"configured-maximum", -1, 1000, 50460},
		{"huge-level-saturates", -1, math.MaxInt, math.MaxInt32},
		{"explicit-zero", 0, 140, 0},
		{"explicit-zero-after-table", 0, 700, 0},
		{"explicit-positive", 123, 140, 123},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := EnemyExp(&Enemy{Exp: tc.exp}, &EnemyTemp{}, tc.level); got != tc.want {
				t.Fatalf("got %d want %d", got, tc.want)
			}
		})
	}
	// Rank and native template bonuses still use the actual enemy level even
	// after the table ends; the tail policy must not cap the enemy's level.
	template := &EnemyTemp{Base: [4]int{25, 25, 25, 25}, Critical: 50, Counter: 50, Rare: 1}
	if got := EnemyExp(&Enemy{Exp: -1}, template, 250); got != 10335 {
		t.Fatalf("actual-level template bonus was lost: got %d want 10335", got)
	}
	template.Rare = math.MaxInt32
	if got := EnemyExp(&Enemy{Exp: -1}, template, 700); got != math.MaxInt32 {
		t.Fatalf("automatic template reward overflow: got %d", got)
	}
}

func TestEnemyExpEveryAutomaticRealEnemyLevelHasReward(t *testing.T) {
	d, err := LoadBattle(realData)
	if err != nil {
		t.Fatal(err)
	}
	enemies, levels, after100, maxLevel := 0, 0, 0, 0
	for _, e := range d.Enemies {
		if e.Exp != -1 {
			continue
		}
		enemies++
		if e.LvMax > 100 {
			after100++
		}
		for level := max(1, e.LvMin); level <= e.LvMax; level++ {
			levels++
			maxLevel = max(maxLevel, level)
			if got := EnemyExp(e, d.Temps[e.TempNo], level); got <= 0 || got > math.MaxInt32 {
				t.Errorf("enemy %d %s lv%d: invalid automatic reward %d", e.ID, e.Name, level, got)
				break
			}
		}
	}
	t.Logf("real automatic enemies=%d ranges_crossing_100=%d checked_levels=%d max_level=%d", enemies, after100, levels, maxLevel)
}
