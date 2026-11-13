package world

import (
	"fmt"
	"slices"
	"time"

	"sa/server/internal/battle"
	"sa/server/internal/data"
	"sa/server/internal/proto"
)

// 宠物在战斗里的世界层部分：捕获前的检查与捕获后变成宠物、宠物逃走、战斗结束时的经验与忠诚度。

// retiredBattlePet is removed only because a joining teammate reduced the quota.
// The original fighter and its kills settle once at the normal battle exit.
type retiredBattlePet struct {
	bag       int
	fighter   *battle.Fighter
	kills     []*battle.Fighter
	killToken int // Room-unique attribution; a later death invalidates the old kill.
}

func (p retiredBattlePet) validKills() []*battle.Fighter {
	var kills []*battle.Fighter
	for _, f := range p.kills {
		if f != nil && f.Enemy() && f.HP <= 0 && f.KilledBy == p.killToken {
			kills = append(kills, f)
		}
	}
	return kills
}

func (ft *fight) retiredKills() []*battle.Fighter {
	var kills []*battle.Fighter
	for _, p := range ft.retiredPets {
		kills = append(kills, p.validKills()...)
	}
	return kills
}

func (ft *fight) petBagSlot(slot int) (int, bool) {
	if bag, ok := ft.pets[slot]; ok {
		return bag, true
	}
	if ft.pets == nil && slot == ft.slot+5 && ft.pet >= 0 {
		return ft.pet, true
	}
	return 0, false
}
func (ft *fight) ownsPetSlot(slot int) bool { _, ok := ft.petBagSlot(slot); return ok }
func (ft *fight) petSlots() []int {
	var slots []int
	for slot := range ft.pets {
		slots = append(slots, slot)
	}
	if ft.pets == nil && ft.pet >= 0 {
		slots = append(slots, ft.slot+5)
	}
	slices.Sort(slots)
	if i := slices.Index(slots, ft.slot+5); i > 0 {
		slots[0], slots[i] = slots[i], slots[0]
	}
	return slots
}
func (ft *fight) petCommand(slot int) *battle.Command {
	if slot == ft.slot+5 && ft.petCmd != nil {
		return ft.petCmd
	}
	return ft.petCmds[slot]
}

