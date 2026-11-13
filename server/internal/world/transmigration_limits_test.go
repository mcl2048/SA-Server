package world

import (
	"fmt"
	"strings"
	"testing"

	"sa/server/internal/data"
	"sa/server/internal/store"
)

func TestTransSegmentExactNumber(t *testing.T) {
	arg := "TENSEI:10startmsg:tenthENDTENSEI:1startmsg:firstENDTENSEI:5startmsg:lastEND"
	if got := transSegment(arg, 1); !strings.Contains(got, "first") {
		t.Fatal(got)
	}
	if got := transSegment(arg, 10); !strings.Contains(got, "tenth") {
		t.Fatal(got)
	}
	if got := transSegment(arg, 100); !strings.Contains(got, "last") {
		t.Fatal(got)
	}
}

func TestCharacterTransOriginalSixAndBoundedExtension(t *testing.T) {
	w := &World{}
	// All six original formulas and packed history remain unchanged, including
	// the sixth-turn 620 override and the original 130-level contribution cap.
	for trans := 1; trans <= 6; trans++ {
		p := &entity{char: store.Character{Trans: trans, Level: 1000, Vital: 100, Str: 100, Tgh: 100, Dex: 100, TransEq: (trans-1)*20<<16 + (trans-1)*130}}
		for _, ev := range transQuests {
			p.setEventDone(ev)
		}
		w.transStatus(p)
		old := 400.0
		if trans == 6 {
			old = 620
		}
		want := int(float64(int(old/12+float64(trans*20)/4+float64(trans*130-trans*85)/4))/4 + .5)
		if got := [4]int{p.char.Vital, p.char.Str, p.char.Tgh, p.char.Dex}; got != [4]int{want, want, want, want} {
			t.Fatalf("turn %d got %v want %d each", trans, got, want)
		}
		if p.char.TransEq != trans*20<<16+trans*130 {
			t.Fatalf("legacy history changed at %d: %x", trans, p.char.TransEq)
		}
	}
	legacy := 120<<16 + 780
	last := 0
	for trans := 7; trans <= 100; trans++ {
		p := &entity{char: store.Character{Trans: trans, Level: 1000, Vital: 1000000, Str: 1000000, Tgh: 1000000, Dex: 1000000, TransEq: legacy}}
		w.transStatus(p)
		total := p.char.Vital + p.char.Str + p.char.Tgh + p.char.Dex
		if total < last || total > 271 {
			t.Fatalf("extension not bounded/monotonic at %d: %d after %d", trans, total, last)
		}
		if p.char.TransEq != legacy {
			t.Fatalf("packed history drifted at %d: %x", trans, p.char.TransEq)
		}
		last = total
	}
	p := &entity{char: store.Character{Trans: 100, Level: 1000, Vital: 100, Str: 100, Tgh: 100, Dex: 100, TransEq: 65535<<16 + 65535}}
	w.transStatus(p)
	if p.char.TransEq != legacy {
		t.Fatalf("overlarge old packed history not bounded: %x", p.char.TransEq)
	}
}

func TestCharacterTransConfiguredNPCPath(t *testing.T) {
	w, db, g := setup(t)
	n := transNPC(t, w)
	c, cl := besideNPC(t, w, db, "extendedtrans", n)
	id := int(c.ID)
	elder := enemyPet(t, w, petEnemy(t, g, 2).ID, 100, c.ID)
	elder.Trans = 3 // Extended pets remain usable as sixth/later-turn material.
	w.Do(func() {
		w.Rules.CharMaxTrans = 8
		p := w.players[id]
		p.char.Trans = 6
		p.char.Level = 1000
		p.char.Points = 0
		p.char.TransEq = 120<<16 + 780
		p.char.Vital, p.char.Str, p.char.Tgh, p.char.Dex = 100, 100, 100, 100
		for _, ev := range append(append([]int{}, transNeedEvents...), transSixEvents...) {
			p.setEventDone(ev)
		}
		w.addPet(p, elder)
		p.inv[data.EquipSlots] = &Item{ID: transShard, Pile: 20}
	})
	w.Talk(id, n.id)
	win := transWin(t, cl, "来到我这里")
	w.NpcWindowReply(id, n.id, win.Seq, BtnNext, "")
	win = transWin(t, cl, "下定决心")
	w.NpcWindowReply(id, n.id, win.Seq, BtnOK, "")
	transWin(t, cl, "你被一片光芒包围")
	w.Do(func() {
		p := w.players[id]
		if p.char.Trans != 7 || p.char.Level != 1 || p.char.Points != 70 {
			t.Errorf("extended NPC turn failed: %+v", p.char)
		}
		for _, pet := range p.pets.Pets {
			if pet != nil {
				t.Errorf("turn 7 must consume elder without repeating sixth gift: %+v", pet)
			}
		}
		if w.countItem(p, transShard) != 0 {
			t.Error("later-turn shards were not consumed")
		}
		for _, ev := range transSixEvents {
			if !p.eventDone(ev) {
				t.Errorf("sixth milestone %d lost", ev)
			}
		}
		if p.char.TransEq != 120<<16+780 {
			t.Errorf("history changed: %x", p.char.TransEq)
		}
	})
	for _, limit := range []int{7, 3, 0} {
		w.Do(func() { w.Rules.CharMaxTrans = limit })
		w.Talk(id, n.id)
		text := "转生上限"
		if limit == 0 {
			text = "未开放"
		}
		win = transWin(t, cl, text)
		if win.Buttons != BtnOK {
			t.Fatalf("cap %d offered advancement: %+v", limit, win)
		}
		w.Do(func() {
			p := w.players[id]
			if w.transmigrate(p, n.npc.Arg, 0) {
				t.Error("direct mutation bypassed configured cap")
			}
			if p.char.Trans != 7 || p.char.Level != 1 {
				t.Error("lower cap downgraded existing character")
			}
		})
	}
	w.Do(func() {
		if w.transDelPets(w.players[id], -1) {
			t.Error("negative turn accepted")
		}
	})
}

