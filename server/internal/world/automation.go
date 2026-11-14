package world

import (
	"encoding/json"
	"slices"
	"strings"
	"time"

	"sa/server/internal/battle"
	"sa/server/internal/data"
	"sa/server/internal/proto"
)

// Automation is owned by the world, not the browser animation loop. It survives
// a detached transport, but not an explicit logout or a server restart.
type autoPlayState struct {
	encounter, autoBattle, quick, paused bool
	settings                             autoSettings
	reason                               string
	lastUpdate, nextMove, nextTurn       time.Time
	lastRoom                             *battleRoom
	lastTurn                             int
	direction                            int
	floor                                int
}
type autoAction struct {
	Kind   string `json:"kind"`
	Name   string `json:"name"`
	Target string `json:"target"`
}
type autoSettings struct {
	V        int        `json:"v"`
	HealAt   int        `json:"healAt"`
	Escape   bool       `json:"escape"`
	Magic    bool       `json:"magic"`
	Capture  bool       `json:"capture"`
	Meat     bool       `json:"meat"`
	First    autoAction `json:"first"`
	Then     autoAction `json:"then"`
	PetFirst autoAction `json:"petFirst"`
	PetThen  autoAction `json:"petThen"`
}

func defaultAutoSettings() autoSettings {
	return autoSettings{V: 2, HealAt: 30, Escape: true, Magic: true}
}
func parseAutoSettings(raw string) (autoSettings, bool) {
	s := defaultAutoSettings()
	if len(raw) > 16384 {
		return s, false
	}
	if raw != "" && json.Unmarshal([]byte(raw), &s) != nil {
		return s, false
	}
	if s.V != 2 || s.HealAt < 0 || s.HealAt > 100 {
		return s, false
	}
	for _, a := range []autoAction{s.First, s.Then, s.PetFirst, s.PetThen} {
		if len(a.Name) > 256 || !slices.Contains([]string{"", "auto", "attack", "guard", "magic", "skill"}, a.Kind) || !slices.Contains([]string{"", "auto", "self", "pet", "owner", "enemy", "allies", "enemies", "all"}, a.Target) {
			return s, false
		}
	}
	return s, true
}

// SetAutoPlay changes only this character's intent. No state supplied by the
// browser contains stats, turn numbers, rewards, or an authoritative position.
func (w *World) SetAutoPlay(charID int, encounter, autoBattle, quick, paused bool, settings string) {
	s, valid := parseAutoSettings(settings)
	w.Do(func() {
		e := w.players[charID]
		if e == nil {
			return
		}
		if !valid {
			w.sysMsg(e, "自动战斗设定无效，原挂机状态保持不变。", colorYellow)
			w.sendAutoPlay(e)
			return
		}
		a := e.automation
		if a == nil {
			a = &autoPlayState{direction: -1}
			e.automation = a
		}
		if encounter && !a.encounter {
			a.floor = e.floor
			a.direction = -1
			a.nextMove = w.now()
		}
		a.encounter, a.autoBattle, a.quick, a.paused = encounter, autoBattle, quick, paused
		a.lastUpdate = w.now()
		a.settings = s
		a.reason = ""
		if !autoBattle && !quick {
			a.lastRoom = nil
		}
		w.sendAutoPlay(e)
	})
}
func (w *World) sendAutoPlay(e *entity) {
	if e == nil || e.client == nil {
		return
	}
	a := e.automation
	if a == nil {
		e.client.Send(&proto.AutoPlayState{CanEncounter: w.canEncounter(e)})
		return
	}
	e.client.Send(&proto.AutoPlayState{CanEncounter: w.canEncounter(e), Encounter: a.encounter, AutoBattle: a.autoBattle, Quick: a.quick, Paused: a.paused && e.connected && w.now().Sub(a.lastUpdate) < 2*time.Second, Reason: a.reason})
}
func (w *World) stopAutomation(e *entity, reasons ...string) {
	if e == nil || e.automation == nil {
		return
	}
	reason := ""
	if len(reasons) > 0 {
		reason = reasons[0]
	}
	a := e.automation
	a.encounter, a.autoBattle, a.quick, a.paused = false, false, false, false
	a.reason = reason
	w.sendAutoPlay(e)
}