// balanceBattlePets shares five pet positions fairly, with the leader receiving
// any remainder. Existing fighters move as objects: HP, status and commands are
// preserved; pets removed by a quota shrink cannot spawn again in this battle.
func (w *World) balanceBattlePets(room *battleRoom, side int) {
	var members []*entity
	for _, e := range room.members {
		if e.fight != nil && e.fight.slot/battle.SideOffset == side {
			members = append(members, e)
		}
	}
	if len(members) == 0 {
		return
	}
	type deployment struct {
		owner              *entity
		bag, oldSlot, slot int
		fighter            *battle.Fighter
		command            *battle.Command
	}
	var all []*deployment
	reserved := map[int]bool{}
	for _, e := range members {
		reserved[e.fight.slot+5] = true
	}
	used := map[int]bool{}
	for index, e := range members {
		ft := e.fight
		quota := 5 / len(members)
		if index < 5%len(members) {
			quota++
		}
		var current []*deployment
		for _, slot := range ft.petSlots() {
			bag, _ := ft.petBagSlot(slot)
			if pf := room.b.F[slot]; pf != nil {
				current = append(current, &deployment{owner: e, bag: bag, oldSlot: slot, slot: -1, fighter: pf, command: ft.petCommand(slot)})
			}
		}
		// Only the first entry can be the fixed primary; preserve its identity even
		// when dead/escaped so rescue never revives a pet or changes an old target.
		for i, d := range current {
			if i >= quota {
				kills := petKillsAt(ft, d.oldSlot)
				room.retirementSeq++
				token := -2 - room.retirementSeq
				ft.retiredPets = append(ft.retiredPets, retiredBattlePet{bag: d.bag, fighter: d.fighter, kills: kills, killToken: token})
				for _, killed := range kills {
					killed.KilledBy = token
				}
				continue
			}
			if i == 0 {
				d.slot = ft.slot + 5
				used[d.slot] = true
			}
			all = append(all, d)
		}
		count := min(len(current), quota)
		candidates := []int{}
		if ft.pet >= 0 {
			candidates = append(candidates, ft.pet)
		} else if e.pets.Battle >= 0 {
			candidates = append(candidates, e.pets.Battle)
		}
		for bag := range e.pets.Pets {
			if e.pets.Standby&(1<<bag) != 0 && !slices.Contains(candidates, bag) {
				candidates = append(candidates, bag)
			}
		}
		for _, bag := range candidates {
			if count >= quota {
				break
			}
			p := e.pets.Pets[bag]
			if p == nil || p.HP <= 0 || p.Away || p.Guard || bag == e.pets.Ride || ft.deployedPets[bag] {
				continue
			}
			d := &deployment{owner: e, bag: bag, oldSlot: -1, slot: -1}
			if count == 0 {
				d.slot = ft.slot + 5
				used[d.slot] = true
			}
			all = append(all, d)
			ft.deployedPets[bag] = true
			count++
		}
	}
	for _, d := range all {
		if d.slot >= 0 {
			continue
		}
		for slot := side*battle.SideOffset + 5; slot < side*battle.SideOffset+10; slot++ {
			if !used[slot] && !reserved[slot] {
				d.slot = slot
				used[slot] = true
				break
			}
		}
	}
	remap := map[int]int{}
	// Every old pet position will be cleared, including departed owners whose
	// escaped fighters remain in F. Never let a new occupant inherit their kills.
	for slot := side*battle.SideOffset + 5; slot < side*battle.SideOffset+10; slot++ {
		if f := room.b.F[slot]; f != nil && f.Pet {
			remap[slot] = -1
		}
	}
	for _, e := range members {
		for _, retired := range e.fight.retiredPets {
			remap[retired.fighter.Slot] = -1
		}
	}
	for _, d := range all {
		if d.oldSlot >= 0 {
			remap[d.oldSlot] = d.slot
		}
	}
	for _, f := range room.b.F {
		if f != nil {
			if slot, ok := remap[f.KilledBy]; ok {
				f.KilledBy = slot
			}
		}
	}
	room.b.RemapSlots(remap)
	seenCommands := map[*battle.Command]bool{}
	remapCommand := func(c *battle.Command) {
		if c != nil && !seenCommands[c] {
			seenCommands[c] = true
			if slot, ok := remap[c.Target]; ok {
				c.Target = slot
			}
		}
	}
	for _, e := range room.members {
		remapCommand(e.fight.cmd)
		for _, slot := range e.fight.petSlots() {
			remapCommand(e.fight.petCommand(slot))
		}
	}
	for _, d := range all {
		remapCommand(d.command)
	}
	for slot := side*battle.SideOffset + 5; slot < side*battle.SideOffset+10; slot++ {
		room.b.F[slot] = nil
	}
	for _, e := range members {
		e.fight.pets = map[int]int{}
		e.fight.petCmds = map[int]*battle.Command{}
		e.fight.pet = -1
		e.fight.petCmd = nil
	}
	for _, d := range all {
		if d.slot < 0 {
			continue
		}
		ft := d.owner.fight
		pf := d.fighter
		if pf == nil {
			pf = w.petFighter(d.owner, d.bag, d.slot)
		}
		pf.Slot = d.slot
		pf.OwnerSlot = ft.slot
		pf.OwnerSet = true
		if d.oldSlot < 0 {
			room.b.Add(pf)
		} else {
			room.b.F[d.slot] = pf
		} // Add resets charge/KilledBy; never re-add an existing fighter.
		ft.pets[d.slot] = d.bag
		ft.petCmds[d.slot] = d.command
		if d.slot == ft.slot+5 {
			ft.pet = d.bag
			ft.petCmd = d.command
		}
	}
}

