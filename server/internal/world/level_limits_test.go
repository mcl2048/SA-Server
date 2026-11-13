package world

import (
	"fmt"
	"slices"
	"strings"
	"testing"

	"sa/server/internal/data"
	"sa/server/internal/proto"
)

type levelLimitSessionClient struct {
	gmClient
	invalidations int
}

func (c *levelLimitSessionClient) InvalidateSession() { c.invalidations++ }

func TestGMPasswordChangeInvalidatesSessionAfterSuccess(t *testing.T) {
	w, db, _ := setup(t)
	w.GMs = map[string]bool{"sessiongm": true}
	gm := newChar(t, db, "sessiongm", 1000, 47, 82)
	player := newChar(t, db, "sessiontarget", 1000, 47, 82)
	w.Enter(gm, &gmClient{account: "sessiongm"})
	cl := &levelLimitSessionClient{gmClient: gmClient{account: "sessiontarget"}}
	w.Enter(player, cl)
	for _, command := range []string{"/setpw sessiontarget short", "/setsecret sessiontarget secretvalue"} {
		w.GmCommand(int(gm.ID), command)
	}
	w.Do(func() {
		if cl.invalidations != 0 {
			t.Error("failed password or secret-only update invalidated session")
		}
	})
	w.GmCommand(int(gm.ID), "/setpw sessiontarget new-password-value")
	w.Do(func() {
		if cl.invalidations != 1 {
			t.Errorf("successful password update invalidated %d times", cl.invalidations)
		}
	})
}

func TestIndependentLevelLimitsAndRetainedProgress(t *testing.T) {
	w, db, game := setup(t)
	c, _ := petOwner(t, w, db, "limits", 139, 100)
	w.Do(func() {
		e := w.players[int(c.ID)]
		w.Rules.CharMaxLevel, w.Rules.PetMaxLevel = 141, 202
		p := petFromFighter(enemyFighter(w, petEnemy(t, game, 1), 199, 15), c.ID)
		p.LimitLevel = 140 // legacy general cap must follow configured pet limit
		e.pets.Pets[0] = p
		charNeed := game.Battle.NextLevelExp(139) + game.Battle.NextLevelExp(140)
		if got := w.gainExp(e, charNeed+7); got != 2 || e.char.Level != 141 || e.char.Exp != 7 {
			t.Fatalf("character did not stop at independent cap: ups=%d level=%d exp=%d", got, e.char.Level, e.char.Exp)
		}
		if got := w.statusOf(e).NextExp; got != 0 {
			t.Fatalf("full character NextExp=%d", got)
		}
		petNeed := game.Battle.NextLevelExp(199) + game.Battle.NextLevelExp(200) + game.Battle.NextLevelExp(201)
		if got := w.petGainExp(nil, p, petNeed+11); got != 3 || p.Level != 202 || p.Exp != 11 {
			t.Fatalf("pet could not cross old table/cap: ups=%d level=%d exp=%d", got, p.Level, p.Exp)
		}
		if got := w.petInfo(e, 0).NextExp; got != 0 {
			t.Fatalf("full pet NextExp=%d", got)
		}
		w.Rules.CharMaxLevel, w.Rules.PetMaxLevel = 100, 90
		if got := w.gainExp(e, 5); got != 0 || e.char.Level != 141 || e.char.Exp != 12 {
			t.Fatalf("lower config destroyed character progress: %+v", e.char)
		}
		if got := w.petGainExp(nil, p, 5); got != 0 || p.Level != 202 || p.Exp != 16 {
			t.Fatalf("lower config destroyed pet progress: %+v", p)
		}
		if w.statusOf(e).NextExp != 0 || w.petInfo(e, 0).NextExp != 0 {
			t.Fatal("over-cap existing save should show no next level")
		}
		w.Rules.CharMaxLevel, w.Rules.PetMaxLevel = 142, 203
		if w.statusOf(e).NextExp <= 0 || w.petInfo(e, 0).NextExp <= 0 {
			t.Fatal("raising limits should reopen progression without changing saved level/experience")
		}
	})
}

func TestPetTemplateLimitsAndHighLevelCeiling(t *testing.T) {
	w, _, game := setup(t)
	w.Do(func() {
		w.Rules.PetMaxLevel = 1000
		for _, tc := range []struct{ template, want int }{{0, 1000}, {140, 1000}, {200, 1000}, {139, 139}, {50, 50}} {
			if got := w.petMaxLevel(&Pet{LimitLevel: tc.template}); got != tc.want {
				t.Errorf("template %d cap=%d want=%d", tc.template, got, tc.want)
			}
		}
		p := petFromFighter(enemyFighter(w, petEnemy(t, game, 1), 999, 15), 0)
		p.LimitLevel = 140
		if got := w.petGainExp(nil, p, game.Battle.NextLevelExp(999)+123); got != 1 || p.Level != 1000 || p.Exp != 123 {
			t.Fatalf("1000-level cap failed: ups=%d pet=%+v", got, p)
		}
		low := petFromFighter(enemyFighter(w, petEnemy(t, game, 1), 49, 15), 0)
		low.LimitLevel = 50
		if got := w.petGainExp(nil, low, game.Battle.NextLevelExp(49)+game.Battle.NextLevelExp(50)); got != 1 || low.Level != 50 {
			t.Fatalf("special template cap ignored: ups=%d level=%d", got, low.Level)
		}
		w.Rules.CharMaxLevel = 1000
		e := &entity{}
		e.char.Level = 999
		if got := w.gainExp(e, game.Battle.NextLevelExp(999)); got != 1 || e.char.Level != 1000 {
			t.Fatalf("character high cap failed: ups=%d level=%d", got, e.char.Level)
		}
	})
}

