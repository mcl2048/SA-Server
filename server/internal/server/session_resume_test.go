package server

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http/httptest"
	"path/filepath"
	"strings"
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
		return state.controller == nil
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
	if replacement == token || marker["inWorld"] != true {
		t.Fatal(marker)
	}
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
	if w.Online() != 0 {
		t.Fatal("explicit logout retained character")
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