// captureNeeds 是 battle_event.c 的 NeedEnemy（_CAPTURE_FREES，含 _WOLF_TAKE_AXE）：
// 这些敌人模板（CHAR_PETID）要身上同时带着表里的每一种道具才抓得到，抓到后那些道具全部收走。
var captureNeeds = map[int][]int{
	524: {2456}, 961: {20219}, 953: {20223}, 962: {20222}, 777: {20253}, 796: {20247}, 812: {20259},
	1105: {1690, 1691, 1692}, 8: {1810}, 145: {2236}, 146: {2236},
}

// canCapture 是 BATTLE_CaptureItemCheck 加上 PET_createPetFromCharaIndex 的宠物栏空位检查。
func (w *World) canCapture(e *entity, d *battle.Fighter) bool {
	if d.Seed == nil || e.pets.free() < 0 {
		return false
	}
	for _, id := range captureNeeds[d.Seed.TempNo] {
		found := false
		for _, it := range e.inv {
			found = found || it != nil && it.ID == id
		}
		if !found {
			return false
		}
	}
	return true
}

// afterTurn 处理一回合里影响宠物栏的事：
// 捕获成功（BATTLE_Capture）：敌人变成宠物放进宠物栏，忠诚度最多 CHAR_DEFAULTMAXAI，收走必要道具（BATTLE_CaptureItemDelAll）；
// 宠物逃走（BATTLE_LostEscape）：改为休息，主人魅力 −1；
// 换宠物（BATTLE_PetIn / PetOut）：收回的宠物按离开战斗结算（settleRecalled），叫出的宠物成为出战的宠物（CHAR_DEFAULTPET）。
func (w *World) afterTurn(e *entity, ev []battle.Event) {
	ft := e.fight
	pets, items := false, false
	for _, x := range ev {
		actorBag, actorPet := ft.petBagSlot(x.Actor)
		targetBag, targetPet := ft.petBagSlot(x.Target)
		clearActive := func(bag int) {
			if e.pets.Battle == bag {
				e.pets.Battle = -1
			}
			e.pets.Standby &^= 1 << bag
		}
		switch {
		case x.Kind == battle.PetIn && x.Actor == ft.slot:
			if !targetPet {
				continue
			}
			for i, pf := range ft.b.Recalled { // Event.Target identifies the recalled slot; never borrow a teammate's or another bag's state.
				if pf.Slot == x.Target && ft.b.PetOwner(pf) == ft.slot {
					w.settleRecalled(e, ft, pf, targetBag)
					ft.b.Recalled = append(ft.b.Recalled[:i:i], ft.b.Recalled[i+1:]...)
					break
				}
			}
			delete(ft.pets, x.Target)
			delete(ft.petCmds, x.Target)
			clearActive(targetBag)
			if x.Target == ft.slot+5 {
				ft.pet = -1
				ft.petCmd = nil
			}
			pets = true
		case x.Kind == battle.PetOut && x.Actor == ft.slot:
			if ft.swapTo < 0 || ft.swapTo >= PetSlots || x.Target < 0 || x.Target >= battle.Slots || ft.b.PetOwner(ft.b.F[x.Target]) != ft.slot {
				continue
			}
			if x.Target == ft.slot+5 {
				ft.pet = ft.swapTo
			}
			e.pets.Battle = ft.swapTo
			if ft.pets == nil {
				ft.pets = map[int]int{}
			}
			ft.pets[x.Target] = ft.swapTo
			if ft.deployedPets == nil {
				ft.deployedPets = map[int]bool{}
			}
			ft.deployedPets[ft.swapTo] = true
			e.pets.Standby &^= 1 << ft.swapTo
			pets = true
		case x.Kind == battle.Capture && x.OK && x.Actor == ft.slot:
			t := ft.b.F[x.Target]
			p := petFromFighter(t, e.char.ID)
			p.VariableAI = 0
			if ai := battle.DefaultMaxAI - w.petLoyalty(e, p); ai < 0 {
				p.addVariableAI(ai * 100)
			}
			if w.addPet(e, p) < 0 {
				continue
			}
			pets = true
			for _, id := range captureNeeds[t.Seed.TempNo] {
				for i, it := range e.inv {
					if it != nil && it.ID == id {
						e.inv[i], items = nil, true
					}
				}
			}
		case x.Kind == battle.Vary && x.Actor == ft.slot && x.Consume:
			// 战斗中的变身（ITEM_metamo / MAGIC_Metamo）：对自己是变回来，对出战的宠物是变成它 x.Damage 秒
			if x.Target == ft.slot || !targetPet || e.pets.Pets[targetBag] == nil {
				e.metamo = nil
			} else {
				e.metamo = &metamoState{sprite: e.pets.Pets[targetBag].Sprite, until: w.now().Add(time.Duration(x.Damage) * time.Second), body: e.inv[data.SlotBody]}
			}
		case x.Kind == battle.Flee && actorPet:
			// 怯战 / 旅程伙伴 / 狂狮怒吼：宠物被赶回主人身边（BATTLE_PetDefaultExit，CHAR_DEFAULTPET = -1）
			clearActive(actorBag)
			pets = true
		case x.Kind == battle.Steal && x.OK && x.Target == ft.slot:
			if w.stolen(e, string(x.Result)) {
				items = true
			}
		case x.Kind == battle.Leave && actorPet:
			clearActive(actorBag)
			e.char.Charm = max(0, min(100, e.char.Charm+battle.CHFixPetEscape))
			pets = true
		case x.Fly > 0 && targetPet:
			// 宠物被击飞（BATTLE_UltimateExtra）：离开战斗、收回（CHAR_DEFAULTPET = -1），P_vs_E 扣忠诚度 AI_FIX_PETULTIMATE（主人 10 级以下减半）
			if pf := ft.b.F[x.Target]; pf != nil {
				pf.Escaped = true
			}
			clearActive(targetBag)
			if !ft.room.pvp && e.pets.Pets[targetBag] != nil {
				e.pets.Pets[targetBag].addVariableAI(battle.AIFixPetUltimate / deadDiv(e))
			}
			pets = true
		case x.Fly > 0 && x.Target == ft.slot:
			// 自己被击飞：宠物一起退场（BATTLE_PetDefaultExit），P_vs_E 扣魅力 CH_FIX_PLAYEULTIMATE 与出战宠物的忠诚度 AI_FIX_PLAYERULTIMATE；
			// 离开战斗与传回记录点在 resolveTurn → flownHome
			for _, slot := range ft.petSlots() {
				if pf := ft.b.F[slot]; pf != nil {
					pf.Escaped = true
				}
				bag, _ := ft.petBagSlot(slot)
				if !ft.room.pvp && e.pets.Pets[bag] != nil {
					e.pets.Pets[bag].addVariableAI(battle.AIFixPlayerUltimate / deadDiv(e))
				}
			}
			if !ft.room.pvp {
				e.char.Charm = max(0, min(100, e.char.Charm+battle.CHFixPlayerUltimate/deadDiv(e)))
			}
			pets = true
		}
	}
	if items {
		w.itemsChanged(e)
	}
	if pets {
		w.petsChanged(e)
	}
}

