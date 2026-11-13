package store

import (
	"context"
	"errors"
	"fmt"
	"testing"
)

func TestRestoreMailsPreservesFullMailbox(t *testing.T) {
	ctx := context.Background()
	s := openTestStore(t, ":memory:")
	for i := 0; i < MailMax; i++ {
		if err := s.PutMail(ctx, 1, fmt.Sprintf("new-%d", i)); err != nil {
			t.Fatal(err)
		}
	}
	if err := s.RestoreMails(ctx, 1, []string{"original-a", "original-b"}); err != nil {
		t.Fatalf("existing new mail must not discard already accepted original mail: %v", err)
	}
	if err := s.PutMail(ctx, 1, "another-new"); !errors.Is(err, ErrMailFull) {
		t.Fatalf("restoration must retain the new-mail admission limit: %v", err)
	}
	got, err := s.TakeMails(ctx, 1)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != MailMax+2 {
		t.Fatalf("a restored backlog must be delivered whole, got %d messages", len(got))
	}
	for i := 0; i < MailMax; i++ {
		if got[i] != fmt.Sprintf("new-%d", i) {
			t.Fatalf("new mail %d was changed or lost: %q", i, got[i])
		}
	}
	if got[MailMax] != "original-a" || got[MailMax+1] != "original-b" {
		t.Fatalf("original accepted mail was changed or lost: %v", got[MailMax:])
	}
	if again, err := s.TakeMails(ctx, 1); err != nil || len(again) != 0 {
		t.Fatalf("delivered mail must be consumed once: %v %v", again, err)
	}
}

func TestRestoreMailsRollsBackPartialFailure(t *testing.T) {
	ctx := context.Background()
	s := openTestStore(t, ":memory:")
	if err := s.PutMail(ctx, 1, "existing"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.db.Exec(`CREATE TRIGGER fail_restore BEFORE INSERT ON mails WHEN NEW.body='fail'
		BEGIN SELECT RAISE(ABORT,'restore failed'); END`); err != nil {
		t.Fatal(err)
	}
	if err := s.RestoreMails(ctx, 1, []string{"first", "fail", "last"}); err == nil {
		t.Fatal("injected restoration failure was ignored")
	}
	var count int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM mails WHERE to_char=1`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("part of a failed restore was committed: count=%d err=%v", count, err)
	}
	got, err := s.TakeMails(ctx, 1)
	if err != nil || len(got) != 1 || got[0] != "existing" {
		t.Fatalf("failed restore changed previous mail: %v %v", got, err)
	}
}

func TestRestoreMailsHonorsCanceledContext(t *testing.T) {
	s := openTestStore(t, ":memory:")
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := s.RestoreMails(ctx, 1, []string{"original"}); !errors.Is(err, context.Canceled) {
		t.Fatalf("canceled restoration must return cancellation: %v", err)
	}
	got, err := s.TakeMails(context.Background(), 1)
	if err != nil || len(got) != 0 {
		t.Fatalf("canceled restoration wrote mail: %v %v", got, err)
	}
}
