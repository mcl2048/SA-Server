package server

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"sa/server/internal/proto"
	"sa/server/internal/store"
)

const resumeLifetime = 30 * 24 * time.Hour
const maxResumeAccounts = 10000

// accountSession outlives any WebSocket. mu fences all authenticated commands,
// controller replacement, detach and explicit logout. srv.mu only protects maps;
// never wait for accountSession.mu while holding srv.mu.
type accountSession struct {
	mu         sync.Mutex
	account    store.Account
	controller *session
	transport  *session // exact Client currently installed in the live world
	line       *Line
	flushing   *Line            // explicit logout writes must finish before a fresh DB entry
	char       *store.Character // identity only: live mutable state belongs to world
	hash       [32]byte
	expires    time.Time
	lastUsed   atomic.Int64
}

func newResumeToken() (string, [32]byte, error) {
	var random [32]byte
	if _, err := rand.Read(random[:]); err != nil {
		return "", [32]byte{}, err
	}
	token := base64.RawURLEncoding.EncodeToString(random[:])
	return token, sha256.Sum256([]byte(token)), nil
}

// lockAccount is called only after normal password/registration authentication.
func (srv *Server) lockAccount(a store.Account) (*accountSession, error) {
	for {
		srv.mu.Lock()
		if srv.accounts == nil {
			srv.accounts = map[int64]*accountSession{}
			srv.tokens = map[[32]byte]*accountSession{}
		}
		state := srv.accounts[a.ID]
		if state == nil {
			if len(srv.accounts) >= maxResumeAccounts {
				// Only idle lobby records may be evicted. Characters running offline
				// are never discarded to make room for a new authentication.
				for id, old := range srv.accounts {
					if old.mu.TryLock() {
						if old.controller == nil && old.char == nil && old.flushing == nil {
							delete(srv.accounts, id)
							delete(srv.tokens, old.hash)
						}
						old.mu.Unlock()
					}
				}
			}
			if len(srv.accounts) >= maxResumeAccounts {
				srv.mu.Unlock()
				return nil, errors.New("session capacity")
			}
			state = &accountSession{account: a}
			srv.accounts[a.ID] = state
		}
		srv.mu.Unlock()
		state.mu.Lock()
		srv.mu.Lock()
		current := srv.accounts[a.ID] == state
		srv.mu.Unlock()
		if current {
			return state, nil
		}
		state.mu.Unlock()
	}
}

func (s *session) installToken(state *accountSession, hash [32]byte) {
	s.srv.mu.Lock()
	delete(s.srv.tokens, state.hash)
	state.hash, state.expires = hash, time.Now().Add(resumeLifetime)
	s.srv.tokens[hash] = state
	s.srv.mu.Unlock()
	state.lastUsed.Store(time.Now().Unix())
}

func (s *session) authenticate(a store.Account, message string) error {
	token, hash, err := newResumeToken()
	if err != nil {
		return err
	}
	state, err := s.srv.lockAccount(a)
	if err != nil {
		return err
	}
	defer state.mu.Unlock()
	if state.flushing != nil {
		if !state.flushing.World.Flush(5 * time.Second) {
			return errors.New("previous logout is still saving")
		}
		state.flushing = nil
	}
	old := state.controller
	state.controller = s
	s.state, s.account = state, a
	s.installToken(state, hash)
	if old != nil && old != s {
		old.Kick("session_replaced")
	}
	s.Send(&proto.AuthResult{OK: true, Message: message})
	s.restore(state, token)
	return nil
}

func (s *session) resume(token string) {
	// Fixed-size opaque random bearer, never an account name or password digest.
	if len(token) != 43 {
		s.fail("resume_failed", "会话已失效，请重新登录")
		return
	}
	raw, err := base64.RawURLEncoding.DecodeString(token)
	if err != nil || len(raw) != 32 {
		s.fail("resume_failed", "会话已失效，请重新登录")
		return
	}
	hash := sha256.Sum256([]byte(token))
	s.srv.mu.Lock()
	state := s.srv.tokens[hash]
	s.srv.mu.Unlock()
	if state == nil {
		s.fail("resume_failed", "会话已失效，请重新登录")
		return
	}
	state.mu.Lock()
	defer state.mu.Unlock()
	s.srv.mu.Lock()
	valid := s.srv.tokens[hash] == state && state.hash == hash
	s.srv.mu.Unlock()
	if !valid || time.Now().After(state.expires) {
		s.fail("resume_failed", "会话已失效，请重新登录")
		return
	}
	old := state.controller
	state.controller = s
	s.state, s.account = state, state.account
	state.lastUsed.Store(time.Now().Unix())
	if old != nil && old != s {
		old.Kick("session_replaced")
	}
	s.restore(state, token)
}

