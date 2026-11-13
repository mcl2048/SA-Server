package battle

import (
	"testing"

	"sa/server/internal/data"
)

func captureRoom() (*Battle, *Fighter) {
	b := New(rnd(125))
	for _, slot := range []int{0, 1} {
		p := player(slot)
		p.Level, p.HP, p.MaxHP = 30, 10000, 10000
		b.Add(p)
	}
	target := enemy(15, "gu:1")
	target.HP, target.MaxHP, target.Def, target.Atk = 1, 500, 0, 0
	target.Seed = &PetSeed{Capture: true}
	b.Add(target)
	return b, target
}

func TestCaptureProtectionAppliesOnlyToAutomaticCommands(t *testing.T) {
	for _, automatic := range []bool{false, true} {
		name := "manual"
		if automatic {
			name = "automatic"
		}
		t.Run(name, func(t *testing.T) {
			b, target := captureRoom()
			p := b.F[0]
			p.Atk, p.FixAtk, p.Quick, p.FixQuick = 10000, 10000, 2000, 2000
			p.Weapon, p.AttackMin, p.AttackMax = data.ItemFist, 1, 1
			b.Resolve(map[int]Command{0: {Kind: Attack, Target: 15, Automatic: automatic}, 1: {Kind: Capture, Target: 15}})
			if automatic && target.HP <= 0 {
				t.Fatal("automatic command killed pending capture")
			}
			if !automatic && target.HP > 0 {
				t.Fatal("manual command was silently replaced with capture safety")
			}
			if b.autoAvoidTargets != 0 {
				t.Fatal("capture filter leaked beyond the automatic action")
			}
		})
	}
}

func TestAutomaticGroupMagicExcludesPendingCapture(t *testing.T) {
	b, target := captureRoom()
	other := enemy(16, "gu:1")
	other.HP, other.MaxHP, other.Def, other.Atk = 10000, 10000, 0, 0
	b.Add(other)
	p := b.F[0]
	p.Quick, p.FixQuick = 2000, 2000
	p.Mag = &MagicSkill{Lv: [4]int{100, 100, 100, 100}}
	am := data.AttMagic{Field: [3][5]bool{{true, true, true, true, true}, {true, true, true, true, true}, {true, true, true, true, true}}}
	b.AttMagics = []data.AttMagic{am, am}
	events := b.Resolve(map[int]Command{
		0: {Kind: Magic, Target: 21, Automatic: true, Magic: &data.Magic{Name: "群攻", Func: "MAGIC_AttMagic", Target: 3, Option: "火|100|1", Idx: 0}},
		1: {Kind: Capture, Target: 15},
	})
	hitOther := false
	for _, ev := range events {
		if ev.Actor == 0 && ev.Kind == Magic {
			if ev.Target == 15 {
				t.Fatalf("group magic included capture: %+v", ev)
			}
			hitOther = hitOther || ev.Target == 16 && ev.Damage > 0
		}
	}
	if target.HP <= 0 || !hitOther {
		t.Fatalf("group magic filter affected wrong targets: captureHP=%d otherHP=%d", target.HP, other.HP)
	}
}

func TestAutomaticChargedPetDoesNotAttackCapture(t *testing.T) {
	b, target := captureRoom()
	p := &Fighter{Slot: 5, Pet: true, OwnerSet: true, OwnerSlot: 0, HP: 10000, MaxHP: 10000, Atk: 10000, Quick: 2000, Loyalty: 100}
	b.Add(p)
	p.charge, p.chargeP = 0, 100
	b.Resolve(map[int]Command{0: {Kind: Guard, Automatic: true}, 1: {Kind: Capture, Target: 15}, 5: {Kind: Guard, Automatic: true}})
	if target.HP <= 0 {
		t.Fatal("forced charged attack bypassed capture filter")
	}
}

func TestAutomaticMercyKeepsCaptureAliveThroughCounterChain(t *testing.T) {
	b, target := captureRoom()
	p := &Fighter{Slot: 5, Pet: true, OwnerSet: true, OwnerSlot: 0, HP: 10000, MaxHP: 10000, Atk: 10000, Quick: 2000, Loyalty: 100}
	b.Add(p)
	target.Tactics = "wa:100;0;0;0;0;0;0"
	target.Skills[0] = &data.Skill{ID: 3, Field: 1, Func: "PETSKILL_NoGuard", Option: "反击%+1000", Target: 0}
	events := b.Resolve(map[int]Command{0: {Kind: Guard, Automatic: true}, 1: {Kind: Capture, Target: 15},
		5: {Kind: Attack, Target: 15, Skill: &data.Skill{ID: 903, Field: 1, Name: "手下留情", Func: "PETSKILL_ShowMercy", Target: 1}, Automatic: true}})
	mercy := false
	for _, ev := range events {
		mercy = mercy || ev.Actor == 5 && ev.Target == 15 && ev.Skill == "手下留情"
	}
	if target.HP <= 0 || !mercy {
		t.Fatalf("mercy/counter capture safety failed: targetHP=%d mercy=%v events=%+v", target.HP, mercy, events)
	}
}

func TestAutomaticAttackDoesNotDamageCapturableGuardian(t *testing.T) {
	b, target := captureRoom()
	other := enemy(10, "gu:1")
	other.HP, other.MaxHP, other.Atk, other.Def = 5000, 5000, 0, 0
	b.Add(other)
	target.Tactics = "wa:100;0;0;0;0;0;0"
	target.Skills[0] = &data.Skill{ID: 3, Field: 1, Func: "PETSKILL_Guardian", Option: "COM:防御", Target: 1}
	p := b.F[0]
	p.Atk, p.FixAtk, p.Quick, p.FixQuick = 10000, 10000, 2000, 2000
	p.Weapon, p.AttackMin, p.AttackMax = data.ItemFist, 1, 1
	events := b.Resolve(map[int]Command{0: {Kind: Attack, Target: 10, Automatic: true}, 1: {Kind: Capture, Target: 15}})
	if target.HP <= 0 {
		t.Fatalf("guardian redirection killed capture target: %+v", events)
	}
	for _, ev := range events {
		if ev.Actor == 0 && (ev.Target == 15 || ev.Guardian == 15) && ev.Damage > 0 {
			t.Fatalf("capture guardian received automatic damage: %+v", ev)
		}
		if ev.Actor == 0 && ev.Kind == None && ev.Target == 10 && (ev.HP != 5000 || ev.Guardian != -1) {
			t.Fatalf("skipped interception sent phantom state: %+v", ev)
		}
	}
}
