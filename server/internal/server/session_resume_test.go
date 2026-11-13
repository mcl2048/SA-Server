package server

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/coder/websocket"
	"sa/server/internal/data"
	"sa/server/internal/proto"
	"sa/server/internal/store"
	"sa/server/internal/world"
)

func resumeRig(t *testing.T) (*Server, *world.World, store.Character, string) {
	t.Helper()
	game, err := data.Load("../../../gamedata")
	if err != nil {
		t.Fatal(err)
	}
	db, err := store.OpenSQLite(filepath.Join(t.TempDir(), "resume.db"))
	if err != nil {
		t.Fatal(err)
	}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	w := world.New(game, db, log, 1)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { w.Run(ctx); close(done) }()
	account, err := db.CreateAccount(ctx, "resumeuser", strings.Repeat("a", 32), strings.Repeat("b", 32))
	if err != nil {
		t.Fatal(err)
	}
	home := data.Hometowns[0]
	char, err := db.CreateCharacter(ctx, store.Character{AccountID: account.ID, Name: "续接测试", Sprite: 100000, Level: 1, Floor: home.Floor, X: home.X, Y: home.Y})
	if err != nil {
		t.Fatal(err)
	}
	srv := &Server{Lines: []*Line{{ID: 1, Group: "Test", Name: "One", World: w}}, Store: db, Log: log}
	http := httptest.NewServer(srv)
	t.Cleanup(func() { http.Close(); cancel(); <-done; db.Close() })
	return srv, w, char, "ws" + strings.TrimPrefix(http.URL, "http")
}
func resumeSocket(t *testing.T, url string) *websocket.Conn {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	c, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { c.CloseNow() })
	resumeRead(t, c, "Hello")
	return c
}
func resumeWrite(t *testing.T, c *websocket.Conn, m proto.Message) {
	t.Helper()
	b, err := proto.Encode(m)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err = c.Write(ctx, websocket.MessageText, b); err != nil {
		t.Fatal(err)
	}
}
func resumeRead(t *testing.T, c *websocket.Conn, kind string) map[string]any {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	for {
		_, b, err := c.Read(ctx)
		if err != nil {
			t.Fatalf("waiting %s: %v", kind, err)
		}
		var m map[string]any
		if err = json.Unmarshal(b, &m); err != nil {
			t.Fatal(err)
		}
		if m["t"] == kind {
			return m
		}
		if m["t"] == "Error" {
			t.Fatalf("unexpected error waiting %s: %v", kind, m)
		}
	}
}
func resumeEventually(t *testing.T, check func() bool) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for !check() {
		if time.Now().After(deadline) {
			t.Fatal("state transition timed out")
		}
		time.Sleep(time.Millisecond)
	}
}

