package world

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"path/filepath"
	"testing"

	"sa/server/internal/data"
	"sa/server/internal/store"
)

// Fail the atomic boundary once, so the world must recompute from unchanged
// persisted values on retry rather than persist per-character progress.
type expMigrationStore struct {
	store.Store
	readErr   error
	commitErr error
	snapshots [][]store.Character
}

func (s *expMigrationStore) GetKV(ctx context.Context, key string) (string, error) {
	if s.readErr != nil {
		return "", s.readErr
	}
	return s.Store.GetKV(ctx, key)
}
func (s *expMigrationStore) MigrateExpPets(ctx context.Context, chars []store.Character, key, value string) error {
	s.snapshots = append(s.snapshots, append([]store.Character(nil), chars...))
	if s.commitErr != nil {
		err := s.commitErr
		s.commitErr = nil
		return err
	}
	return s.Store.MigrateExpPets(ctx, chars, key, value)
}
func (*expMigrationStore) SaveExpPets(context.Context, int64, int, string) error {
	panic("migration must not persist individual characters")
}
func (*expMigrationStore) PutKV(context.Context, string, string) error {
	panic("migration marker must be part of atomic update")
}

func TestMigrateExpAtomicRetry(t *testing.T) {
	ctx := context.Background()
	db, err := store.OpenSQLite(filepath.Join(t.TempDir(), "migration.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	a, err := db.CreateAccount(ctx, "legacy", "pw", "")
	if err != nil {
		t.Fatal(err)
	}
	bag := &petBag{Battle: -1, Ride: -1}
	bag.Pets[0] = &Pet{Name: "pet", Level: 2, Exp: 7}
	bag.Pool = []*Pet{{Name: "pool", Level: 1, Exp: 1}}
	var chars []store.Character
	for _, name := range []string{"one", "two"} {
		c, err := db.CreateCharacter(ctx, store.Character{AccountID: a.ID, Name: name, Level: 3, Exp: 25, Pets: bag.String()})
		if err != nil {
			t.Fatal(err)
		}
		chars = append(chars, c)
	}
	game := &data.Game{Battle: &data.BattleData{LevelExp: []int{0, 2, 6, 18, 40, 80}}}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	injected := errors.New("commit unavailable")
	wrapped := &expMigrationStore{Store: db, commitErr: injected}
	if err := MigrateExp(ctx, wrapped, game, log); !errors.Is(err, injected) {
		t.Fatalf("failure=%v", err)
	}
	for _, c := range chars {
		got, err := db.GetCharacter(ctx, a.ID, c.ID)
		if err != nil || got.Exp != 25 || got.Pets != c.Pets {
			t.Fatalf("partial world migration %+v: %v", got, err)
		}
	}
	if value, err := db.GetKV(ctx, "expSemantics"); err != nil || value != "" {
		t.Fatalf("partial marker=%q: %v", value, err)
	}
	for i := 0; i < 2; i++ {
		if err := MigrateExp(ctx, wrapped, game, log); err != nil {
			t.Fatal(err)
		}
		for _, c := range chars {
			got, err := db.GetCharacter(ctx, a.ID, c.ID)
			if err != nil {
				t.Fatal(err)
			}
			pets := parsePets(got.Pets)
			if got.Exp != 7 || pets.Pets[0].Exp != 1 || pets.Pool[0].Exp != 0 {
				t.Fatalf("double subtraction %+v pets=%+v", got, pets)
			}
		}
	}
	if len(wrapped.snapshots) != 2 || len(wrapped.snapshots[0]) != 2 || wrapped.snapshots[0][0].Exp != wrapped.snapshots[1][0].Exp {
		t.Fatalf("retry did not recompute unchanged snapshot: %+v", wrapped.snapshots)
	}
}

func TestMigrateExpPropagatesMarkerReadFailure(t *testing.T) {
	want := errors.New("storage read unavailable")
	// An embedded nil Store deliberately makes accidental subsequent reads/writes
	// fail: a marker read failure must return before any migration work.
	db := &expMigrationStore{readErr: want}
	if err := MigrateExp(context.Background(), db, nil, nil); !errors.Is(err, want) {
		t.Fatalf("read failure=%v", err)
	}
	if len(db.snapshots) != 0 {
		t.Fatal("migration attempted after marker read failure")
	}
}
