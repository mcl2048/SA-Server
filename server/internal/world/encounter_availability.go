package world

// canEncounter is a server-owned capability, not an optimistic client switch.
// It describes whether walking can currently start random encounters, including
// the same safety floor used by auto encounter. Random encounter chance remains
// authoritative in rollEncounter; true is permission, never a promised battle.
func (w *World) canEncounter(e *entity) bool {
	if e == nil || w.game == nil || w.game.Battle == nil || w.Rules.EncounterRate <= 0 ||
		e.fight != nil || e.watch != nil || e.isFollower() || e.trade != nil || e.stall != nil || e.buying != nil || e.window != nil {
		return false
	}
	area := w.game.Battle.AreaAt(e.floor, e.x, e.y)
	// Safe villages have real AreaAt rows with zero encounter probabilities and
	// no groups; area presence alone must never expose an encounter shortcut.
	if area == nil || area.ProbMax <= 0 || len(area.Groups) == 0 || w.encounterBlocked(e) {
		return false
	}
	hp := e.char.HP
	maxHP, _ := w.maxHPMP(e)
	if hp < 0 {
		hp = maxHP
	}
	return maxHP > 0 && hp*100 > maxHP*20
}

// Only attached consumers need capability updates. No packets or capability
// scans are added to detached farmers; attaching already sends a full snapshot.
func (w *World) refreshEncounterAvailability(e *entity) {
	if e == nil || !e.attached() {
		return
	}
	can := w.canEncounter(e)
	if !e.encounterCapabilityKnown || e.encounterCapability != can {
		e.encounterCapabilityKnown, e.encounterCapability = true, can
		w.sendAutoPlay(e)
	}
}
func (w *World) refreshEncounterConsumers() {
	for _, e := range w.players {
		w.refreshEncounterAvailability(e)
	}
}
