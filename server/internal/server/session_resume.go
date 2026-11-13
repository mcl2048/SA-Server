package server

import (
	"context"
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

// All browser credentials and character actors of an account share one lock.
// Server.mu only protects indexes; never wait for this lock while holding it.
type accountSession struct {
	mu         *sync.Mutex
	account    store.Account
	controller *session
	actor      *characterActor
	root       *accountSession
	browsers   map[*accountSession]bool
	hash       [32]byte
	expires    time.Time
	lastUsed   atomic.Int64
}
type characterActor struct {
	char       *store.Character // identity only; mutable state belongs to World
	line       *Line
	transport  *session
	controller *session
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
		root := srv.accounts[a.ID]
		if root == nil {
			if len(srv.accounts) >= maxResumeAccounts {
				for id, candidate := range srv.accounts {
					if !candidate.mu.TryLock() {
						continue
					}
					busy := false
					for browser := range candidate.browsers {
						if browser.controller != nil {
							busy = true
							break
						}
					}
					if !busy {
						for _, actor := range srv.online {
							if actor.char.AccountID == id {
								busy = true
								break
							}
						}
					}
					if !busy {
						for browser := range candidate.browsers {
							delete(srv.tokens, browser.hash)
						}
						delete(srv.accounts, id)
					}
					candidate.mu.Unlock()
				}
			}
			if len(srv.accounts) >= maxResumeAccounts {
				srv.mu.Unlock()
				return nil, errors.New("session capacity")
			}
			root = &accountSession{mu: &sync.Mutex{}, account: a, browsers: map[*accountSession]bool{}}
			root.root = root
			srv.accounts[a.ID] = root
		}
		srv.mu.Unlock()
		root.mu.Lock()
		srv.mu.Lock()
		current := srv.accounts[a.ID] == root
		srv.mu.Unlock()
		if !current {
			root.mu.Unlock()
			continue
		}
		for browser := range root.browsers {
			if time.Now().After(browser.expires) && browser.controller == nil {
				srv.mu.Lock()
				delete(srv.tokens, browser.hash)
				srv.mu.Unlock()
				delete(root.browsers, browser)
			}
		}
		if len(root.browsers) >= 64 {
			var oldest *accountSession
			for browser := range root.browsers {
				if browser.controller == nil && (oldest == nil || browser.lastUsed.Load() < oldest.lastUsed.Load()) {
					oldest = browser
				}
			}
			if oldest == nil {
				root.mu.Unlock()
				return nil, errors.New("browser capacity")
			}
			srv.mu.Lock()
			delete(srv.tokens, oldest.hash)
			srv.mu.Unlock()
			delete(root.browsers, oldest)
		}
		state := &accountSession{mu: root.mu, account: a, root: root}
		root.browsers[state] = true
		return state, nil
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

func (s *session) authenticate(ctx context.Context, a store.Account, message, password string) error {
	token, hash, err := newResumeToken()
	if err != nil {
		return err
	}
	state, err := s.srv.lockAccount(a)
	if err != nil {
		return err
	}
	defer state.mu.Unlock()
	// The first expensive authentication occurs before taking the shared lock.
	// A password change/reset can finish while that request waits for this lock;
	// revalidate against storage here before installing any new credential.
	if _, err := s.srv.Store.Authenticate(ctx, a.Name, password); err != nil {
		delete(state.root.browsers, state)
		return errors.New("credentials changed during authentication")
	}
	state.controller = s
	s.state, s.account = state, a
	s.installToken(state, hash)
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
		if state.actor != nil && state.actor.controller == old {
			state.actor.controller = nil
		}
		old.Kick("session_replaced")
	}
	s.restore(state, token)
}

// restore sends the marker before all world snapshots so a new browser can
// install its Field handlers before Self/EnterFloor/BattleStart are delivered.
func (s *session) restore(state *accountSession, token string) {
	actor := state.actor
	inWorld := actor != nil && actor.controller == nil
	if actor != nil && actor.controller == s {
		inWorld = true
	}
	s.Send(&proto.Session{Token: token, Resumed: inWorld, InWorld: inWorld})
	if inWorld {
		s.char, s.line = actor.char, actor.line
		if actor.line.World.Attach(int(actor.char.ID), actor.transport, s) {
			actor.controller, actor.transport = s, s
			return
		}
		// Preserve the stale actor index as a save fence. An explicit CharEnter
		// will Flush before clearing it and loading a fresh persistence image.
		actor.controller = nil
		state.actor, s.char, s.line = nil, nil, nil
		s.Send(&proto.Session{Token: token})
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
	s.background()
	state.controller = nil
	state.lastUsed.Store(time.Now().Unix())
}

// background relinquishes only this actor's browser control, never its simulation.
func (s *session) background() {
	actor := s.state.actor
	if actor != nil && actor.controller == s {
		// Keep an inert endpoint carrying account identity for background GM
		// and mail operations, independent of the next actor this socket selects.
		retained := &session{srv: s.srv, account: s.account, log: s.log}
		retained.closed.Store(true)
		actor.line.World.Detach(int(actor.char.ID), s, retained)
		actor.transport = retained
		actor.controller = nil
	}
	s.char = nil
}

// Logout revokes this browser credential; all characters keep running.
func (s *session) logout() {
	state := s.state
	s.background()
	s.srv.mu.Lock()
	delete(s.srv.tokens, state.hash)
	s.srv.mu.Unlock()
	delete(state.root.browsers, state)
	state.controller = nil
	s.Send(&proto.Session{})
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
	s.revokeOthers(s.state)
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
	for browser := range state.browsers {
		srv.mu.Lock()
		delete(srv.tokens, browser.hash)
		srv.mu.Unlock()
		if old := browser.controller; old != nil {
			old.background()
			browser.controller = nil
			old.Kick("session_revoked")
		}
		delete(state.browsers, browser)
	}
}

// Optional world.Client capability for GM password changes. The GM command runs
// on the world goroutine, so revocation must run asynchronously to avoid a
// world.Do self-deadlock.
func (s *session) InvalidateSession() { go s.srv.invalidateAccount(s.account.Name) }

func (s *session) Connected() bool { return !s.closed.Load() }

// liveActor retires an index only after confirming that its world entity is
// absent and its asynchronous Leave has persisted. The account lock is held;
// foreign actors are never retired under another account's lock.
func (s *session) liveActor(id int64) *characterActor {
	s.srv.mu.Lock()
	actor := s.srv.online[id]
	s.srv.mu.Unlock()
	if actor == nil || actor.char.AccountID != s.account.ID {
		return actor
	}
	if _, exists := actor.line.World.CharacterSummary(int(id)); exists {
		return actor
	}
	if !actor.line.World.Flush(5 * time.Second) {
		return actor
	}
	if _, exists := actor.line.World.CharacterSummary(int(id)); exists {
		return actor
	}
	s.srv.mu.Lock()
	if s.srv.online[id] == actor {
		delete(s.srv.online, id)
	}
	s.srv.mu.Unlock()
	actor.controller = nil
	for browser := range s.state.root.browsers {
		if browser.actor != actor {
			continue
		}
		browser.actor = nil
		if old := browser.controller; old != nil && old.char != nil && old.char.ID == id {
			old.char = nil
			old.Send(&proto.LobbyReady{})
			old.sendServerList()
		}
	}
	return nil
}

// Called with the shared account lock held.
func (s *session) revokeOthers(keep *accountSession) {
	for browser := range keep.root.browsers {
		s.srv.mu.Lock()
		delete(s.srv.tokens, browser.hash)
		s.srv.mu.Unlock()
		if browser != keep {
			if old := browser.controller; old != nil {
				old.background()
				browser.controller = nil
				old.Kick("session_revoked")
			}
			delete(keep.root.browsers, browser)
		}
	}
}
