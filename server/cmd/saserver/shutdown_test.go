package main

import (
	"bytes"
	"context"
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"fmt"
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
	"modernc.org/sqlite"
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
	if marker := os.Getenv("SA_TEST_SHUTDOWN_SLOW_MARKER"); marker != "" {
		// Delay real SQLite UPDATEs only after the parent starts termination.
		// Four players produce eight 2-second writes, beyond the old 10-second
		// world fence. Startup and login remain fast; no production hook exists.
		if err := sqlite.RegisterScalarFunction("sa_test_shutdown_delay", 0, func(_ *sqlite.FunctionContext, _ []driver.Value) (driver.Value, error) {
			if _, err := os.Stat(marker); err == nil {
				time.Sleep(2 * time.Second)
			}
			return int64(1), nil
		}); err != nil {
			t.Fatal(err)
		}
	}
	main()
}

func TestSIGTERMSavesOnlinePosition(t *testing.T) {
	testSIGTERMSavesOnlinePositions(t, 1, false, false, false)
}

func TestSIGTERMSavesDetachedPosition(t *testing.T) {
	testSIGTERMSavesOnlinePositions(t, 1, false, false, true)
}

func TestSIGTERMWaitsForSlowSaveQueue(t *testing.T) {
	testSIGTERMSavesOnlinePositions(t, 4, true, false, false)
}

func TestSIGTERMWaitsForSharedFamilySaveQueue(t *testing.T) {
	testSIGTERMSavesOnlinePositions(t, 1, false, true, false)
}

