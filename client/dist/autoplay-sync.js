// Local switch intent and ordered AutoPlayState confirmations on one connection.
// The protocol has no request id: pending sends are matched in WebSocket order.

const flags = (s               )                => ({ encounter: !!s.encounter, autoBattle: !!s.autoBattle, quick: !!s.quick });
const same = (a               , b               ) => a.encounter === b.encounter && a.autoBattle === b.autoBattle && a.quick === b.quick;

export class AutoPlayIntent {
          desired                       = null;
          revision = 0;
          dirty = false;
          pending                                               = [];

  reset() { this.desired = null; this.revision = 0; this.dirty = false; this.pending = []; }

  local(state               ) {
    const next = flags(state);
    if (!this.desired || !same(this.desired, next)) {
      this.desired = next; this.revision++; this.dirty = true;
    }
  }

  sent(state               ) {
    this.local(state);
    this.pending.push({ flags: flags(state), revision: this.revision });
  }

  receive(state                                     )                {
    const actual = flags(state);
    if (!this.desired) {
      this.desired = actual; this.dirty = false;
      return { ...actual }; // First state after login/resume is authoritative.
    }
    if (state.reason) {
      // Safety stops are authoritative. Keep older pending sends so their
      // following acknowledgements cannot re-enable a stopped switch.
      this.desired = actual; this.revision++; this.dirty = false;
      return { ...actual };
    }
    const match = this.pending.findIndex((p) => same(p.flags, actual));
    if (match >= 0) {
      const acknowledged = this.pending[match];
      this.pending.splice(0, match + 1);
      if (acknowledged.revision < this.revision) return { ...this.desired };
      this.desired = actual; this.dirty = false;
      return { ...actual };
    }
    if (!this.dirty && this.pending.length === 0) this.desired = actual;
    return { ...this.desired };
  }
}

// Pending enable must not run the legacy client AI; pending disable waits for
// server confirmation before exposing manual commands for the same turn.
export const serverOwnsAutoTurn = (wanted               , actual               )          =>
  wanted.autoBattle || wanted.quick || actual.autoBattle || actual.quick;

export const BATTLE_AUTO_ACTIONS = ["battle-auto-toggle", "battle-quick-toggle"]         ;

/** Both ordinary battle and quick battle over the field expose the same hits. */
export function drawAutoPlayToggles(ui          , auto         , quick         , toggleAuto            , toggleQuick            ) {
  if (ui.textButton(20, 20, auto ? "自动：开" : "自动：关", "#ffea39", BATTLE_AUTO_ACTIONS[0])) toggleAuto();
  if (ui.textButton(150, 20, quick ? "快速：开" : "快速：关", "#ffea39", BATTLE_AUTO_ACTIONS[1])) toggleQuick();
}
