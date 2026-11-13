package world

import (
	"reflect"
	"sa/server/internal/data"
	"testing"
)

func TestAIPetRebalanceSavedBags(t *testing.T) {
	for temp := 29001; temp <= 29004; temp++ {
		old, next, _ := data.AIPetRebalance(temp)
		for _, lv := range []int{1, 50, 140} {
			p := &Pet{TempNo: temp, Level: lv, GetLevel: 1, Alloc: old, FreeName: "伙伴", Owner: 42, Exp: 123, Skills: [7]int{1, 2, 999}, Rank: 0}
			p.Vital = (28 + (lv-1)*5) * old[0]
			p.Str = (28 + (lv-1)*5) * old[1]
			p.Tgh = (28 + (lv-1)*5) * old[2]
			p.Dex = (28 + (lv-1)*5) * old[3]
			p.Born = &[4]int{28 * old[0], 28 * old[1], 28 * old[2], 28 * old[3]}
			before := p.derive()
			p.HP = before.HP / 2
			b := &petBag{Battle: 0, Ride: -1}
			b.Pets[0] = p
			b.Pool = []*Pet{p}
			upgraded := parsePets(b.String())
			q := upgraded.Pets[0]
			if q.Alloc != next || q.Vital <= p.Vital || q.Str <= p.Str || q.Tgh <= p.Tgh || q.Dex <= p.Dex {
				t.Fatalf("not upgraded: %+v", q)
			}
			if q.Level != lv || q.Exp != 123 || q.FreeName != p.FreeName || q.Owner != 42 || q.Skills != p.Skills || q.Rank != p.Rank {
				t.Fatal("identity/progress lost")
			}
			if expected := max(1, p.HP*q.derive().HP/before.HP); q.HP != expected {
				t.Fatalf("injury ratio changed: got %d want %d", q.HP, expected)
			}
			if !reflect.DeepEqual(q, upgraded.Pool[0]) {
				t.Fatal("deposited pet skipped")
			}
			if again := parsePets(upgraded.String()); !reflect.DeepEqual(upgraded, again) {
				t.Fatal("migration repeated")
			}
		}
	}
}

func TestAIPetRebalancePreservesAllocationRollAndLegacyWithoutBorn(t *testing.T) {
	for temp := 29001; temp <= 29004; temp++ {
		old, next, _ := data.AIPetRebalance(temp)
		for _, roll := range []int{-2, 2} {
			p := &Pet{TempNo: temp, Level: 60, GetLevel: 48, HP: 1}
			for i := range p.Alloc {
				p.Alloc[i] = old[i] + roll
			}
			p.Vital, p.Str, p.Tgh, p.Dex = 9000, 9000, 9000, 9000
			rebalanceAIPet(p)
			for i, a := range p.Alloc {
				if a != next[i]+roll {
					t.Fatal("allocation roll lost")
				}
			}
			if p.HP <= 0 || p.Born != nil {
				t.Fatal("old save lost live HP or invented birth record")
			}
			before := *p
			rebalanceAIPet(p)
			if !reflect.DeepEqual(before, *p) {
				t.Fatal("second migration changed pet")
			}
		}
	}
}

func TestAIPetRebalanceLeavesNewCustomAndDeadPets(t *testing.T) {
	old, next, _ := data.AIPetRebalance(29001)
	for _, p := range []*Pet{{TempNo: 29001, Alloc: next, HP: 0}, {TempNo: 777, Alloc: old}, {TempNo: 29001, Alloc: [4]int{1, 2, 3, 4}}} {
		before := *p
		rebalanceAIPet(p)
		if !reflect.DeepEqual(before, *p) {
			t.Fatal("unrelated pet changed")
		}
	}
	p := &Pet{TempNo: 29001, Alloc: old, Vital: 1000, Str: 1000, Tgh: 1000, Dex: 1000, HP: 0}
	rebalanceAIPet(p)
	if p.HP != 0 || p.Alloc != next {
		t.Fatal("dead pet revived or skipped")
	}
}