func TestSessionDisconnectResumeTakeoverAndLogout(t *testing.T) {
	srv, w, char, url := resumeRig(t)
	first := resumeSocket(t, url)
	resumeWrite(t, first, &proto.Login{Account: "resumeuser", Password: strings.Repeat("a", 32)})
	auth := resumeRead(t, first, "AuthResult")
	if auth["ok"] != true {
		t.Fatal(auth)
	}
	marker := resumeRead(t, first, "Session")
	token := marker["token"].(string)
	if len(token) != 43 || marker["inWorld"] == true {
		t.Fatal(marker)
	}
	resumeRead(t, first, "ServerList")
	resumeWrite(t, first, &proto.SelectLine{ID: 1})
	resumeRead(t, first, "LineSelected")
	resumeWrite(t, first, &proto.CharEnter{ID: int(char.ID)})
	resumeRead(t, first, "Self")
	resumeRead(t, first, "EnterFloor")
	if w.Online() != 1 {
		t.Fatal("character never entered")
	}
	first.CloseNow()
	resumeEventually(t, func() bool {
		srv.mu.Lock()
		state := srv.accounts[char.AccountID]
		srv.mu.Unlock()
		state.mu.Lock()
		defer state.mu.Unlock()
		return srv.online[char.ID].controller == nil
	})
	if w.Online() != 1 {
		t.Fatal("closing browser removed character")
	}
	w.Turn(int(char.ID), 6)
	second := resumeSocket(t, url)
	resumeWrite(t, second, &proto.Resume{Token: token})
	marker = resumeRead(t, second, "Session")
	if marker["token"] != token || marker["resumed"] != true || marker["inWorld"] != true {
		t.Fatal(marker)
	}
	resumeRead(t, second, "Self")
	floor := resumeRead(t, second, "EnterFloor")
	if floor["dir"] != float64(6) {
		t.Fatal("resume reloaded stale character", floor)
	}
	third := resumeSocket(t, url)
	resumeWrite(t, third, &proto.Login{Account: "resumeuser", Password: strings.Repeat("a", 32)})
	resumeRead(t, third, "AuthResult")
	marker = resumeRead(t, third, "Session")
	replacement := marker["token"].(string)
	if replacement == token || marker["inWorld"] == true {
		t.Fatal(marker)
	}
	// Password login stays in the lobby and leaves the first character alone.
	resumeRead(t, third, "ServerList")
	resumeWrite(t, second, &proto.Turn{Dir: 3})
	resumeWrite(t, second, &proto.Ping{Seq: 90})
	resumeRead(t, second, "Pong")
	resumeWrite(t, third, &proto.SelectLine{ID: 1})
	resumeRead(t, third, "LineSelected")
	resumeWrite(t, third, &proto.CharList{})
	listing := resumeRead(t, third, "CharListResult")
	listed := listing["chars"].([]any)[0].(map[string]any)
	if listed["online"] != true {
		t.Fatal(listing)
	}
	resumeWrite(t, third, &proto.CharDelete{ID: int(char.ID)})
	if e := resumeRead(t, third, "Error"); e["code"] != "in_use" {
		t.Fatal(e)
	}
	resumeWrite(t, third, &proto.CharEnter{ID: int(char.ID)})
	resumeRead(t, third, "Self")
	resumeRead(t, third, "EnterFloor")
	if w.Online() != 1 {
		t.Fatal("takeover duplicated world entity")
	}
	closeCtx, closeCancel := context.WithTimeout(context.Background(), 3*time.Second)
	for {
		_, _, err := second.Read(closeCtx)
		if err != nil {
			if websocket.CloseStatus(err) != websocket.StatusPolicyViolation || !strings.Contains(err.Error(), "session_replaced") {
				t.Fatalf("takeover lost terminal close reason: %v", err)
			}
			break
		}
	}
	closeCancel()
	invalid := resumeSocket(t, url)
	resumeWrite(t, invalid, &proto.Resume{Token: token})
	failure := resumeRead(t, invalid, "Error")
	if failure["code"] != "resume_failed" {
		t.Fatal(failure)
	}
	// Old transport teardown runs after the replacement has attached, and must
	// never detach/Leave the new controller.
	second.CloseNow()
	if w.Online() != 1 {
		t.Fatal("old transport teardown removed replacement")
	}
	resumeWrite(t, third, &proto.Logout{})
	marker = resumeRead(t, third, "Session")
	if marker["token"] != nil && marker["token"] != "" {
		t.Fatal(marker)
	}
	if w.Online() != 1 {
		t.Fatal("account logout stopped background character")
	}
	resumeWrite(t, invalid, &proto.Resume{Token: replacement})
	failure = resumeRead(t, invalid, "Error")
	if failure["code"] != "resume_failed" {
		t.Fatal(failure)
	}
}