// deadDiv 是 BATTLE_NormalDeadExtra / UltimateExtra 的 levelflg：主人 10 级以下惩罚减半。
func deadDiv(e *entity) int {
	if e.char.Level <= 10 {
		return 2
	}
	return 1
}

// settlePet 在战斗结束时把出战宠物的状态写回宠物栏（任何结果都要做）：
// HP（倒下的回到 1，BATTLE_Exit）、这场累计的忠诚度变动（打主人的宠物、打倒敌人）、
// 倒下的惩罚（BATTLE_NormalDeadExtra：宠物倒下 AI_FIX_PETDEAD、主人倒下 AI_FIX_PLAYERDEAD，主人 10 级以下减半）。
func (w *World) settlePet(e *entity, ft *fight) {
	for _, slot := range ft.petSlots() {
		bag, _ := ft.petBagSlot(slot)
		w.settlePetAt(e, ft, ft.b.F[slot], bag, petKillsAt(ft, slot))
	}
	for _, retired := range ft.retiredPets {
		w.settlePetAt(e, ft, retired.fighter, retired.bag, retired.validKills())
	}
}
func (w *World) settlePetAt(e *entity, ft *fight, pf *battle.Fighter, bag int, kills []*battle.Fighter) {
	if pf == nil {
		return
	}
	p := e.pets.Pets[bag]
	if p == nil {
		return
	}
	div := 1
	if e.char.Level <= 10 {
		div = 2
	}
	// BATTLE_AddExp：每打倒一只，敌人等级比宠物高时 +AI_FIX_PETGOLDWIN，否则 +AI_FIX_PETWIN
	for _, f := range kills {
		if f.Level > pf.Level {
			pf.AIDelta += battle.AIFixPetGoldWin
		} else {
			pf.AIDelta += battle.AIFixPetWin
		}
	}
	p.addVariableAI(pf.AIDelta)
	if pf.HP <= 0 && !pf.Escaped && !ft.room.pvp { // 倒下的惩罚只有 P_vs_E
		p.addVariableAI(battle.AIFixPetDead / div)
		w.petDeathLoss(e, p)
	}
	if ft.b.F[ft.slot].HP <= 0 && !ft.room.pvp && !ft.b.F[ft.slot].Flown {
		p.addVariableAI(battle.AIFixPlayerDead / div)
	}
	p.HP = max(1, pf.HP)
}

