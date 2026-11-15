package data

import (
	"reflect"
	"strings"
	"testing"
)

func TestFreeWarpPointsPreservesNativeTupleSemantics(t *testing.T) {
	cases := []struct {
		name, segment string
		want          [][3]int
	}{
		{"missing TO", "FREE:LV>0", nil},
		{"zero and signed coordinates", "FREE:LV>0|TO:7453,0,7&7454,+1,-2", [][3]int{{7453, 0, 7}, {7454, 1, -2}}},
		{"incomplete tuple stops later choices", "TO:2,0,7&3,1&4,2,3", [][3]int{{2, 0, 7}}},
		{"C atoi numeric prefixes", "TO: 2suffix, 0,+7tail", [][3]int{{2, 0, 7}}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := FreeWarpPoints(c.segment); !reflect.DeepEqual(got, c.want) {
				t.Fatalf("got %v, want %v", got, c.want)
			}
		})
	}
	got := FreeWarpPoints("TO:" + strings.Repeat("2,0,7&", 15))
	if len(got) != 10 {
		t.Fatalf("native random destination cap changed: %d", len(got))
	}
}