// manualAutomationMove is called only for a user-originated Move packet. The
// server's own pacing calls move directly and therefore cannot cancel itself.
func (w *World) manualAutomationMove(e *entity) {
	if e == nil || e.automation == nil || !e.automation.encounter {
		return
	}
	e.automation.encounter = false
	e.automation.direction = -1
	e.automation.reason = "手动移动，已停止自动遇敌。"
	w.sendAutoPlay(e)
}
func (w *World) automationTick(now time.Time) {
	for _, e := range w.players {
		a := e.automation
		if a == nil {
			continue
		}
		if e.fight != nil {
			if a.autoBattle || a.quick {
				w.automationBattle(e, a, now)
			}
			continue
		}
		if a.lastRoom != nil {
			a.lastRoom = nil
			a.nextMove = now.Add(time.Second)
			if a.settings.Meat {
				w.automationDiscardMeat(e)
			}
		}
		if !a.encounter || now.Before(a.nextMove) {
			continue
		}
		// A short lease pauses encounters while a live UI is being manipulated. A
		// frozen tab cannot leave a character paused forever; detach ignores it.
		if a.paused && e.connected && now.Sub(a.lastUpdate) < 2*time.Second {
			continue
		}
		if e.watch != nil || e.trade != nil || e.stall != nil || e.buying != nil || e.window != nil {
			continue
		}
		if e.party != nil && e.party.leader() != e {
			continue
		}
		hp := e.char.HP
		maxHP, _ := w.maxHPMP(e)
		if hp < 0 {
			hp = maxHP
		}
		if hp*100 <= maxHP*20 {
			a.encounter = false
			a.reason = "耐久力不足20%，已停止自动遇敌。"
			w.sendAutoPlay(e)
			continue
		}
		if e.floor != a.floor {
			a.encounter = false
			a.reason = "地图已改变，已停止自动遇敌。"
			w.sendAutoPlay(e)
			continue
		}
		dir := a.direction
		if dir < 0 || dir > 7 || !w.automationStepAllowed(e, dir) {
			dir = -1
			for i := 0; i < 8; i++ {
				if w.automationStepAllowed(e, i) {
					dir = i
					break
				}
			}
		}
		if dir < 0 {
			a.encounter = false
			a.reason = "附近没有可安全往返的格子，已停止自动遇敌。"
			w.sendAutoPlay(e)
			continue
		}
		a.nextMove = now.Add(time.Duration(w.clientStepMs()) * time.Millisecond)
		ox, oy := e.x, e.y
		w.move(e, e.x, e.y, dir)
		if e.floor == a.floor && (e.x != ox || e.y != oy) {
			// Manual moves are predicted locally, but automated steps originate
			// here and must also be delivered to the controlling browser.
			e.client.Send(&proto.ObjMove{ID: e.id, X: e.x, Y: e.y, Dir: e.dir})
			a.direction = (dir + 4) % 8
		}
	}
}
func (w *World) automationStepAllowed(e *entity, dir int) bool {
	nx, ny := e.x+MOVE[dir][0], e.y+MOVE[dir][1]
	if !w.game.Tiles.Walkable(w.game.Floors[e.floor], nx, ny) {
		return false
	}
	// Match manual movement and minimap routes: a diagonal step cannot squeeze
	// through blocked orthogonal neighbors, or automation would retry forever.
	if nx != e.x && ny != e.y && (!w.game.Tiles.Walkable(w.game.Floors[e.floor], nx, e.y) || !w.game.Tiles.Walkable(w.game.Floors[e.floor], e.x, ny)) {
		return false
	}
	if _, warp := w.game.WarpAt(e.floor, nx, ny); warp {
		return false
	}
	// Do not oscillate into an event NPC and repeatedly open scripted fights.
	for _, n := range w.floors[e.floor] {
		if n.npc != nil && n.x == nx && n.y == ny {
			return false
		}
	}
	return true
}
func (w *World) automationBattle(e *entity, a *autoPlayState, now time.Time) {
	ft := e.fight
	room := ft.room
	if room.pvp {
		return
	} // Player duels always require a player decision.
	if a.lastRoom != room || a.lastTurn != room.turn {
		a.lastRoom = room
		a.lastTurn = room.turn
		gap := 4 * time.Second
		if a.quick {
			gap = time.Second
		}
		a.nextTurn = now.Add(gap)
		return
	}
	if now.Before(a.nextTurn) {
		return
	}
	// Arm both intents before either validated submission can resolve the room.
	// Commands already submitted manually before enabling auto are left untouched.
	turn := room.turn
	player, _, _ := w.chooseAutomation(e, a)
	if ft.cmd != nil {
		player = *ft.cmd
	} // pets must honor a pre-existing manual capture/escape too
	for _, slot := range ft.petSlots() {
		if !ft.b.F[slot].Alive() {
			continue
		}
		skill, target := w.chooseAutomationPet(e, a, slot, player)
		w.submitBattlePetCommand(e, skill, target, true, slot)
		if e.fight != ft || room.turn != turn {
			return
		}
	}
	if ft.cmd == nil && ft.b.F[ft.slot].Alive() {
		w.battleCommand(e, string(player.Kind), player.Target, player.ItemSlot, true)
	}
	if e.fight == ft {
		a.nextTurn = now.Add(time.Second)
	}
}
func (w *World) automationDiscardMeat(e *entity) {
	changed := false
	for slot := data.EquipSlots; slot < data.ItemSlots; slot++ {
		it := e.inv[slot]
		if it == nil {
			continue
		}
		def := w.game.Items[it.ID]
		if def != nil && def.Image >= 24000 && def.Image <= 24044 {
			e.inv[slot] = nil
			changed = true
		}
	}
	if changed {
		w.itemsChanged(e)
		w.saveProgress(e)
	}
}

