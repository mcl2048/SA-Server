package store

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"path/filepath"
	"strings"
	"testing"

	"modernc.org/sqlite"
)

// resetConnector interposes only at the password UPDATE, after the real SELECT
// has completed. A second real Store changes the secret at that exact point,
// making the previously timing-dependent stale-secret regression deterministic.
type resetConnector struct {
	dsn          string
	beforeUpdate func() error
}

func (c *resetConnector) Driver() driver.Driver { return &sqlite.Driver{} }
func (c *resetConnector) Connect(context.Context) (driver.Conn, error) {
	conn, err := c.Driver().Open(c.dsn)
	if err != nil {
		return nil, err
	}
	return &resetConn{Conn: conn, beforeUpdate: c.beforeUpdate}, nil
}

type resetConn struct {
	driver.Conn
	beforeUpdate func() error
}

func (c *resetConn) QueryContext(ctx context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	return c.Conn.(driver.QueryerContext).QueryContext(ctx, query, args)
}
func (c *resetConn) ExecContext(ctx context.Context, query string, args []driver.NamedValue) (driver.Result, error) {
	if strings.HasPrefix(query, "UPDATE accounts SET pass_hash") && c.beforeUpdate != nil {
		hook := c.beforeUpdate
		c.beforeUpdate = nil
		if err := hook(); err != nil {
			return nil, err
		}
	}
	return c.Conn.(driver.ExecerContext).ExecContext(ctx, query, args)
}

func TestResetPasswordRejectsChangedSecret(t *testing.T) {
	for _, replacement := range []string{"new-code", ""} {
		name := "changed"
		if replacement == "" {
			name = "cleared"
		}
		t.Run(name, func(t *testing.T) {
			ctx := context.Background()
			path := filepath.Join(t.TempDir(), "reset.db")
			writer := openTestStore(t, path)
			if _, err := writer.CreateAccount(ctx, "account", "old-password", "old-code"); err != nil {
				t.Fatal(err)
			}
			changed := false
			db := sql.OpenDB(&resetConnector{dsn: path, beforeUpdate: func() error {
				changed = true
				return writer.SetSecret(ctx, "account", replacement)
			}})
			db.SetMaxOpenConns(1)
			defer db.Close()
			stale := &sqliteStore{db: db}
			err := stale.ResetPassword(ctx, "account", "old-code", "attacker-password")
			if !changed {
				t.Fatal("test did not interleave the secret change")
			}
			if !errors.Is(err, ErrBadLogin) {
				t.Fatalf("obsolete secret reset returned %v", err)
			}
			if _, err := writer.Authenticate(ctx, "account", "old-password"); err != nil {
				t.Fatalf("password changed on rejected reset: %v", err)
			}
			if _, err := writer.Authenticate(ctx, "account", "attacker-password"); !errors.Is(err, ErrBadLogin) {
				t.Fatalf("obsolete-secret password accepted: %v", err)
			}
			// Subsequent requests observe the new secret, including the no-secret case.
			if replacement == "" {
				if err := writer.ResetPassword(ctx, "account", "old-code", "new-password"); !errors.Is(err, ErrNoSecret) {
					t.Fatalf("cleared secret returned %v", err)
				}
			} else {
				if err := writer.ResetPassword(ctx, "account", "old-code", "new-password"); !errors.Is(err, ErrBadLogin) {
					t.Fatalf("old secret returned %v", err)
				}
				if err := writer.ResetPassword(ctx, "ACCOUNT", replacement, "new-password"); err != nil {
					t.Fatalf("current secret reset failed: %v", err)
				}
				if _, err := writer.Authenticate(ctx, "account", "new-password"); err != nil {
					t.Fatalf("new password rejected: %v", err)
				}
			}
		})
	}
}
