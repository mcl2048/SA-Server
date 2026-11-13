package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

func openTestStore(t testing.TB, path string) *sqliteStore {
	t.Helper()
	s, err := OpenSQLite(path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := s.Close(); err != nil {
			t.Error(err)
		}
	})
	return s.(*sqliteStore)
}

func TestSQLiteConfigurationAndReopen(t *testing.T) {
	path := filepath.Join(t.TempDir(), "save?# db.sqlite")
	s := openTestStore(t, path)
	var version, mode string
	if err := s.db.QueryRow(`SELECT sqlite_version()`).Scan(&version); err != nil {
		t.Fatal(err)
	}
	t.Logf("runtime SQLite %s", version)
	// Guard the WAL reset fix, including the fixed maintenance branches.
	var major, minor, patch int
	if _, err := fmt.Sscanf(version, "%d.%d.%d", &major, &minor, &patch); err != nil {
		t.Fatal(err)
	}
	safe := major > 3 || major == 3 && (minor > 51 || minor == 51 && patch >= 3 || minor == 50 && patch >= 7 || minor == 44 && patch >= 6)
	if !safe {
		t.Fatalf("SQLite %s lacks known WAL reset fix", version)
	}
	if err := s.db.QueryRow(`PRAGMA journal_mode`).Scan(&mode); err != nil || mode != "wal" {
		t.Fatalf("journal_mode=%s: %v", mode, err)
	}
	for pragma, want := range map[string]int{"foreign_keys": 1, "busy_timeout": 5000, "synchronous": 2} {
		var got int
		if err := s.db.QueryRow("PRAGMA " + pragma).Scan(&got); err != nil || got != want {
			t.Fatalf("%s=%d want %d: %v", pragma, got, want, err)
		}
	}
	ctx := context.Background()
	if _, err := s.CreateCharacter(ctx, Character{AccountID: 999, Name: "orphan"}); err == nil {
		t.Fatal("foreign key accepted orphan")
	}
	if err := s.PutKV(ctx, "persist", "yes"); err != nil {
		t.Fatal(err)
	}
	// Force connection replacement; per-connection pragmas must survive it.
	s.db.SetMaxIdleConns(0)
	var fk int
	if err := s.db.QueryRow(`PRAGMA foreign_keys`).Scan(&fk); err != nil || fk != 1 {
		t.Fatalf("replacement connection foreign_keys=%d: %v", fk, err)
	}
	s.db.SetMaxIdleConns(1)
	reopened := openTestStore(t, path)
	if value, err := reopened.GetKV(ctx, "persist"); err != nil || value != "yes" {
		t.Fatalf("reopen=%q: %v", value, err)
	}
	var check string
	if err := reopened.db.QueryRow(`PRAGMA integrity_check`).Scan(&check); err != nil || check != "ok" {
		t.Fatalf("integrity=%s: %v", check, err)
	}
}

func TestMemorySQLite(t *testing.T) { openTestStore(t, ":memory:") }

func TestMigrationRollback(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err = db.Exec(schema + `CREATE VIEW mails AS SELECT 1 AS id;`); err != nil {
		t.Fatal(err)
	}
	if s, err := OpenSQLite(path); err == nil {
		s.Close()
		t.Fatal("expected incompatible legacy schema error")
	}
	var n int
	if err := db.QueryRow(`SELECT count(*) FROM pragma_table_info('characters') WHERE name='face'`).Scan(&n); err != nil || n != 0 {
		t.Fatalf("partial migration committed n=%d: %v", n, err)
	}
	if _, err := db.Exec(`DROP VIEW mails; INSERT INTO accounts(name,pass_hash,pass_salt,created_at) VALUES('legacy',X'',X'',1)`); err != nil {
		t.Fatal(err)
	}
	s := openTestStore(t, path)
	a, err := s.AccountInfo(context.Background(), 1)
	if err != nil || a.Name != "legacy" || a.HasSecret {
		t.Fatalf("legacy data=%+v: %v", a, err)
	}
	openTestStore(t, path) // rerunning all migrations is idempotent
}

func TestConcurrentDengonAndMail(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "concurrent.db")
	stores := []*sqliteStore{openTestStore(t, path), openTestStore(t, path)}
	const workers = 100
	var wg sync.WaitGroup
	ids := make(chan int, workers)
	errs := make(chan error, workers*2)
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			s := stores[i%len(stores)]
			id, err := s.AddDengon(ctx, "board", "post")
			if err != nil {
				errs <- err
			} else {
				ids <- id
			}
			if err := s.PutMail(ctx, 1, fmt.Sprint(i)); err != nil && !errors.Is(err, ErrMailFull) {
				errs <- err
			}
		}(i)
	}
	wg.Wait()
	close(ids)
	close(errs)
	for err := range errs {
		t.Error(err)
	}
	seen := map[int]bool{}
	for id := range ids {
		if seen[id] {
			t.Errorf("duplicate ID %d", id)
		}
		seen[id] = true
	}
	if len(seen) != workers {
		t.Fatalf("IDs=%d want %d", len(seen), workers)
	}
	var count int
	if err := stores[0].db.QueryRow(`SELECT count(*) FROM mails WHERE to_char=1`).Scan(&count); err != nil || count != MailMax {
		t.Fatalf("mail count=%d: %v", count, err)
	}
	deliveries := make(chan []string, 10)
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			mails, err := stores[i%2].TakeMails(ctx, 1)
			if err != nil {
				t.Error(err)
			}
			deliveries <- mails
		}(i)
	}
	wg.Wait()
	close(deliveries)
	total := 0
	for mails := range deliveries {
		total += len(mails)
	}
	if total != MailMax {
		t.Fatalf("delivered %d want %d", total, MailMax)
	}
}