// The server strategy shares the v2 action plans and emergency rules with the
// browser AI, but deliberately uses current authoritative stats instead of a
// browser's local learned damage history.
func (w *World) chooseAutomation(e *entity, a *autoPlayState) (battle.Command, int, int) {
	ft := e.fight
	me := ft.b.F[ft.slot]
	pet := ft.b.F[ft.slot+5]
	s := a.settings
	// A dead owner has no action this round. Do not manufacture an escape
	// intent from HP=0: pets still own independent turns and must keep fighting.
	if !me.Alive() && petCanActWithoutOwner(ft) {
		cmd := battle.Command{Kind: battle.Guard, Target: -1}
		skill, target := w.chooseAutomationPet(e, a, ft.slot+5, cmd)
		return cmd, skill, target
	}
	protected, myCapture := w.automationCapturePlan(e, a)
	enemies, allies := []*battle.Fighter{}, []*battle.Fighter{}
	for _, f := range ft.b.F {
		// Fallen allies remain resurrection candidates; flown allies have left
		// this battle and must not consume every automatic turn on a futile revive.
		if f == nil || f.Escaped || f.Flown {
			continue
		}
		if f.Side() == me.Side() {
			allies = append(allies, f)
		} else if f.Alive() {
			enemies = append(enemies, f)
		}
	}
	target := -1
	bestScore := -1.0
	for _, f := range enemies {
		if protected&(1<<f.Slot) != 0 {
			continue
		}
		score := float64(min(max(1, me.Atk/2), f.HP)) + float64(f.Level)*.75
		if me.Atk/2 >= f.HP {
			score += float64(f.Level) * 5
		}
		if score > bestScore {
			bestScore = score
			target = f.Slot
		}
	}
	cmd := battle.Command{Kind: battle.Attack, Target: target, ItemSlot: -1}
	if target < 0 {
		cmd.Kind = battle.Guard
	}
	side, other := 20+me.Side(), 21-me.Side()
	// Estimate pressure conservatively when no browser-learned history exists.
	threat, hpSum := 0, 0
	for _, f := range enemies {
		threat += f.Level*2 + 10
	}
	for _, f := range allies {
		if f.Alive() {
			hpSum += f.HP
		}
	}
	var needs []*battle.Fighter
	for _, f := range allies {
		if f.Alive() && (f.HP*100 < f.MaxHP*s.HealAt ||
			f.Ride != nil && f.Ride.HP > 0 && !f.Ride.Fell && f.Ride.HP*100 < f.Ride.MaxHP*s.HealAt) {
			needs = append(needs, f)
		}
	}
	// An injured pet may be outside a self-only spirit's scope. Try the next
	// injured ally instead of allowing that pet to block the owner's recovery.
	slices.SortStableFunc(needs, func(a, b *battle.Fighter) int {
		x, y := automationHealthRatio(a), automationHealthRatio(b)
		if x < y {
			return -1
		}
		if x > y {
			return 1
		}
		return 0
	})
	for _, need := range needs {
		if c, ok := w.automationRecovery(e, need, false); ok {
			cmd = c
			goto petChoice
		}
	}
	for _, f := range allies {
		if !f.Alive() && f.Slot != me.Slot {
			if c, ok := w.automationRecovery(e, f, true); ok {
				cmd = c
				goto petChoice
			}
		}
	}
	for _, f := range allies {
		if f.Alive() && f.Status() != battle.StNone {
			if c, ok := w.automationCure(e, f); ok {
				cmd = c
				goto petChoice
			}
		}
	}
	if c, ok := w.automationMP(e, me, needs...); ok {
		cmd = c
		goto petChoice
	}
	if s.Escape && roomCanEscape(w, e) && (me.HP*5 < me.MaxHP || threat*2 > hpSum && threat > me.Atk*2) {
		cmd = battle.Command{Kind: battle.Escape, Target: -1}
		goto petChoice
	}
	if s.Capture {
		if myCapture >= 0 {
			cmd = battle.Command{Kind: battle.Capture, Target: myCapture}
			goto petChoice
		}
		if protected != 0 {
			cmd = battle.Command{Kind: battle.Guard, Target: -1}
			goto petChoice
		}
		if roomCanEscape(w, e) {
			cmd = battle.Command{Kind: battle.Escape, Target: -1}
			goto petChoice
		}
	}
	{
		action := s.Then
		if roomFirstTurn(ft.room) {
			action = s.First
		}
		if action.Kind == "guard" {
			cmd = battle.Command{Kind: battle.Guard, Target: -1}
			goto petChoice
		}
		if action.Kind == "magic" {
			for slot := 0; slot < data.EquipSlots; slot++ {
				m, mp := w.equipMagic(e, slot)
				if m != nil && m.Name == action.Name && m.Field != 2 && mp <= me.MP {
					t := automationMagicTarget(m.Target, action.Target, me, pet, target, side, other)
					if t >= 0 && !automationCaptureInScope(protected, t) {
						cmd = battle.Command{Kind: battle.Magic, Target: t, ItemSlot: slot}
						goto petChoice
					}
				}
			}
		}
		if s.Magic && action.Kind != "attack" {
			count := len(enemies)
			for slot := 0; slot < data.EquipSlots; slot++ {
				m, mp := w.equipMagic(e, slot)
				if m != nil && m.Func == "MAGIC_AttMagic" && m.Field != 2 && mp <= me.MP && count >= 2 {
					t := automationMagicTarget(m.Target, "enemy", me, pet, target, side, other)
					if t >= 0 && !automationCaptureInScope(protected, t) {
						cmd = battle.Command{Kind: battle.Magic, Target: t, ItemSlot: slot}
						break
					}
				}
			}
		}
	}
petChoice:
	skill, pt := w.chooseAutomationPet(e, a, ft.slot+5, cmd)
	return cmd, skill, pt
}