// settleRecalled 是收回宠物时的 BATTLE_Exit：HP 写回（倒下的回到 1）、累计的忠诚度变动与倒下的惩罚；
// 打倒敌人的经验与忠诚度要到战斗结束时还在场才拿得到（BATTLE_AddExp），收回的宠物打倒的敌人不再算给这个位置；
// 经验共享时改算在主人名下（经验还是大家一起拿，忠诚度不给新叫出来的那只）。
func (w *World) settleRecalled(e *entity, ft *fight, pf *battle.Fighter, bag int) {
	for _, f := range ft.b.F {
		if f != nil && f.Enemy() && f.KilledBy == pf.Slot {
			f.KilledBy = -1
			if w.Rules.ShareExp {
				f.KilledBy = ft.slot
			}
		}
	}

	if bag < 0 || bag >= PetSlots || e.pets.Pets[bag] == nil {
		return
	}
	p := e.pets.Pets[bag]
	p.addVariableAI(pf.AIDelta)
	if pf.HP <= 0 && !pf.Escaped {
		div := 1
		if e.char.Level <= 10 {
			div = 2
		}
		p.addVariableAI(battle.AIFixPetDead / div)
		if !ft.room.pvp {
			w.petDeathLoss(e, p)
		}
	}
	p.HP = max(1, pf.HP)
}

// petDeathLoss 是额外新功能（rules.petDeathLoss）：宠物在对敌人的战斗里倒下时扣掉成长。
// 扣的量按 petLevelUp 的平均值算：每项基本状态扣 (成长率 + 2.5) × 档次倍率中间值 × petDeathLoss，不低于 1；原版只扣忠诚度，不扣成长。
func (w *World) petDeathLoss(e *entity, p *Pet) {
	n := w.Rules.PetDeathLoss
	if n <= 0 {
		return
	}
	rank := p.Rank
	if rank < 0 || rank > 5 {
		rank = 0
	}
	f := float64(rankRand[rank][0]+rankRand[rank][1]) / 2 * 0.01
	lose := func(v *int, grow int) { *v = max(1, *v-int((float64(grow)+2.5)*f*n)) }
	lose(&p.Vital, p.Alloc[0])
	lose(&p.Str, p.Alloc[1])
	lose(&p.Tgh, p.Alloc[2])
	lose(&p.Dex, p.Alloc[3])
	w.sysMsg(e, fmt.Sprintf("%s倒下了，成长减少了。", p.displayName()), colorYellow)
}