func TestCompositeRollback(t *testing.T) {
	ctx := context.Background()
	s := openTestStore(t, filepath.Join(t.TempDir(), "rollback.db"))
	if _, err := s.db.Exec(`CREATE TRIGGER fail_trim BEFORE DELETE ON dengon BEGIN SELECT RAISE(ABORT,'trim failed'); END;
 INSERT INTO dengon VALUES('board',1,'old');`); err != nil {
		t.Fatal(err)
	}
	// Ensure the next write must trim, then inject failure after its INSERT.
	if _, err := s.db.Exec(`INSERT INTO dengon VALUES('board',?,'last')`, DengonKeep); err != nil {
		t.Fatal(err)
	}
	if _, err := s.AddDengon(ctx, "board", "new"); err == nil {
		t.Fatal("expected trim failure")
	}
	if id, err := s.DengonMaxID(ctx, "board"); err != nil || id != DengonKeep {
		t.Fatalf("partial append id=%d: %v", id, err)
	}
	if err := s.PutMail(ctx, 1, "keep"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.db.Exec(`CREATE TRIGGER fail_take BEFORE DELETE ON mails BEGIN SELECT RAISE(ABORT,'delete failed'); END`); err != nil {
		t.Fatal(err)
	}
	if mails, err := s.TakeMails(ctx, 1); err == nil || len(mails) != 0 {
		t.Fatalf("uncommitted delivery=%v: %v", mails, err)
	}
	if _, err := s.db.Exec(`DROP TRIGGER fail_take`); err != nil {
		t.Fatal(err)
	}
	if mails, err := s.TakeMails(ctx, 1); err != nil || len(mails) != 1 {
		t.Fatalf("lost mail=%v: %v", mails, err)
	}
}

func TestQueryIndexes(t *testing.T) {
	s := openTestStore(t, ":memory:")
	for _, tc := range []struct{ query, index string }{
		{`SELECT body FROM mails WHERE to_char=1 ORDER BY id LIMIT 50`, "mails_recipient"},
		{`SELECT id FROM characters WHERE deleted=0 ORDER BY dp DESC,id LIMIT 10`, "characters_duel"},
		{`SELECT count(*) FROM characters WHERE deleted=0 AND dp>100`, "characters_duel"},
	} {
		rows, err := s.db.Query("EXPLAIN QUERY PLAN " + tc.query)
		if err != nil {
			t.Fatal(err)
		}
		var plans []string
		for rows.Next() {
			var a, b, c int
			var detail string
			if err := rows.Scan(&a, &b, &c, &detail); err != nil {
				t.Fatal(err)
			}
			plans = append(plans, detail)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(strings.Join(plans, ";"), tc.index) {
			t.Errorf("missing %s: %v", tc.index, plans)
		}
	}
}

func TestMailSendTakeInterleave(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "interleave.db")
	s := openTestStore(t, path)
	r := openTestStore(t, path)
	var wg sync.WaitGroup
	accepted := make(chan string, 100)
	delivered := make(chan string, 100)
	wg.Add(2)
	go func() {
		defer wg.Done()
		for i := 0; i < 100; i++ {
			body := fmt.Sprint(i)
			if err := s.PutMail(ctx, 1, body); err == nil {
				accepted <- body
			} else if !errors.Is(err, ErrMailFull) {
				t.Error(err)
			}
		}
	}()
	go func() {
		defer wg.Done()
		for i := 0; i < 30; i++ {
			mails, err := r.TakeMails(ctx, 1)
			if err != nil {
				t.Error(err)
				return
			}
			for _, body := range mails {
				delivered <- body
			}
		}
	}()
	wg.Wait()
	mails, err := r.TakeMails(ctx, 1)
	if err != nil {
		t.Fatal(err)
	}
	for _, body := range mails {
		delivered <- body
	}
	close(accepted)
	close(delivered)
	counts := map[string]int{}
	for body := range accepted {
		counts[body]++
	}
	for body := range delivered {
		counts[body]--
	}
	for body, count := range counts {
		if count != 0 {
			t.Errorf("mail %s balance %d", body, count)
		}
	}
}

func BenchmarkPutMail(b *testing.B) {
	for _, indexed := range []bool{false, true} {
		b.Run(fmt.Sprintf("recipient_index=%t", indexed), func(b *testing.B) {
			s := openTestStore(b, filepath.Join(b.TempDir(), "bench.db"))
			if !indexed {
				if _, err := s.db.Exec(`DROP INDEX mails_recipient`); err != nil {
					b.Fatal(err)
				}
			}
			if _, err := s.db.Exec(`WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<20000)
				INSERT INTO mails(to_char,body,created_at) SELECT x,'seed',0 FROM n`); err != nil {
				b.Fatal(err)
			}
			ctx := context.Background()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				if err := s.PutMail(ctx, int64(i+20001), "mail"); err != nil {
					b.Fatal(err)
				}
			}
		})
	}
}