// Only automatic PvE decisions may ignore an incapacitated owner's intent.
// A surviving pet still owns its action, in solo play and in a party alike.
// PvP and manually submitted commands keep their existing validation rules.
func petCanActWithoutOwner(ft *fight) bool {
	return ft != nil && ft.room != nil && !ft.room.pvp
}

func (w *World) chooseAutomationPet(e *entity, a *autoPlayState, slot int, cmd battle.Command) (int, int) {
	ft := e.fight
	me, pet := ft.b.F[ft.slot], ft.b.F[slot]
	s := a.settings
	side, other := 20+me.Side(), 21-me.Side()
	protected, _ := w.automationCapturePlan(e, a)
	enemies := []*battle.Fighter{}
	target := -1
	for _, f := range ft.b.F {
		if f != nil && f.Alive() && f.Side() != me.Side() && protected&(1<<f.Slot) == 0 {
			enemies = append(enemies, f)
			if target < 0 || f.HP < ft.b.F[target].HP {
				target = f.Slot
			}
		}
	}
	skill, pt := -1, target
	if _, owned := ft.petBagSlot(slot); !owned || !pet.Alive() {
		return skill, pt
	}
	// Emergency capture/escape plans override fixed pet actions too: otherwise
	// an explicit attack plan could kill the enemy the owner is capturing.
	ownerDown := !me.Alive() && petCanActWithoutOwner(ft)
	if !ownerDown && (cmd.Kind == battle.Capture || cmd.Kind == battle.Escape) {
		for slot, sk := range pet.Skills {
			if sk != nil && sk.Field != 2 && sk.Func == "PETSKILL_ShowMercy" && cmd.Kind == battle.Capture {
				return slot, cmd.Target
			}
		}
		for slot, sk := range pet.Skills {
			if sk != nil && sk.Field != 2 && sk.ID == 2 {
				return slot, pet.Slot
			}
		}
		return -1, -1
	}
	if target < 0 {
		for slot, sk := range pet.Skills {
			if sk != nil && (sk.Field == 0 || sk.Field == 1) && sk.ID == 2 {
				return slot, pet.Slot
			}
		}
		return -1, -1
	}
	action := s.PetThen
	if roomFirstTurn(ft.room) {
		action = s.PetFirst
	}
	for slot, sk := range pet.Skills {
		if sk == nil || sk.Field == 2 {
			continue
		}
		match := action.Kind == "attack" && sk.ID == 1 || action.Kind == "guard" && sk.ID == 2 || action.Kind == "skill" && sk.Name == action.Name
		if match && !(ownerDown && (sk.Func == "PETSKILL_Guardian" || action.Target == "owner")) {
			t := automationPetTarget(sk.Target, action.Target, me.Slot, pet.Slot, target, side, other)
			if !automationPetCaptureInScope(sk, protected, t, other) {
				return slot, t
			}
		}
	}
	// Score only known combat skills. Stealing, sacrifice, transforming and
	// leaving the field are not selected implicitly by server automation.
	bestPet := -1.0
	for slot, sk := range pet.Skills {
		if sk == nil || sk.Field == 2 {
			continue
		}
		if sk.Func == "PETSKILL_Guardian" && !ownerDown && me.HP*100 < me.MaxHP*s.HealAt {
			return slot, me.Slot
		}
		if sk.ID == 2 && pet.HP*100 < pet.MaxHP*15 {
			return slot, pet.Slot
		}
		factor := automationSkillFactor(sk)
		if factor <= 0 {
			continue
		}
		t := automationPetTarget(sk.Target, "enemy", me.Slot, pet.Slot, target, side, other)
		if sk.Func != data.PrimalCrossFunc && automationPetCaptureInScope(sk, protected, t, other) {
			continue
		}
		value := factor
		if sk.Func == data.PrimalCrossFunc {
			// A cross is not a whole-side skill. Evaluate each real center,
			// including capture scope, instead of multiplying by all enemies.
			value, t = -1, -1
			for _, center := range enemies {
				if automationPetCaptureInScope(sk, protected, center.Slot, other) {
					continue
				}
				score := 0.0
				for _, hit := range battle.PrimalCrossSlots(center.Slot) {
					if f := ft.b.F[hit]; f.Alive() && f.Side() != pet.Side() {
						score += factor
					}
				}
				// Defensive utility makes an initial solo cast useful; while
				// the buff persists, the actual .8 damage score stands alone.
				if pet.DefenseTurns() == 0 {
					score += .3
				}
				if score > value {
					value, t = score, center.Slot
				}
			}
			if t < 0 {
				continue
			}
		}
		if sk.Target == 3 || sk.Target == 4 {
			value *= float64(len(enemies))
		}
		if value > bestPet {
			bestPet, skill, pt = value, slot, t
		}
	}
	return skill, pt
}
func automationSkillFactor(sk *data.Skill) float64 {
	if sk.Func == data.PrimalCrossFunc {
		return .8
	}
	if sk.Func == data.ElectromagneticCannonFunc {
		return .825 // Five independent 15..18% single shots; no enemy-count gain.
	}
	if sk.Func == data.GhostStormFunc {
		// The caller multiplies whole-side scores by eligible enemy count.
		// Use its actual per-target damage; petrification is a bonus, not a
		// reason to prefer 75% damage over an ordinary hit on one opponent.
		return .75
	}
	if !slices.Contains([]string{"PETSKILL_NormalAttack", "PETSKILL_ContinuationAttack", "PETSKILL_ChargeAttack", "PETSKILL_Mighty", "PETSKILL_PowerBalance", "PETSKILL_StatusChange", "PETSKILL_GuardBreak2", "PETSKILL_WildViolentAttack", "PETSKILL_DamageToHp", "PETSKILL_AttackMagic", "PETSKILL_WholeAttack"}, sk.Func) {
		return 0
	}
	factor := 1.0
	if i := strings.Index(sk.Option, "攻%"); i >= 0 {
		factor += float64(data.Atoi(sk.Option[i+len("攻%"):])) / 100
	}
	if sk.Func == "PETSKILL_ContinuationAttack" {
		factor *= float64(max(1, data.Atoi(sk.Option))) * .6
	}
	if sk.Func == "PETSKILL_ChargeAttack" {
		factor *= .5
	}
	return max(.1, factor)
}