func TestPetOriginalFormulaAndBoundedExtension(t *testing.T) {
	for _, tc := range []struct{ marefia, old, level, rank, trans, want int }{{100, 140, 130, 0, 0, 143}, {150, 190, 130, 0, 0, 150}, {150, 190, 130, 0, 1, 200}, {150, 200, 1000, 0, 2, 203}, {150, 254, 1000, 0, 99, 255}} {
		if got := petTransAns(tc.marefia, tc.old, tc.level, tc.rank, tc.trans); got != tc.want {
			t.Errorf("%+v got %d", tc, got)
		}
	}
	w, _, g := setup(t)
	pet := enemyPet(t, w, petEnemy(t, g, 2).ID, 100, 1)
	pet.Trans = 2
	pet.Alloc = [4]int{50, 50, 50, 50}
	owner := &entity{char: store.Character{ID: 1}}
	temp := g.Battle.Temps[pet.TempNo]
	last := 200
	w.Do(func() {
		for pet.Trans < 100 {
			beforeTurn := pet.Trans
			ans := petTransAns(150, last, 1000, pet.Rank, beforeTurn)
			work := [4]int{ans / 4, ans / 4, ans / 4, ans / 4}
			w.petReborn(owner, pet, temp, work)
			total := pet.Alloc[0] + pet.Alloc[1] + pet.Alloc[2] + pet.Alloc[3]
			if total < last || total > min(255, last+petTransExtra(beforeTurn)) {
				t.Errorf("turn %d grew %d to %d", beforeTurn+1, last, total)
			}
			if pet.Level != 1 || pet.Exp != 0 || pet.Slot != 7 {
				t.Error("rebirth state changed")
			}
			last = total
		}
	})
}

func TestPetConfiguredThirdTurnNPCAndCaps(t *testing.T) {
	w, db, g := setup(t)
	n := transNPC(t, w)
	c, cl := besideNPC(t, w, db, "petthird", n)
	id := int(c.ID)
	marefia := enemyPet(t, w, petEnemy(t, g, transPetRebl2).ID, 79, c.ID)
	target := enemyPet(t, w, petEnemy(t, g, 2).ID, 100, c.ID)
	target.Trans = 2
	target.Alloc = [4]int{50, 50, 50, 50}
	slot := -1
	w.Do(func() {
		w.Rules.PetMaxTrans = 3
		p := w.players[id]
		p.char.Level = 80
		for _, ev := range []int{4, 69, 70} {
			p.setEventDone(ev)
		}
		w.addPet(p, marefia)
		slot = w.addPet(p, target)
	})
	w.Talk(id, n.id)
	win := transWin(t, cl, "和精灵王重聚")
	w.NpcWindowReply(id, n.id, win.Seq, BtnNext, "")
	win = transWin(t, cl, "准备好要转生")
	w.NpcWindowReply(id, n.id, win.Seq, BtnYes, "")
	win = transWin(t, cl, "")
	if win.Kind != "petselect" {
		t.Fatal(win)
	}
	w.NpcWindowReply(id, n.id, win.Seq, 0, fmt.Sprint(slot+1))
	win = transWin(t, cl, "没错吧")
	w.NpcWindowReply(id, n.id, win.Seq, BtnYes, "")
	transWin(t, cl, "宠物转生成功了")
	w.Do(func() {
		p := w.players[id]
		if target.Trans != 3 || target.Level != 1 {
			t.Errorf("third turn failed: %+v", target)
		}
		sum := 0
		for _, a := range target.Alloc {
			sum += a
		}
		if sum < 200 || sum > 203 {
			t.Errorf("third turn growth unbounded: %v", target.Alloc)
		}
		for _, pet := range p.pets.Pets {
			if pet != nil && pet.TempNo == transPetRebl2 {
				t.Error("second-turn marefia not consumed")
			}
		}
		target.Level = 100
		for _, limit := range []int{3, 1, 0} {
			w.Rules.PetMaxTrans = limit
			text := w.petTransmigrate(p, slot, petTransSegment(n.npc.Arg))
			if !strings.Contains(text, "上限") && !strings.Contains(text, "未开放") {
				t.Errorf("cap%d response %q", limit, text)
			}
			if target.Trans != 3 {
				t.Error("cap changed stored turn")
			}
		}
		for _, bad := range []int{-1, PetSlots, 100} {
			w.petTransmigrate(p, bad, petTransSegment(n.npc.Arg))
		}
	})
}
