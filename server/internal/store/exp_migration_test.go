package store

import (
	"context"
	"fmt"
	"path/filepath"
	"testing"
)

func TestMigrateExpPetsRollbackAndRetry(t *testing.T) {
	for _, failure := range []string{"second-character", "marker"} {
		t.Run(failure, func(t *testing.T) {
			ctx := context.Background()
			s := openTestStore(t, filepath.Join(t.TempDir(), "migration.db"))
			a, err := s.CreateAccount(ctx, "legacy", "pw", "")
			if err != nil {
				t.Fatal(err)
			}
			var chars []Character
			for i := 0; i < 2; i++ {
				c, err := s.CreateCharacter(ctx, Character{AccountID: a.ID, Name: fmt.Sprint(i), Exp: 25, Pets: "old-pets"})
				if err != nil {
					t.Fatal(err)
				}
				chars = append(chars, c)
			}
			var trigger string
			if failure == "second-character" {
				trigger = fmt.Sprintf(`CREATE TRIGGER fail_migration BEFORE UPDATE OF exp,pets ON characters WHEN OLD.id=%d BEGIN SELECT RAISE(ABORT,'migration failed'); END`, chars[1].ID)
			} else {
				trigger = `CREATE TRIGGER fail_migration BEFORE INSERT ON kv BEGIN SELECT RAISE(ABORT,'marker failed'); END`
			}
			if _, err := s.db.Exec(trigger); err != nil {
				t.Fatal(err)
			}
			converted := append([]Character(nil), chars...)
			for i := range converted {
				converted[i].Exp = 7
				converted[i].Pets = "converted-pets"
			}
			if err := s.MigrateExpPets(ctx, converted, "expSemantics", "2"); err == nil {
				t.Fatal("expected injected failure")
			}
			for _, c := range chars {
				got, err := s.GetCharacter(ctx, a.ID, c.ID)
				if err != nil || got.Exp != 25 || got.Pets != "old-pets" {
					t.Fatalf("partial commit %+v: %v", got, err)
				}
			}
			if value, err := s.GetKV(ctx, "expSemantics"); err != nil || value != "" {
				t.Fatalf("partial marker %q: %v", value, err)
			}
			if _, err := s.db.Exec(`DROP TRIGGER fail_migration`); err != nil {
				t.Fatal(err)
			}
			if err := s.MigrateExpPets(ctx, converted, "expSemantics", "2"); err != nil {
				t.Fatal(err)
			}
			for _, c := range chars {
				got, err := s.GetCharacter(ctx, a.ID, c.ID)
				if err != nil || got.Exp != 7 || got.Pets != "converted-pets" {
					t.Fatalf("retry %+v: %v", got, err)
				}
			}
			if value, err := s.GetKV(ctx, "expSemantics"); err != nil || value != "2" {
				t.Fatalf("marker %q: %v", value, err)
			}
			// A separately computed repeat conversion cannot overwrite the committed one.
			converted[0].Exp = 0
			if err := s.MigrateExpPets(ctx, converted, "expSemantics", "2"); err != nil {
				t.Fatal(err)
			}
			got, err := s.GetCharacter(ctx, a.ID, chars[0].ID)
			if err != nil || got.Exp != 7 {
				t.Fatalf("repeated conversion %+v: %v", got, err)
			}
		})
	}
}