func automationPetCaptureInScope(sk *data.Skill, mask uint32, target, other int) bool {
	if sk.Func == data.PrimalCrossFunc && target >= 0 && target < battle.Slots {
		for _, slot := range battle.PrimalCrossSlots(target) {
			if mask&(1<<slot) != 0 {
				return true
			}
		}
		return false
	}
	if sk.Func == data.ElectromagneticCannonFunc {
		// Its UI target is single, but any of five random shots can reach
		// every opponent. A safe initial target cannot promise capture safety.
		target = other
	}
	return automationCaptureInScope(mask, target)
}
func roomFirstTurn(room *battleRoom) bool { return room.turn == 0 }
func roomCanEscape(w *World, e *entity) bool {
	return e.fight.room.npc == nil && !e.fight.room.pvp && !slices.Contains(w.Rules.NoEscapeFloors, e.floor)
}
func automationMagicTarget(kind int, want string, me, pet *battle.Fighter, enemy, side, other int) int {
	single := me.Slot
	if want == "enemy" {
		single = enemy
	}
	if want == "pet" {
		if !pet.Alive() {
			return -1
		}
		single = pet.Slot
	}
	switch kind {
	case 0:
		return me.Slot
	case 1:
		return single
	case 2:
		return side
	case 8:
		if want == "enemies" {
			return other
		}
		return side
	case 3, 11:
		return other
	case 4:
		return 22
	case 9:
		return enemy
	case 10:
		if enemy < 0 {
			return -1
		}
		return []int{26, 25, 23, 24}[enemy/5]
	}
	return single
}
func automationPetTarget(kind int, want string, me, pet, enemy, side, other int) int {
	switch kind {
	case 0, 5:
		return pet
	case 2:
		return side
	case 3:
		return other
	case 4:
		return 22
	case 1, 6:
		if want == "owner" {
			return me
		}
		if want == "self" && kind == 1 {
			return pet
		}
	}
	return enemy
}