func TestLevelLimitsGMAndTemplateBoundedLoop(t *testing.T) {
	w, db, game := setup(t)
	w.GMs = map[string]bool{"limitgm": true}
	w.Rules.CharMaxLevel, w.Rules.PetMaxLevel, w.Rules.CharMaxTrans = 220, 230, 8
	c := newChar(t, db, "limitgm", 1000, 47, 82)
	cl := &gmClient{account: "limitgm"}
	w.Enter(c, cl)
	cl.take()
	id := int(c.ID)
	run := func(command string) string {
		t.Helper()
		w.GmCommand(id, command)
		w.Do(func() {})
		msg, ok := find[*proto.ChatMsg](cl.take())
		if !ok {
			t.Fatalf("no GM response for %s", command)
		}
		return msg.Text
	}
	run("/lv 220")
	run("/lv 221")
	w.Do(func() {
		if w.players[id].char.Level != 220 {
			t.Fatal("/lv did not respect configured max")
		}
	})
	run("/trans 8")
	run("/trans 9")
	w.Do(func() {
		if w.players[id].char.Trans != 8 {
			t.Fatal("/trans did not respect configured max")
		}
	})
	run("/trans 7")
	run("/tensei")
	w.Do(func() {
		if e := w.players[id]; e.char.Trans != 8 || e.char.Level != 1 {
			t.Fatalf("/tensei configured upper boundary failed: level=%d trans=%d", e.char.Level, e.char.Trans)
		}
	})
	run("/lv 100")
	run("/tensei")
	w.Do(func() {
		if w.players[id].char.Trans != 8 {
			t.Fatal("/tensei exceeded configured cap")
		}
		w.Rules.CharMaxTrans = 0
	})
	run("/trans 0")
	run("/tensei")
	w.Do(func() {
		if w.players[id].char.Trans != 0 {
			t.Fatal("disabled rebirth still allowed GM rebirth")
		}
	})
	ene := petEnemy(t, game, 1)
	run(fmt.Sprintf("/pet %d 229", ene.ID))
	run("/petlv 0 230")
	w.Do(func() {
		if p := w.players[id].pets.Pets[0]; p.Level != 230 {
			t.Fatalf("GM pet custom max failed: %d", p.Level)
		}
		p := w.players[id].pets.Pets[0]
		p.Level = 49
		p.LimitLevel = 50
		p.Exp = 0
	})
	run("/petlv 0 230") // must return even though requested level exceeds template cap
	w.Do(func() {
		if p := w.players[id].pets.Pets[0]; p.Level != 50 {
			t.Fatalf("GM template cap ignored: %d", p.Level)
		}
		w.Rules.PetMaxLevel = 1
	})
	run(fmt.Sprintf("/pet %d", ene.ID))
	w.Do(func() {
		if p := w.players[id].pets.Pets[1]; p.Level > 1 {
			t.Fatalf("GM default enemy level bypassed pet cap: %d", p.Level)
		}
		w.Rules.CharMaxLevel, w.Rules.PetMaxLevel = 220, 230
	})
	w.GmCommand(id, fmt.Sprintf("/encount %d 230", ene.ID))
	w.Do(func() {
		e := w.players[id]
		if e.fight == nil || e.fight.b.F[15].Level != 230 {
			t.Fatal("GM encounter rejected configured high level")
		}
		e.fight = nil
	})
}

func TestLevelLimitGMMetadataAndQuestGuidance(t *testing.T) {
	w, db, _ := setup(t)
	c, _ := petOwner(t, w, db, "limitquest", 100, 100)
	w.Do(func() {
		w.Rules.CharMaxLevel, w.Rules.PetMaxLevel, w.Rules.CharMaxTrans = 250, 280, 8
		for _, item := range w.gmMenuItems() {
			switch item.Cmd {
			case "/lv":
				if !strings.Contains(item.Hint, "250") {
					t.Error("GM character cap hint stale")
				}
			case "/petlv":
				if !strings.Contains(item.Hint, "280") {
					t.Error("GM pet cap hint stale")
				}
			case "/trans":
				if !strings.Contains(item.Hint, "8") || slices.Contains(item.Kinds, "opt:0|1|2|3|4|5") {
					t.Error("GM trans option hardcoded")
				}
			}
		}
		e := w.players[int(c.ID)]
		if got := w.questNeed(e, "LV>200", ""); got != "等级 201 以上" {
			t.Errorf("high-level quest hidden: %q", got)
		}
		w.Rules.CharMaxLevel = 140
		if got := w.questNeed(e, "LV>200", ""); got != "" {
			t.Errorf("unreachable quest should remain hidden: %q", got)
		}
		// Isolate quest data so one world's configured cap does not mutate shared assets.
		original := w.game
		copyGame := *original
		copyGame.Quests = []data.JobDaily{{ID: 9101, Rule: "LV>79&TRANS<6", Name: "转生引导"}, {ID: 9102, Rule: "LV>79&TRANS<6", Name: "精灵王"}, {ID: 9000, Rule: "LV>79&TRANS<6", Name: "普通任务"}}
		w.game = &copyGame
		defer func() { w.game = original }()
		e.char.Trans = 6
		logs := w.questLog(e)
		if len(logs) != 2 || logs[0].ID != 9101 || logs[1].ID != 9102 {
			t.Fatalf("configured guide cap or ordinary TRANS meaning broken: %+v", logs)
		}
		w.Rules.CharMaxTrans = 0
		if logs := w.questLog(e); len(logs) != 0 {
			t.Fatalf("disabled rebirth guides still present: %+v", logs)
		}
	})
}