func TestResumeTokenOpaqueAndRevokedByPasswordReset(t *testing.T) {
	srv, _, _, url := resumeRig(t)
	conn := resumeSocket(t, url)
	resumeWrite(t, conn, &proto.Login{Account: "resumeuser", Password: strings.Repeat("a", 32)})
	resumeRead(t, conn, "AuthResult")
	marker := resumeRead(t, conn, "Session")
	token := marker["token"].(string)
	other := resumeSocket(t, url)
	resumeWrite(t, other, &proto.Resume{Token: "resumeuser"})
	failure := resumeRead(t, other, "Error")
	if failure["code"] != "resume_failed" {
		t.Fatal(failure)
	}
	resumeWrite(t, other, &proto.ResetPassword{Account: "resumeuser", Secret: strings.Repeat("b", 32), Password: strings.Repeat("c", 32)})
	resumeRead(t, other, "AuthResult")
	resumeWrite(t, other, &proto.Resume{Token: token})
	failure = resumeRead(t, other, "Error")
	if failure["code"] != "resume_failed" {
		t.Fatal(failure)
	}
	srv.mu.Lock()
	valid := len(srv.tokens)
	srv.mu.Unlock()
	if valid != 0 {
		t.Fatal("reset retained old bearer")
	}
}

func TestMultipleCharactersRunAndSwitchIndependently(t *testing.T) {
	srv, w, first, url := resumeRig(t)
	home := data.Hometowns[0]
	second, err := srv.Store.CreateCharacter(context.Background(), store.Character{AccountID: first.AccountID, Name: "第二角色", Sprite: 100000, Level: 1, Floor: home.Floor, X: home.X, Y: home.Y})
	if err != nil {
		t.Fatal(err)
	}
	login := func() (*websocket.Conn, string) {
		c := resumeSocket(t, url)
		resumeWrite(t, c, &proto.Login{Account: "resumeuser", Password: strings.Repeat("a", 32)})
		resumeRead(t, c, "AuthResult")
		token := resumeRead(t, c, "Session")["token"].(string)
		resumeRead(t, c, "ServerList")
		resumeWrite(t, c, &proto.SelectLine{ID: 1})
		resumeRead(t, c, "LineSelected")
		return c, token
	}
	a, at := login()
	resumeWrite(t, a, &proto.CharEnter{ID: int(first.ID)})
	resumeRead(t, a, "EnterFloor")
	b, bt := login()
	resumeWrite(t, b, &proto.CharEnter{ID: int(second.ID)})
	resumeRead(t, b, "EnterFloor")
	if at == bt || w.Online() != 2 {
		t.Fatal("characters did not run independently")
	}
	resumeWrite(t, a, &proto.SwitchCharacter{})
	resumeRead(t, a, "LobbyReady")
	resumeRead(t, a, "ServerList")
	// A background actor must never send its messages into the still-open lobby.
	w.QuestReq(int(first.ID))
	resumeWrite(t, a, &proto.Ping{Seq: 10})
	checkCtx, checkCancel := context.WithTimeout(context.Background(), 3*time.Second)
	_, frame, readErr := a.Read(checkCtx)
	checkCancel()
	if readErr != nil {
		t.Fatal(readErr)
	}
	var event map[string]any
	if json.Unmarshal(frame, &event) != nil || event["t"] != "Pong" {
		t.Fatalf("background event leaked into lobby: %s", frame)
	}
	resumeWrite(t, b, &proto.Turn{Dir: 5})
	resumeWrite(t, b, &proto.Ping{Seq: 11})
	resumeRead(t, b, "Pong")
	if w.Online() != 2 {
		t.Fatal("switch stopped an actor")
	}
	resumeWrite(t, a, &proto.SelectLine{ID: 1})
	resumeRead(t, a, "LineSelected")
	resumeWrite(t, a, &proto.CharList{})
	listing := resumeRead(t, a, "CharListResult")
	for _, raw := range listing["chars"].([]any) {
		c := raw.(map[string]any)
		if c["online"] != true {
			t.Fatal(c)
		}
		if c["id"] == float64(first.ID) && c["background"] != true {
			t.Fatal(c)
		}
	}
	resumeWrite(t, a, &proto.CharEnter{ID: int(first.ID)})
	resumeRead(t, a, "Self")
	resumeRead(t, a, "EnterFloor")
	resumeWrite(t, a, &proto.Logout{})
	resumeRead(t, a, "Session")
	resumeWrite(t, b, &proto.Ping{Seq: 12})
	resumeRead(t, b, "Pong")
	if w.Online() != 2 {
		t.Fatal("logout stopped actors")
	}
	resumeWrite(t, b, &proto.ChangePassword{Old: strings.Repeat("a", 32), Password: strings.Repeat("c", 32)})
	resumeRead(t, b, "AccountResult")
	resumeRead(t, b, "Session")
	invalid := resumeSocket(t, url)
	resumeWrite(t, invalid, &proto.Resume{Token: bt})
	if e := resumeRead(t, invalid, "Error"); e["code"] != "resume_failed" {
		t.Fatal(e)
	}
}

