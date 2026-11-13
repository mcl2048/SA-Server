package data

import (
	"math"
	"strconv"
	"strings"
	"testing"
)

func TestNextLevelExpPreservesOriginalTableAndExtendsTail(t *testing.T) {
	lines, err := readLines(realData + "/battle/exp.txt")
	if err != nil {
		t.Fatal(err)
	}
	d := &BattleData{}
	for _, line := range lines {
		fields := strings.Fields(line)
		value, err := strconv.Atoi(fields[1])
		if err != nil {
			t.Fatal(err)
		}
		d.LevelExp = append(d.LevelExp, value)
	}
	for level, want := range d.LevelExp {
		if want >= 0 && d.NextLevelExp(level) != want {
			t.Errorf("original level %d changed: got %d want %d", level, d.NextLevelExp(level), want)
		}
	}
	if d.NextLevelExp(199) != 91800799 || d.NextLevelExp(200) != 92276013 || d.NextLevelExp(201) != 92751227 {
		t.Fatalf("tail slope was not preserved: 199=%d 200=%d 201=%d", d.NextLevelExp(199), d.NextLevelExp(200), d.NextLevelExp(201))
	}
	for level := 200; level <= 1000; level++ {
		next := d.NextLevelExp(level)
		if next <= d.NextLevelExp(level-1) || next > math.MaxInt32 {
			t.Fatalf("unsafe/nonmonotone extended experience at %d: %d", level, next)
		}
	}
}

func TestNextLevelExpInvalidTablesAndOverflow(t *testing.T) {
	for _, tc := range []struct {
		name        string
		table       []int
		level, want int
	}{
		{"negative-level", []int{0, 10}, -1, -1},
		{"empty", nil, 5, -1},
		{"no-positive-tail", []int{0, -1}, 5, -1},
		{"no-sentinel", []int{0, 10, 15}, 3, 20},
		{"one-positive", []int{0, 10, -1}, 2, 11},
		{"declining-tail", []int{0, 10, 5, -1}, 3, 6},
		{"interior-sentinel-preserved", []int{0, -1, 10, 20, -1}, 1, -1},
		{"sentinel-and-beyond", []int{0, 10, 20, -1, -1}, 4, 40},
		{"saturates", []int{0, math.MaxInt - 10, math.MaxInt - 5, -1}, math.MaxInt, math.MaxInt},
	} {
		t.Run(tc.name, func(t *testing.T) {
			d := &BattleData{LevelExp: tc.table}
			if got := d.NextLevelExp(tc.level); got != tc.want {
				t.Fatalf("got %d, want %d", got, tc.want)
			}
		})
	}
}
