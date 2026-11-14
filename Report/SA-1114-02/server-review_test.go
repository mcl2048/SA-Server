package world

import (
	"sync"
	"testing"

	"sa/server/internal/battle"
	"sa/server/internal/data"
	"sa/server/internal/proto"
)

// Run through a Go overlay: this evidence fixture never enters the production
// package or modifies its existing tests. All definitions come from gamedata.
func TestSA111402NativeActions(t *testing.T) {
	w, db, g := setup(t)
	c, cl := petOwner(t, w, db, "sa111402actions", 10, 60)
	id := int(c.ID)
	ps := givePet(t, w, id, petEnemy(t, g, 1), 5)
	for _, want := range []struct{ id, image, kind int }{
		{0, 20033, data.ItemAxe}, {1, 20032, data.ItemAxe},
		{1500, 23013, data.ItemOther}, {1510, 23005, data.ItemOther},
		{1329, 22265, data.ItemOther}, {1247, 24043, data.ItemDish},
		{22626, 22545, 33},
	} {
		d := g.Items[want.id]
		if d == nil || d.Image != want.image || d.Type != want.kind {
			t.Fatalf("fixture definition %d changed: %+v", want.id, d)
		}
		t.Logf("fixture id=%d image=%d type=%d field=%d target=%d name=%s func=%s arg=%s", d.ID, d.Image, d.Type, d.Field, d.Target, d.Name, d.UseFunc, d.Argument)
	}
	reset := func(itemID int) int {
		w.Do(func() {
			e := w.players[id]
			e.inv = &inventory{}
			e.char.HP, e.char.MP = 1, 1
		})
		cl.take()
		return bagSlot(w, id, g.Items[itemID])
	}
	t.Run("character_equipment_ID_zero_and_native_unequip", func(t *testing.T) {
		slot := reset(0)
		w.ItemMove(id, slot, -1)
		w.Do(func() {
			e := w.players[id]
			if e.inv[data.SlotArm] == nil || e.inv[data.SlotArm].ID != 0 || e.inv[slot] != nil {
				t.Error("native equipment did not move ID zero to arm")
			}
		})
		if _, ok := find[*proto.Status](cl.take()); !ok {
			t.Error("equipment needs authoritative Status")
		}
		w.ItemMove(id, data.SlotArm, -1)
		w.Do(func() {
			if w.players[id].inv[data.SlotArm] != nil || w.players[id].inv[slot] == nil {
				t.Error("native unequip failed")
			}
		})
	})
	t.Run("HP_1500_consumes_and_sends_status", func(t *testing.T) {
		slot := reset(1500)
		w.ItemUse(id, slot, 0)
		w.Do(func() {
			e := w.players[id]
			maxHP, _ := w.maxHPMP(e)
			if e.inv[slot] != nil || e.char.HP < min(91, maxHP) || e.char.HP > min(111, maxHP) {
				t.Errorf("HP recovery invalid: hp=%d max=%d", e.char.HP, maxHP)
			}
		})
		msgs := cl.take()
		if _, ok := find[*proto.Status](msgs); !ok {
			t.Error("HP recovery lacks Status")
		}
		if _, ok := find[*proto.Inventory](msgs); !ok {
			t.Error("HP recovery lacks Inventory")
		}
	})
	t.Run("MP_1510_consumes_and_sends_status", func(t *testing.T) {
		slot := reset(1510)
		w.ItemUse(id, slot, 0)
		w.Do(func() {
			e := w.players[id]
			_, maxMP := w.maxHPMP(e)
			if e.inv[slot] != nil || e.char.MP < min(19, maxMP) || e.char.MP > min(23, maxMP) {
				t.Errorf("MP recovery invalid: mp=%d max=%d", e.char.MP, maxMP)
			}
		})
		if _, ok := find[*proto.Status](cl.take()); !ok {
			t.Error("MP recovery lacks Status")
		}
	})
	t.Run("pet_HP_works_pure_MP_preserved", func(t *testing.T) {
		slot := reset(1500)
		w.Do(func() { w.players[id].pets.Pets[ps].HP = 1 })
		w.ItemUse(id, slot, ps+1)
		w.Do(func() {
			e := w.players[id]
			if e.pets.Pets[ps].HP <= 1 || e.inv[slot] != nil {
				t.Error("pet HP recovery failed")
			}
		})
		if _, ok := find[*proto.Pets](cl.take()); !ok {
			t.Error("pet recovery lacks Pets")
		}
		slot = reset(1510)
		w.ItemUse(id, slot, ps+1)
		w.Do(func() {
			if w.players[id].inv[slot] == nil {
				t.Error("pure MP drug must not be consumed on pet")
			}
		})
	})
	t.Run("unusable_letter_and_battle_status_food_preserved", func(t *testing.T) {
		for _, itemID := range []int{1329, 1247} {
			slot := reset(itemID)
			w.Do(func() {
				x := invItem(slot, w.players[id].inv[slot], g.Items[itemID])
				if (itemID == 1329 && x.Usable) || (itemID == 1247 && (!x.Usable || x.Field != 1)) {
					t.Errorf("wrong availability metadata: %+v", x)
				}
			})
			w.ItemUse(id, slot, 0)
			w.Do(func() {
				if w.players[id].inv[slot] == nil {
					t.Errorf("ID %d must not consume on map", itemID)
				}
			})
		}
	})
	t.Run("pet_equipment_22626_native_slot_four", func(t *testing.T) {
		slot := reset(22626)
		w.Do(func() { w.players[id].pets.Pets[ps].VariableAI = 100 })
		w.PetItemEquip(id, ps, slot, -1)
		w.Do(func() {
			e := w.players[id]
			if e.inv[slot] != nil || e.pets.Pets[ps].item(4) == nil || e.pets.Pets[ps].item(4).ID != 22626 {
				t.Error("pet equipment did not use type33 slot4")
			}
		})
		if _, ok := find[*proto.Pets](cl.take()); !ok {
			t.Error("pet equip lacks Pets")
		}
	})
}

