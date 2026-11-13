package battle

import (
	"testing"

	"sa/server/internal/data"
)

func TestEnemyAIExcludesUnavailableSkills(t *testing.T) {
	for _, tc := range []struct {
		name  string
		skill *data.Skill
	}{
		{"empty", nil},
		{"map-only", &data.Skill{ID: 900, Field: 2, Func: "PETSKILL_NormalGuard", Target: 0}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			b := New(rnd(91))
			b.Add(player(0))
			f := enemy(EnemySlot(0), "at:0;1;3|wa:100;0;0;0;0;0;0")
			f.Skills[0] = tc.skill
			b.Add(f)
			c := b.enemyAI(f)
			if c.Kind != Attack || c.Skill != nil || c.Target != 0 {
				t.Fatalf("unavailable skill must fall back to a legal attack: %+v", c)
			}
		})
	}
}

func TestEnemyAISelfAndGroupSkillsRespectTheirTarget(t *testing.T) {
	for _, tc := range []struct {
		name         string
		target, want int
	}{
		{"self", 0, 15},
		{"own-side", 2, 21},
		{"other-side", 3, 20},
		{"all", 4, 22},
		{"chosen-side", 8, 20},
		{"row", 10, 26},
		{"all-rows", 11, 20},
	} {
		t.Run(tc.name, func(t *testing.T) {
			b := New(rnd(92))
			b.Add(player(0))
			f := enemy(15, "at:0;1;3|wa:100;0;0;0;0;0;0")
			f.Skills[0] = &data.Skill{ID: 901, Field: 1, Func: "PETSKILL_Barrier", Target: tc.target}
			b.Add(f)
			c := b.enemyAI(f)
			if c.Skill != f.Skills[0] || c.Target != tc.want {
				t.Fatalf("skill target=%d want=%d, command %+v", tc.target, tc.want, c)
			}
		})
	}
}

func TestEnemyAITacticsAndSkillsStayCurrent(t *testing.T) {
	b := New(rnd(94))
	b.Add(player(0))
	f := enemy(15, "gu:100")
	b.Add(f)
	if c := b.enemyAI(f); c.Kind != Guard {
		t.Fatalf("guard tactic ignored: %+v", c)
	}
	f.Tactics = "at:0;2;3|wa:100;0;0;0;0;0;0"
	f.Skills[0] = &data.Skill{ID: 902, Func: "PETSKILL_NormalAttack", Field: 1, Target: 1}
	if c := b.enemyAI(f); c.Kind != Attack || c.Skill != f.Skills[0] || c.Target != 0 {
		t.Fatalf("changed tactic ignored: %+v", c)
	}
	f.Skills[0] = nil
	if c := b.enemyAI(f); c.Kind != Attack || c.Skill != nil || c.Target != 0 {
		t.Fatalf("retired skill remained cached: %+v", c)
	}
}

func BenchmarkEnemyAI(b *testing.B) {
	room := New(rnd(93))
	for i := 0; i < 5; i++ {
		room.Add(player(i))
	}
	f := enemy(15, "at:10;1;3|gu:1|ma:0|es:1|wa:1;1;1;0;0;0;0")
	for i := 0; i < 3; i++ {
		f.Skills[i] = &data.Skill{ID: i + 1, Field: 1, Func: "PETSKILL_NormalAttack", Target: 1}
	}
	room.Add(f)
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		room.enemyAI(f)
	}
}
