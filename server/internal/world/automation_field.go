package world

import (
	"strings"

	"sa/server/internal/data"
)

// automationFieldRecovery prepares only an explicitly running farm. It reuses
// native field effects/stack consumption/persistence, which differ from combat:
// a mixed dish may restore both HP and MP here. Resting/deposited/mail pets are
// not farm participants. Field-only supplies are legal, combat-only ones aren't.
func (w *World) automationFieldRecovery(e *entity, threshold int) bool {
	if threshold <= 0 {
		return false
	}
	maxHP, maxMP := w.maxHPMP(e)
	use := func(target int, pet *Pet, mp bool, current, maximum int) bool {
		if current < 0 || current >= maximum || current*100 >= maximum*threshold {
			return false
		}
		best, bestAmount, bestMeat := -1, 0, false
		deficit := maximum - current
		for slot := data.EquipSlots; slot < data.ItemSlots; slot++ {
			it := e.inv[slot]
			if it == nil {
				continue
			}
			d := w.game.Items[it.ID]
			if d == nil || d.Field == 1 || d.UseFunc != "ITEM_useRecovery" ||
				(d.Type != data.ItemOther && d.Type != data.ItemDish) ||
				(d.Target%100 == 0 && target != 0) || strings.Contains(d.Argument, "解猪") {
				continue
			}
			key := "体"
			if mp {
				key = "气"
			}
			amount := 0
			if strings.Contains(d.Argument, "全") {
				amount = deficit
			} else if strings.Contains(d.Argument, key) {
				amount = argNum(d.Argument, key, 1)
			}
			// Native negative amounts are not restoration. Avoid mixed supplies
			// that would reduce another resource, charm or pet loyalty.
			if amount <= 0 || argNum(d.Argument, "体", 0) < 0 || argNum(d.Argument, "气", 0) < 0 || argNum(d.Argument, "魅", 0) < 0 || argNum(d.Argument, "忠", 0) < 0 {
				continue
			}
			meat := d.Image >= 24000 && d.Image <= 24044
			better := best < 0 || meat && !bestMeat || meat == bestMeat &&
				(amount >= deficit && (bestAmount < deficit || amount < bestAmount) || amount < deficit && bestAmount < deficit && amount > bestAmount)
			if better {
				best, bestAmount, bestMeat = slot, amount, meat
			}
		}
		if best < 0 {
			return false
		}
		w.useRecoveryField(e, e, best, w.game.Items[e.inv[best].ID], pet)
		return true
	}
	if use(0, nil, false, e.char.HP, maxHP) {
		return true
	}
	for slot, pet := range e.pets.Pets {
		if pet == nil || pet.Away || pet.Guard || pet.HP <= 0 || (slot != e.pets.Battle && slot != e.pets.Ride && e.pets.Standby&(1<<slot) == 0) {
			continue
		}
		if use(slot+1, pet, false, pet.HP, w.petMaxHP(pet)) {
			return true
		}
	}
	return use(0, nil, true, e.char.MP, maxMP)
}
