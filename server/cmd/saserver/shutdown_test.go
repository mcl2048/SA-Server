package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/coder/websocket"
	"gopkg.in/yaml.v3"
	"sa/server/internal/data"
	"sa/server/internal/proto"
	"sa/server/internal/store"
)

// Run the actual server entry point in an isolated subprocess, keeping the test
// runner's signal handlers and working directory untouched.
func TestShutdownServerHelper(t *testing.T) {
	if os.Getenv("SA_TEST_SHUTDOWN_HELPER") != "1" {
		return
	}
	main()
}

func TestSIGTERMSavesOnlinePosition(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("SIGTERM integration requires POSIX signals")
	}
	gameData, err := filepath.Abs("../../../gamedata")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(gameData); err != nil {
		t.Skip("original game data is unavailable")
	}
	dir := t.TempDir()
	cfg := defaultConfig()
	cfg.Data, cfg.DB, cfg.Assets, cfg.Client = gameData, filepath.Join(dir, "fixture.db"), dir, ""
	cfg.Groups = []LineGroup{{Name: "ShutdownTest", Lines: []string{"One"}}}
	cfg.GMs = []string{"shutdownfixture"}
	cfg.Rules.EncounterRate = 0
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	cfg.Addr = listener.Addr().String()
	listener.Close()
	encoded, err := yaml.Marshal(cfg)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "config.yaml"), encoded, 0600); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	db, err := store.OpenSQLite(cfg.DB)
	if err != nil {
		t.Fatal(err)
	}
	const password = "5f4dcc3b5aa765d61d8327deb882cf99"
	account, err := db.CreateAccount(ctx, "shutdownfixture", password, "0cc175b9c0f1b6a831c399e269772661")
	if err != nil {
		db.Close()
		t.Fatal(err)
	}
	home := data.Hometowns[0]
	character, err := db.CreateCharacter(ctx, store.Character{AccountID: account.ID, Name: "ShutdownFixture", Sprite: 100000, Level: 1, Floor: home.Floor, X: home.X, Y: home.Y, Vital: 10, Str: 10, Earth: 10})
	db.Close()
	if err != nil {
		t.Fatal(err)
	}
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	command := exec.Command(executable, "-test.run=^TestShutdownServerHelper$")
	command.Dir = dir
	command.Env = append(os.Environ(), "SA_TEST_SHUTDOWN_HELPER=1")
	var log bytes.Buffer
	command.Stdout, command.Stderr = &log, &log
	if err := command.Start(); err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() { done <- command.Wait() }()
	exited := false
	t.Cleanup(func() {
		if !exited {
			command.Process.Kill()
			<-done
		}
	})
	var connection *websocket.Conn
	ticker := time.NewTicker(20 * time.Millisecond)
	defer ticker.Stop()
	for connection == nil {
		connection, _, err = websocket.Dial(ctx, "ws://"+cfg.Addr+"/ws", nil)
		if err == nil {
			break
		}
		select {
		case result := <-done:
			exited = true
			t.Fatalf("server exited before listening: %v\n%s", result, log.String())
		case <-ctx.Done():
			t.Fatal("server did not start before test deadline")
		case <-ticker.C:
		}
	}
	defer connection.CloseNow()
	read := func(kind string) map[string]any {
		t.Helper()
		for {
			_, bytes, err := connection.Read(ctx)
			if err != nil {
				t.Fatalf("read %s: %v", kind, err)
			}
			var message map[string]any
			if err := json.Unmarshal(bytes, &message); err != nil {
				t.Fatal(err)
			}
			if message["t"] == "Error" {
				t.Fatalf("server error: %v", message)
			}
			if message["t"] == kind {
				return message
			}
		}
	}
	send := func(message proto.Message) {
		t.Helper()
		bytes, err := proto.Encode(message)
		if err != nil {
			t.Fatal(err)
		}
		if err := connection.Write(ctx, websocket.MessageText, bytes); err != nil {
			t.Fatal(err)
		}
	}
	read("Hello")
	send(&proto.Login{Account: "shutdownfixture", Password: password})
	if result := read("AuthResult"); result["ok"] != true {
		t.Fatalf("login: %v", result)
	}
	read("ServerList")
	send(&proto.SelectLine{ID: 1})
	read("LineSelected")
	send(&proto.CharEnter{ID: int(character.ID)})
	read("EnterFloor")
	// GM warp is applied in memory but does not synchronously persist position.
	// Keep the socket open through termination: ordinary logout must not save it.
	send(&proto.Chat{Channel: "near", Text: "/warp 1000 47 82"})
	read("EnterFloor")
	reply := read("ChatMsg")
	if !strings.Contains(reply["text"].(string), "传送到") {
		t.Fatalf("warp failed: %v", reply)
	}
	db, err = store.OpenSQLite(cfg.DB)
	if err != nil {
		t.Fatal(err)
	}
	before, err := db.GetCharacter(ctx, account.ID, character.ID)
	db.Close()
	if err != nil {
		t.Fatal(err)
	}
	if before.Floor == 1000 {
		t.Fatal("fixture position was already persisted; would not test shutdown flush")
	}
	if err := command.Process.Signal(syscall.SIGTERM); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-done:
		exited = true
		if err != nil {
			t.Fatalf("SIGTERM failed graceful exit: %v\n%s", err, log.String())
		}
	case <-ctx.Done():
		t.Fatal("SIGTERM did not stop and drain the server")
	}
	if !strings.Contains(log.String(), "已退出，在线角色位置已保存") {
		t.Fatalf("missing graceful exit: %s", log.String())
	}
	db, err = store.OpenSQLite(cfg.DB)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	after, err := db.GetCharacter(ctx, account.ID, character.ID)
	if err != nil {
		t.Fatal(err)
	}
	if after.Floor != 1000 || after.X != 47 || after.Y != 82 {
		t.Fatalf("online position not flushed: %+v", after)
	}
}
