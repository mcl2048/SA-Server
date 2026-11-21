package battle

import "testing"

func TestKillExpNeverCreatesRewardForZeroExperienceEnemy(t *testing.T) {
	for _, level := range []int{1, 100, 105, 106, 119, 120, 140, 1000} {
		if got := KillExp(0, level, 100); got != 0 {
			t.Errorf("explicit no-reward enemy grants %d experience at player lv%d", got, level)
		}
	}
}