func TestIdleBrowserAndAccountCapacityRecycles(t *testing.T) {
	srv := &Server{}
	a := store.Account{ID: 1, Name: "capacity"}
	for i := 0; i < 130; i++ {
		state, err := srv.lockAccount(a)
		if err != nil {
			t.Fatal(i, err)
		}
		state.expires = time.Now().Add(resumeLifetime)
		state.lastUsed.Store(int64(i))
		state.mu.Unlock()
	}
	root := srv.accounts[a.ID]
	if len(root.browsers) != 64 {
		t.Fatal(len(root.browsers))
	}
	for i := int64(2); i <= maxResumeAccounts; i++ {
		state := &accountSession{mu: &sync.Mutex{}, account: store.Account{ID: i}, browsers: map[*accountSession]bool{}}
		state.root = state
		srv.accounts[i] = state
	}
	state, err := srv.lockAccount(store.Account{ID: maxResumeAccounts + 1})
	if err != nil {
		t.Fatal("idle accounts exhausted capacity", err)
	}
	state.mu.Unlock()
}

// Pause old-password verification before the account lock, then finish revocation.
type delayedAuthentication struct {
	store.Store
	armed    atomic.Bool
	captured chan struct{}
	release  chan struct{}
}

func (d *delayedAuthentication) Authenticate(ctx context.Context, name, password string) (store.Account, error) {
	a, err := d.Store.Authenticate(ctx, name, password)
	if err == nil && d.armed.CompareAndSwap(true, false) {
		close(d.captured)
		select {
		case <-d.release:
		case <-ctx.Done():
			return store.Account{}, ctx.Err()
		}
	}
	return a, err
}
func TestPasswordMutationRejectsAlreadyVerifiedOldPassword(t *testing.T) {
	for _, reset := range []bool{false, true} {
		t.Run(map[bool]string{false: "change", true: "reset"}[reset], func(t *testing.T) {
			srv, _, _, url := resumeRig(t)
			delayed := &delayedAuthentication{Store: srv.Store, captured: make(chan struct{}), release: make(chan struct{})}
			srv.Store = delayed
			current := resumeSocket(t, url)
			resumeWrite(t, current, &proto.Login{Account: "resumeuser", Password: strings.Repeat("a", 32)})
			resumeRead(t, current, "AuthResult")
			resumeRead(t, current, "Session")
			resumeRead(t, current, "ServerList")
			stale := resumeSocket(t, url)
			delayed.armed.Store(true)
			resumeWrite(t, stale, &proto.Login{Account: "resumeuser", Password: strings.Repeat("a", 32)})
			select {
			case <-delayed.captured:
			case <-time.After(5 * time.Second):
				t.Fatal("login did not reach verification fence")
			}
			if reset {
				recovery := resumeSocket(t, url)
				resumeWrite(t, recovery, &proto.ResetPassword{Account: "resumeuser", Secret: strings.Repeat("b", 32), Password: strings.Repeat("c", 32)})
				resumeRead(t, recovery, "AuthResult")
			} else {
				resumeWrite(t, current, &proto.ChangePassword{Old: strings.Repeat("a", 32), Password: strings.Repeat("c", 32)})
				resumeRead(t, current, "AccountResult")
				resumeRead(t, current, "Session")
			}
			close(delayed.release)
			if auth := resumeRead(t, stale, "AuthResult"); auth["ok"] == true {
				t.Fatalf("revoked password installed new bearer: %v", auth)
			}
		})
	}
}