func testSIGTERMSavesOnlinePositions(t *testing.T, players int, slow, slowFamily, detached bool) {
	t.Helper()
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
	cfg.GMs = nil
	for i := 0; i < players; i++ {
		cfg.GMs = append(cfg.GMs, fmt.Sprintf("shutdownfixture%d", i))
	}
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
	// Race-instrumented original-data loading can be much slower than the
	// controlled 16-second drain. Keep the deadline generous without weakening
	// the persistence assertions or relying on a fixed elapsed-time threshold.
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	db, err := store.OpenSQLite(cfg.DB)
	if err != nil {
		t.Fatal(err)
	}
	const password = "5f4dcc3b5aa765d61d8327deb882cf99"
	home := data.Hometowns[0]
	var characters []store.Character
	for i, name := range cfg.GMs {
		account, err := db.CreateAccount(ctx, name, password, "0cc175b9c0f1b6a831c399e269772661")
		if err != nil {
			closeShutdownStore(t, db)
			t.Fatal(err)
		}
		character, err := db.CreateCharacter(ctx, store.Character{AccountID: account.ID, Name: fmt.Sprintf("ShutdownFixture%d", i), Sprite: 100000, Level: 1, Floor: home.Floor, X: home.X, Y: home.Y, Vital: 10, Str: 10, Earth: 10})
		if err != nil {
			closeShutdownStore(t, db)
			t.Fatal(err)
		}
		characters = append(characters, character)
	}
	if slowFamily {
		body, err := json.Marshal(map[string]any{
			"id": 1, "name": "FamilyShutdown", "gold": 100,
			"members": []any{map[string]any{"id": characters[0].ID, "name": characters[0].Name, "lv": 1, "duty": 3}},
		})
		if err != nil {
			closeShutdownStore(t, db)
			t.Fatal(err)
		}
		if err := db.SaveFamily(ctx, 1, string(body)); err != nil {
			closeShutdownStore(t, db)
			t.Fatal(err)
		}
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	marker := filepath.Join(dir, "slow-writes")
	if slow || slowFamily {
		raw, err := sql.Open("sqlite", cfg.DB)
		if err != nil {
			t.Fatal(err)
		}
		table := "characters"
		if slowFamily {
			table = "families"
		}
		_, err = raw.Exec(`CREATE TRIGGER slow_shutdown BEFORE UPDATE ON ` + table + ` BEGIN SELECT sa_test_shutdown_delay(); END`)
		closeErr := raw.Close()
		if err != nil {
			t.Fatal(err)
		}
		if closeErr != nil {
			t.Fatal(closeErr)
		}
	}
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	command := exec.Command(executable, "-test.run=^TestShutdownServerHelper$")
	command.Dir = dir
	command.Env = append(os.Environ(), "SA_TEST_SHUTDOWN_HELPER=1")
	if slow || slowFamily {
		command.Env = append(command.Env, "SA_TEST_SHUTDOWN_SLOW_MARKER="+marker)
	}
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
	ticker := time.NewTicker(20 * time.Millisecond)
	defer ticker.Stop()
	for i, character := range characters {
		var connection *websocket.Conn
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
		defer func() {
			// SIGTERM may already have closed the fixture transport. This
			// unconditional teardown intentionally accepts an already-closed
			// socket; persistence assertions above own the test outcome.
			_ = connection.CloseNow()
		}()
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
		send(&proto.Login{Account: cfg.GMs[i], Password: password})
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
		send(&proto.Chat{Channel: "near", Text: fmt.Sprintf("/warp 1000 %d 82", 47+i)})
		read("EnterFloor")
		reply := read("ChatMsg")
		if !strings.Contains(reply["text"].(string), "传送到") {
			t.Fatalf("warp failed: %v", reply)
		}
		if detached {
			// A lost transport must retain the in-memory actor, not perform
			// a normal Leave/save. A second WebSocket client observes background=true
			// before SIGTERM; the SQLite assertion below proves shutdown saves it.
			if err := connection.CloseNow(); err != nil {
				t.Fatal(err)
			}
			connection, _, err = websocket.Dial(ctx, "ws://"+cfg.Addr+"/ws", nil)
			if err != nil {
				t.Fatal(err)
			}
			read("Hello")
			send(&proto.Login{Account: cfg.GMs[i], Password: password})
			if result := read("AuthResult"); result["ok"] != true {
				t.Fatalf("background inspection login: %v", result)
			}
			read("ServerList")
			send(&proto.SelectLine{ID: 1})
			read("LineSelected")
			for {
				send(&proto.CharList{})
				listing := read("CharListResult")
				chars, ok := listing["chars"].([]any)
				if !ok || len(chars) != 1 {
					t.Fatalf("detached character missing from lobby: %v", listing)
				}
				entry := chars[0].(map[string]any)
				if entry["online"] == true && entry["background"] == true {
					break
				}
				select {
				case <-ticker.C:
				case <-ctx.Done():
					t.Fatal("character never became a retained background actor")
				}
			}
		}
		if slowFamily {
			// Queue enough independent family saves that final character writes
			// cannot incidentally drain them just by sharing SQLite's connection.
			if err := os.WriteFile(marker, []byte("delay"), 0600); err != nil {
				t.Fatal(err)
			}
			chatPace := time.NewTicker(time.Second)
			defer chatPace.Stop()
			for gold := 1000; gold <= 8000; gold += 1000 {
				// Respect the actual player chat admission rate; throttling the
				// fixture must not be confused with a persistence regression.
				<-chatPace.C
				send(&proto.Chat{Channel: "near", Text: fmt.Sprintf("/fm gold %d", gold)})
				reply := read("ChatMsg")
				if !strings.Contains(reply["text"].(string), fmt.Sprintf("共同帐户 %d", gold)) {
					t.Fatalf("family update failed: %v", reply)
				}
				// A separate inspection connection here would wait for SQLite's
				// writer and mask the missing family join; signal immediately below.
			}
		}
	}
	if !slowFamily {
		db, err = store.OpenSQLite(cfg.DB)
		if err != nil {
			t.Fatal(err)
		}
		for _, character := range characters {
			before, err := db.GetCharacter(ctx, character.AccountID, character.ID)
			if err != nil {
				closeShutdownStore(t, db)
				t.Fatal(err)
			}
			if before.Floor == 1000 {
				closeShutdownStore(t, db)
				t.Fatal("fixture position was already persisted; would not test shutdown flush")
			}
		}
		if err := db.Close(); err != nil {
			t.Fatal(err)
		}
	}
	if slow {
		if err := os.WriteFile(marker, []byte("delay"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	shutdownAt := time.Now()
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
	t.Logf("SIGTERM completed after %s for %d retained players (slow=%t, slowFamily=%t, detached=%t)", time.Since(shutdownAt), players, slow, slowFamily, detached)
	if !strings.Contains(log.String(), "已退出，在线角色存档队列已排空") {
		t.Fatalf("missing graceful exit: %s", log.String())
	}
	db, err = store.OpenSQLite(cfg.DB)
	if err != nil {
		t.Fatal(err)
	}
	defer closeShutdownStore(t, db)
	if slowFamily {
		rows, err := db.LoadFamilies(ctx)
		if err != nil {
			t.Fatal(err)
		}
		var saved struct {
			Gold int `json:"gold"`
		}
		if err := json.Unmarshal([]byte(rows[1]), &saved); err != nil || saved.Gold != 8000 {
			t.Errorf("shared family queue lost its final accepted update: gold=%d err=%v\n%s", saved.Gold, err, log.String())
		}
	}
	for i, character := range characters {
		after, err := db.GetCharacter(ctx, character.AccountID, character.ID)
		if err != nil {
			t.Fatal(err)
		}
		if after.Floor != 1000 || after.X != 47+i || after.Y != 82 {
			t.Errorf("online position not flushed for character %d: floor=%d x=%d y=%d\n%s", character.ID, after.Floor, after.X, after.Y, log.String())
		}
	}
}

func closeShutdownStore(t *testing.T, db store.Store) {
	t.Helper()
	if err := db.Close(); err != nil {
		t.Error(err)
	}
}