// Native recovery splits HP between rider and mount. A low active mount must
// trigger the same threshold; a fallen mount is no longer a healing target.
func automationHealthRatio(f *battle.Fighter) float64 {
	ratio := float64(f.HP) / float64(max(1, f.MaxHP))
	if f.Ride != nil && f.Ride.HP > 0 && !f.Ride.Fell {
		ratio = min(ratio, float64(f.Ride.HP)/float64(max(1, f.Ride.MaxHP)))
	}
	return ratio
}

// Match battle.ITEM_useRecovery's HP-first branch, including mixed dishes.
// Descriptions can mention MP even when combat executes only the HP effect.
func automationItemRecovers(d *data.ItemDef, mp bool) bool {
	if d.UseFunc != "ITEM_useRecovery" {
		return false
	}
	key := "体"
	if mp {
		if strings.Contains(d.Argument, key) {
			return false
		}
		key = "气"
	}
	_, tail, found := strings.Cut(d.Argument, key)
	amount := data.Atoi(tail)
	return found && (amount > 0 || !mp && amount == -1)
}

func (w *World) automationRecovery(e *entity, target *battle.Fighter, revive bool) (battle.Command, bool) {
	me := e.fight.b.F[e.fight.slot]
	best, bestAmount, bestMP := -1, 0, 0
	deficit := max(1, target.MaxHP-target.HP)
	if target.Ride != nil && target.Ride.HP > 0 && !target.Ride.Fell {
		deficit += max(0, target.Ride.MaxHP-target.Ride.HP)
	}
	for slot := 0; slot < data.EquipSlots; slot++ {
		m, mp := w.equipMagic(e, slot)
		if m == nil || m.Field == 2 || mp > me.MP || me.Status() == battle.StNocast {
			continue
		}
		valid := !revive && (m.Func == "MAGIC_Recovery" || m.Func == "MAGIC_OtherRecovery") || revive && (m.Func == "MAGIC_Ressurect" || m.Func == "MAGIC_ResAndDef")
		if !valid || m.Target == 0 && target.Slot != me.Slot {
			continue
		}
		amount := data.Atoi(m.Option)
		if revive && amount <= 0 {
			amount = target.MaxHP
		}
		if amount <= 0 {
			continue
		}
		// Prefer the smallest estimated sufficient heal, then the largest
		// insufficient one. Equal recovery favors lower actual MP consumption.
		better := best < 0 || amount >= deficit && (bestAmount < deficit || amount < bestAmount) || amount < deficit && bestAmount < deficit && amount > bestAmount || amount == bestAmount && mp < bestMP
		if better {
			best, bestAmount, bestMP = slot, amount, mp
		}
	}
	if best >= 0 {
		m, _ := w.equipMagic(e, best)
		t := target.Slot
		if m.Target == data.MagicTargetAllMySide || m.Target == data.MagicTargetWholeOtherSide {
			t = 20 + me.Side()
		}
		return battle.Command{Kind: battle.Magic, Target: t, ItemSlot: best}, true
	}
	for slot := data.EquipSlots; slot < data.ItemSlots; slot++ {
		it := e.inv[slot]
		if it == nil {
			continue
		}
		d := w.game.Items[it.ID]
		if d == nil || d.Field == 2 || !itemTargetValid(d, target.Slot, me.Slot) {
			continue
		}
		valid := !revive && automationItemRecovers(d, false) || revive && d.UseFunc == "ITEM_useRessurect"
		if valid {
			return battle.Command{Kind: battle.UseItem, Target: target.Slot, ItemSlot: slot}, true
		}
	}
	return battle.Command{}, false
}
func (w *World) automationCure(e *entity, target *battle.Fighter) (battle.Command, bool) {
	ch := map[int]string{1: "毒", 2: "麻", 3: "眠", 4: "石", 5: "醉", 6: "乱", 8: "毒", 9: "障"}[target.Status()]
	if ch == "" {
		return battle.Command{}, false
	}
	me := e.fight.b.F[e.fight.slot]
	if me.Status() == battle.StNocast {
		return battle.Command{}, false
	}
	for slot := 0; slot < data.EquipSlots; slot++ {
		m, mp := w.equipMagic(e, slot)
		if m != nil && m.Field != 2 && mp <= me.MP && m.Func == "MAGIC_StatusRecovery" && (strings.Contains(m.Option, "全") || strings.Contains(m.Option, ch)) {
			t := target.Slot
			if m.Target == data.MagicTargetAllMySide || m.Target == data.MagicTargetWholeOtherSide {
				t = 20 + me.Side()
			}
			return battle.Command{Kind: battle.Magic, Target: t, ItemSlot: slot}, true
		}
	}
	return battle.Command{}, false
}
func (w *World) automationMP(e *entity, me *battle.Fighter, needs ...*battle.Fighter) (battle.Command, bool) {
	if me.Status() == battle.StNocast {
		return battle.Command{}, false
	}
	cheapest := int(^uint(0) >> 1)
	for slot := 0; slot < data.EquipSlots; slot++ {
		m, mp := w.equipMagic(e, slot)
		if m != nil && m.Field != 2 && data.Atoi(m.Option) > 0 && mp <= me.MaxMP && (m.Func == "MAGIC_Recovery" || m.Func == "MAGIC_OtherRecovery") {
			// A cheap self-only spirit cannot restore an injured pet. Reserve MP
			// for a spirit that can reach at least one current recovery candidate.
			if len(needs) > 0 && !slices.ContainsFunc(needs, func(f *battle.Fighter) bool {
				return m.Target != data.MagicTargetMyself || f.Slot == me.Slot
			}) {
				continue
			}
			cheapest = min(cheapest, mp)
		}
	}
	if cheapest == int(^uint(0)>>1) || me.MP >= cheapest || me.MP >= me.MaxMP {
		return battle.Command{}, false
	}
	for slot := data.EquipSlots; slot < data.ItemSlots; slot++ {
		it := e.inv[slot]
		if it == nil {
			continue
		}
		d := w.game.Items[it.ID]
		if d != nil && d.Field != 2 && automationItemRecovers(d, true) && itemTargetValid(d, me.Slot, me.Slot) {
			return battle.Command{Kind: battle.UseItem, Target: me.Slot, ItemSlot: slot}, true
		}
	}
	return battle.Command{}, false
}