func TestCharEnterRecreatesActorRemovedByAdministrator(t *testing.T) {
	srv, w, char, url := resumeRig(t)
	c := resumeSocket(t, url)
	resumeWrite(t, c, &proto.Login{Account: "resumeuser", Password: strings.Repeat("a", 32)})
	resumeRead(t, c, "AuthResult")
	resumeRead(t, c, "Session")
	resumeRead(t, c, "ServerList")
	resumeWrite(t, c, &proto.SelectLine{ID: 1})
	resumeRead(t, c, "LineSelected")
	resumeWrite(t, c, &proto.CharEnter{ID: int(char.ID)})
	resumeRead(t, c, "EnterFloor")
	srv.mu.Lock()
	actor := srv.online[char.ID]
	srv.mu.Unlock()
	w.Leave(int(char.ID), actor.transport)
	if w.Online() != 0 {
		t.Fatal("administrative removal failed")
	}
	c = resumeSocket(t, url)
	resumeWrite(t, c, &proto.Login{Account: "resumeuser", Password: strings.Repeat("a", 32)})
	resumeRead(t, c, "AuthResult")
	resumeRead(t, c, "Session")
	resumeRead(t, c, "ServerList")
	resumeWrite(t, c, &proto.SelectLine{ID: 1})
	resumeRead(t, c, "LineSelected")
	resumeWrite(t, c, &proto.CharEnter{ID: int(char.ID)})
	resumeRead(t, c, "Self")
	resumeRead(t, c, "EnterFloor")
	if w.Online() != 1 {
		t.Fatal("stale actor prevented fresh entry")
	}
}

func TestRemovedActorCanBeDeletedAfterFailedResumeAndLogout(t *testing.T) {
	srv, w, char, url := resumeRig(t)
	original := resumeSocket(t, url)
	resumeWrite(t, original, &proto.Login{Account: "resumeuser", Password: strings.Repeat("a", 32)})
	resumeRead(t, original, "AuthResult")
	token := resumeRead(t, original, "Session")["token"].(string)
	resumeRead(t, original, "ServerList")
	resumeWrite(t, original, &proto.SelectLine{ID: 1})
	resumeRead(t, original, "LineSelected")
	resumeWrite(t, original, &proto.CharEnter{ID: int(char.ID)})
	resumeRead(t, original, "EnterFloor")
	srv.mu.Lock()
	actor := srv.online[char.ID]
	srv.mu.Unlock()
	w.Leave(int(char.ID), actor.transport)
	restored := resumeSocket(t, url)
	resumeWrite(t, restored, &proto.Resume{Token: token})
	resumeRead(t, restored, "Session")
	if marker := resumeRead(t, restored, "Session"); marker["inWorld"] == true {
		t.Fatal(marker)
	}
	resumeRead(t, restored, "ServerList")
	resumeWrite(t, restored, &proto.Logout{})
	resumeRead(t, restored, "Session")
	fresh := resumeSocket(t, url)
	resumeWrite(t, fresh, &proto.Login{Account: "resumeuser", Password: strings.Repeat("a", 32)})
	resumeRead(t, fresh, "AuthResult")
	resumeRead(t, fresh, "Session")
	resumeRead(t, fresh, "ServerList")
	resumeWrite(t, fresh, &proto.SelectLine{ID: 1})
	resumeRead(t, fresh, "LineSelected")
	resumeWrite(t, fresh, &proto.CharDelete{ID: int(char.ID)})
	listing := resumeRead(t, fresh, "CharListResult")
	// Empty repeated fields are omitted by the compact wire encoding.
	if raw, present := listing["chars"]; present {
		chars, ok := raw.([]any)
		if !ok || len(chars) != 0 {
			t.Fatalf("removed actor remained permanently in use: %v", listing)
		}
	}
	persisted, err := srv.Store.ListCharacters(context.Background(), char.AccountID)
	if err != nil || len(persisted) != 0 {
		t.Fatalf("removed character was not deleted from storage: %v %v", persisted, err)
	}
	srv.mu.Lock()
	defer srv.mu.Unlock()
	if srv.online[char.ID] != nil {
		t.Fatal("retired actor still indexed")
	}
}