// petKills 是宠物打倒的敌人（BATTLE_AddExp 的 pBidList 是宠物时）。
func petKills(ft *fight) []*battle.Fighter { return petKillsAt(ft, ft.slot+5) }
func petKillsAt(ft *fight, slot int) []*battle.Fighter {
	pf := ft.b.F[slot]
	if !ft.ownsPetSlot(slot) || pf == nil {
		return nil
	}
	var out []*battle.Fighter
	for _, f := range ft.b.F {
		if f != nil && f.Enemy() && f.HP <= 0 && f.KilledBy == pf.Slot {
			out = append(out, f)
		}
	}
	return out
}

// petKillExp 是 BATTLE_AddExp 里宠物的那一份：打倒的敌人的经验按宠物与敌人的等级差折算。
func (w *World) petKillExp(ft *fight) int {
	exp := 0
	for _, f := range petKills(ft) {
		exp += battle.KillExp(f.Exp, ft.b.F[ft.slot+5].Level, f.Level)
	}
	return exp
}

// petResult：战斗结束时出战宠物拿经验、升级，回传结果窗口的一行（宠物倒下时拿不到）。
func (w *World) petResult(e *entity, ft *fight, exp int) []proto.PetResult {
	result := []proto.PetResult{}
	add := func(bag int, pf *battle.Fighter, n int) {
		if pf == nil || !pf.Alive() || e.pets.Pets[bag] == nil {
			return
		}
		p := e.pets.Pets[bag]
		from := p.Level
		ups := w.petGainExp(e, p, n)
		w.petFeed(e, p, from)
		result = append(result, proto.PetResult{Slot: bag, Name: p.displayName(), Exp: n, LevelUp: ups, Level: p.Level})
	}
	for _, slot := range ft.petSlots() {
		bag, _ := ft.petBagSlot(slot)
		pf := ft.b.F[slot]
		n := exp
		if !w.Rules.ShareExp {
			raw := 0
			for _, f := range petKillsAt(ft, slot) {
				raw += battle.KillExp(f.Exp, pf.Level, f.Level)
			}
			n = e.addExp.boost(w.Rules.scaleExp(raw))
		}
		add(bag, pf, n)
	}
	for _, retired := range ft.retiredPets {
		raw := 0
		for _, f := range retired.validKills() {
			raw += battle.KillExp(f.Exp, retired.fighter.Level, f.Level)
		}
		add(retired.bag, retired.fighter, e.addExp.boost(w.Rules.scaleExp(raw)))
	}
	return result
}

// stolen 是偷窃得手（BATTLE_Steal）：偷钱扣 RAND(8,12)%，偷道具是随机一件没装备的道具（直接消失，偷的人拿不到）；
// 没钱 / 没道具时什么也没偷到。回传道具栏有没有变。
func (w *World) stolen(e *entity, what string) bool {
	if what == "gold" {
		if e.char.Gold <= 0 {
			return false
		}
		lose := e.char.Gold * (8 + w.rnd.IntN(5)) / 100
		e.char.Gold -= lose
		w.sysMsg(e, e.char.Name+"被偷了一些东西。", colorWhite)
		w.sendInventory(e)
		return false
	}
	var bag []int
	for i := data.EquipSlots; i < data.ItemSlots; i++ {
		if e.inv[i] != nil {
			bag = append(bag, i)
		}
	}
	if len(bag) == 0 {
		return false
	}
	e.inv[bag[w.rnd.IntN(len(bag))]] = nil
	w.sysMsg(e, e.char.Name+"被偷了一些东西。", colorWhite)
	return true
}