func TestSA111402ConcurrentStatUp(t *testing.T) {
	w, db, g := setup(t)
	c, cl := petOwner(t, w, db, "sa111402stats", 10, 60)
	id := int(c.ID)
	w.Do(func() { w.players[id].char.Points = 7 })
	cl.take()
	var group sync.WaitGroup
	for i := 0; i < 128; i++ {
		group.Add(1)
		go func(stat int) { defer group.Done(); w.StatUp(id, stat) }(i % 4)
	}
	group.Wait()
	w.Do(func() {
		got := w.players[id].char
		if got.Points != 0 || got.Vital+got.Str+got.Tgh+got.Dex != 67 {
			t.Errorf("128 concurrent attempts exceeded 7 points: %+v", got)
		}
	})
	count := 0
	for _, msg := range cl.take() {
		if _, ok := msg.(*proto.Status); ok {
			count++
		}
	}
	if count != 7 {
		t.Errorf("want 7 successful authoritative Status messages, got %d", count)
	}
	w.Do(func() { w.players[id].char.Points = 3 })
	for _, stat := range []int{-1, 4, 100} {
		w.StatUp(id, stat)
	}
	w.Do(func() {
		if w.players[id].char.Points != 3 {
			t.Error("invalid stat consumed points")
		}
	})
	if len(cl.take()) != 0 {
		t.Error("invalid stat unexpectedly acknowledged")
	}
	w.Do(func() {
		e := w.players[id]
		w.startBattleWith(e, []*battle.Fighter{enemyFighter(w, petEnemy(t, g, 1), 1, battle.EnemySlot(0))}, nil, nil)
	})
	cl.take()
	w.StatUp(id, 0)
	w.Do(func() {
		if w.players[id].char.Points != 3 {
			t.Error("battle stat consumed points")
		}
	})
	if _, ok := find[*proto.Status](cl.take()); ok {
		t.Error("battle stat unexpectedly acknowledged")
	}
	t.Log("128 concurrent attempts spent exactly 7 points; exhausted, invalid and battle attempts rejected")
}