// restore sends the marker before all world snapshots so a new browser can
// install its Field handlers before Self/EnterFloor/BattleStart are delivered.
func (s *session) restore(state *accountSession, token string) {
	inWorld := state.char != nil && state.line != nil
	s.line, s.char = state.line, state.char
	s.Send(&proto.Session{Token: token, Resumed: inWorld, InWorld: inWorld})
	if inWorld {
		if state.line.World.Attach(int(state.char.ID), state.transport, s) {
			state.transport = s
			return
		}
		// An administrator may have removed the entity since the transport went
		// away. Do not recreate it from this identity-only snapshot.
		s.srv.mu.Lock()
		if s.srv.online[state.char.ID] == state {
			delete(s.srv.online, state.char.ID)
		}
		s.srv.mu.Unlock()
		state.char, state.line, state.transport, s.char, s.line = nil, nil, nil, nil, nil
		s.Send(&proto.Session{Token: token, Resumed: false, InWorld: false})
	}
	s.sendServerList()
}

func (s *session) detachWorld() {
	state := s.state
	if state == nil {
		return
	}
	state.mu.Lock()
	defer state.mu.Unlock()
	if state.controller != s {
		return
	}
	if state.char != nil && state.line != nil {
		state.line.World.Detach(int(state.char.ID), s)
	}
	state.controller = nil
	state.lastUsed.Store(time.Now().Unix())
}

// logout is an explicit account logout, not a network failure. The existing
// Logout message now revokes browser restoration and actually leaves the world.
func (s *session) logout() {
	state := s.state
	state.flushing = s.line
	s.leaveWorld()
	// A new login must see the latest gold/items/pets rather than the DB image
	// from before this logout. If storage is busy retain a flush fence in the
	// account record and retry it before accepting a fresh authentication.
	if state.flushing != nil && state.flushing.World.Flush(5*time.Second) {
		state.flushing = nil
	}
	s.srv.mu.Lock()
	delete(s.srv.tokens, state.hash)
	s.srv.mu.Unlock()
	state.controller = nil
	s.Send(&proto.Session{Token: "", Resumed: false, InWorld: false})
	s.state, s.account, s.line = nil, store.Account{}, nil
}

// Password changes keep the verified current controller, but invalidate all
// previously stored bearers, including copies in another browser.
func (s *session) rotateToken() {
	token, hash, err := newResumeToken()
	if err != nil {
		s.srv.mu.Lock()
		delete(s.srv.tokens, s.state.hash)
		s.srv.mu.Unlock()
		return
	}
	s.installToken(s.state, hash)
	s.Send(&proto.Session{Token: token, Resumed: false, InWorld: s.char != nil})
}

func (srv *Server) invalidateAccount(name string) {
	srv.mu.Lock()
	var state *accountSession
	for _, candidate := range srv.accounts {
		if strings.EqualFold(candidate.account.Name, name) {
			state = candidate
			break
		}
	}
	srv.mu.Unlock()
	if state == nil {
		return
	}
	state.mu.Lock()
	defer state.mu.Unlock()
	srv.mu.Lock()
	delete(srv.tokens, state.hash)
	srv.mu.Unlock()
	if old := state.controller; old != nil {
		state.controller = nil
		old.Kick("session_revoked")
		if state.char != nil && state.line != nil {
			state.line.World.Detach(int(state.char.ID), old)
		}
	}
}

// Optional world.Client capability for GM password changes. The GM command runs
// on the world goroutine, so revocation must run asynchronously to avoid a
// world.Do self-deadlock.
func (s *session) InvalidateSession() { go s.srv.invalidateAccount(s.account.Name) }

func (s *session) Connected() bool { return !s.closed.Load() }
