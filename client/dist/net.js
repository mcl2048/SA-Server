// WebSocket transport and opaque browser-session recovery. Passwords are never stored.
import { fillDefaults,                                  } from "./proto.gen.js?v=408f23f7bef662b4";

function redactCredentials(message        )         {
  const safe = { ...message }                           ;
  for (const key of ["token", "password", "secret", "old"]) if (Object.hasOwn(safe, key)) safe[key] = "[redacted]";
  return safe;
}
export const TRAFFIC_WINDOW = 120;
const slots = Array.from({ length: TRAFFIC_WINDOW }, () => ({ sec: -1, inMsg: 0, inBytes: 0, outMsg: 0, outBytes: 0 }));
const trafficStart = performance.now();
function slot() { const sec = Math.floor(performance.now() / 1000), s = slots[sec % TRAFFIC_WINDOW]; if (s.sec !== sec) { s.sec = sec; s.inMsg = s.inBytes = s.outMsg = s.outBytes = 0; } return s; }
function utf8Len(s        )         { let n = s.length; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c >= 0x80) n += c >= 0x800 && (c < 0xd800 || c > 0xdfff) ? 2 : 1; } return n; }
export function trafficRates() {
  const now = Math.floor(performance.now() / 1000), span = Math.max(1, Math.min(TRAFFIC_WINDOW, (performance.now() - trafficStart) / 1000));
  let inMsg = 0, inBytes = 0, outMsg = 0, outBytes = 0;
  for (const s of slots) if (s.sec > now - TRAFFIC_WINDOW && s.sec <= now) { inMsg += s.inMsg; inBytes += s.inBytes; outMsg += s.outMsg; outBytes += s.outBytes; }
  return { inMsg: inMsg / span, inKB: inBytes / 1024 / span, outMsg: outMsg / span, outKB: outBytes / 1024 / span, span };
}

export class Connection {
                   url        ;
          ws            ;
          handlers = new Map                              ();
          stopped = false;
          retry = 0;
          reconnectTimer                                       = null;
          handshakeTimer                                       = null;
          readyTimer                                       = null;
          pongTimer                                       = null;
          pendingPong                = null;
          seq = 0;
          handshakePending = true;
          awaitingResume = false;
          authenticatedByResume = false;
          wasHidden = document.hidden;
          token = "";
                   storageKey        ;
          ping                                ;
                   readyPromise               ;
          resolveReady             ;
          rejectReady                         ;
          readySettled = false;
  onClose                           = () => {};
  onReconnect                                                             = () => {};
  log                                      = () => {};
  constructor(url        ) {
    this.url = url;
    this.storageKey = `sa-session:${url}`;
    // Legacy shared credentials cannot identify which tab controls which actor.
    // Drop them and require a fresh password login rather than cross-tab takeover.
    try { localStorage.removeItem(this.storageKey); } catch { /* Storage unavailable. */ }
    try { this.token = sessionStorage.getItem(this.storageKey) || ""; } catch { /* Session-only recovery. */ }
    this.readyPromise = new Promise      ((resolve, reject) => { this.resolveReady = resolve; this.rejectReady = reject; });
    // A caller can install handlers before awaiting ready, without an early
    // socket failure producing an unhandled rejection.
    void this.readyPromise.catch(() => {});
    this.readyTimer = setTimeout(() => this.terminate("连接恢复超时，请重试登录"), 30000);
    this.ping = setInterval(() => this.checkLiveness(), 30000);
    addEventListener("online", this.wake);
    addEventListener("pageshow", this.wake);
    document.addEventListener("visibilitychange", this.wake);
    document.addEventListener("freeze", this.freeze);
    document.addEventListener("resume", this.wake);
    this.open();
  }
  /** Initial Hello and, when present, the browser token's Session acknowledgement. */
  ready()                { return this.readyPromise; }
  /** Includes reconnect handshakes after the first ready() has already resolved. */
  get recovering()          { return !this.stopped && this.handshakePending; }
  /** This transport authenticated with Resume, including a recovered lobby. */
  get recoveredSession()          { return this.authenticatedByResume; }
  static hasSession(url        )          { try { return !!sessionStorage.getItem(`sa-session:${url}`); } catch { return false; } }
          remember(token        ) {
    // An obsolete tab must never delete a newer token stored by another tab.
    const previous = this.token;
    this.token = token;
    try {
      if (token) sessionStorage.setItem(this.storageKey, token);
      else if (sessionStorage.getItem(this.storageKey) === previous) sessionStorage.removeItem(this.storageKey);
    } catch { /* Keep memory token. */ }
  }
          open() {
    if (this.stopped) return;
    this.clearSocketTimers();
    this.handshakePending = true;
    this.awaitingResume = false;
    this.authenticatedByResume = false;
    let ws           ;
    try { ws = this.ws = new WebSocket(this.url); }
    catch { this.retryTransport("无法建立连接"); return; }
    this.handshakeTimer = setTimeout(() => { if (this.ws === ws) this.retryTransport("等待服务器握手超时"); }, 8000);
    ws.onmessage = ev => {
      if (this.ws !== ws || this.stopped) return;
      let m     ;
      try { const data = String(ev.data), s = slot(); s.inMsg++; s.inBytes += utf8Len(data); m = fillDefaults(JSON.parse(data)       ); } catch { return; }
      // Never expose the bearer token to debug logging.
      this.log("←", redactCredentials(m));
      if (m.t === "Pong" && m.seq === this.pendingPong) this.clearPongTimer();
      if (m.t === "Session") {
        if (this.awaitingResume && !m.token) { this.remember(""); this.terminate("会话已失效，请重新登录"); return; }
        if (!m.token) this.authenticatedByResume = false;
        else if (this.awaitingResume) this.authenticatedByResume = true;
        this.remember(m.token); this.retry = 0;
        this.finishHandshake();
        if (m.resumed) this.onReconnect("restored", "已恢复原会话");
      }
      if (m.t === "Error" && m.code === "resume_failed") {
        this.remember("");
        for (const h of this.handlers.get(m.t) ?? []) h(m);
        this.terminate("会话已失效，请重新登录");
        return;
      }
      if (document.hidden) this.wasHidden = true;
      // Frozen tabs can receive many old world/battle frames before the
      // visibility event is delivered. Hold them even if document.hidden has
      // already flipped back; wake will replace this transport for a snapshot.
      const control = m.t === "Hello" || m.t === "Session" || m.t === "Error" || m.t === "Pong" || m.t === "AuthResult";
      if ((document.hidden || this.wasHidden) && !control) return;
      for (const h of this.handlers.get(m.t) ?? []) h(m);
      if (m.t === "Hello") {
        if (this.handshakeTimer) clearTimeout(this.handshakeTimer);
        this.handshakeTimer = null;
        if (this.token) {
          this.awaitingResume = true;
          this.handshakeTimer = setTimeout(() => { if (this.ws === ws) this.retryTransport("等待会话恢复超时"); }, 8000);
          this.send({ t: "Resume", token: this.token });
        } else this.finishHandshake();
      }
    };
    ws.onclose = ev => {
      if (this.ws !== ws || this.stopped) return;
      if (ev.reason === "session_replaced" || ev.reason === "session_revoked") {
        // Same-token tab replacement must not erase the new tab's credential.
        if (ev.reason === "session_revoked") this.remember(""); else this.token = "";
        this.terminate(ev.reason === "session_replaced" ? "这个角色已在其他设备或窗口接管" : "会话已撤销，请重新登录");
        return;
      }
      this.retryTransport(ev.reason || "连接中断");
    };
    // WebSocket errors are followed by close; the handshake deadline also covers
    // browsers that leave a failed connection in CONNECTING for too long.
  }
          finishHandshake() {
    if (this.handshakeTimer) clearTimeout(this.handshakeTimer);
    this.handshakeTimer = null;
    this.handshakePending = this.awaitingResume = false;
    if (!this.readySettled) {
      this.readySettled = true;
      if (this.readyTimer) clearTimeout(this.readyTimer);
      this.readyTimer = null;
      this.resolveReady();
    }
  }
          retryTransport(reason        ) {
    if (this.stopped) return;
    this.clearSocketTimers();
    this.discardSocket();
    if (!this.token) { this.terminate(reason); return; }
    this.handshakePending = true;
    this.awaitingResume = false;
    this.onReconnect("connecting", `${reason}，角色仍在服务端；正在恢复连接……`);
    this.scheduleRetry();
  }
          scheduleRetry() {
    if (this.stopped || this.reconnectTimer) return;
    const delay = Math.min(15000, 500 * 2 ** Math.min(5, this.retry++));
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this.open(); }, delay);
  }
          checkLiveness() {
    if (this.stopped || this.handshakePending || this.ws?.readyState !== WebSocket.OPEN || this.pongTimer) return;
    const ws = this.ws, seq = this.seq = this.seq >= 0x7ffffffe ? 1 : this.seq + 1;
    this.pendingPong = seq;
    this.pongTimer = setTimeout(() => { if (this.ws === ws && this.pendingPong === seq) this.retryTransport("网络响应超时"); }, 5000);
    this.send({ t: "Ping", seq });
  }
          freeze = () => { this.wasHidden = true; };
          wake = (event        ) => {
    if (this.stopped) return;
    if (document.hidden) { this.wasHidden = true; return; }
    const needsSnapshot = this.wasHidden || (event?.type === "pageshow" && (event                       ).persisted === true);
    this.wasHidden = false;
    if (needsSnapshot && this.token) {
      // An OPEN socket can still contain an entire obsolete battle history.
      // Resume immediately instead of replaying frames or waiting for Pong.
      this.clearSocketTimers();
      this.discardSocket();
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      this.handshakePending = true;
      this.awaitingResume = false;
      this.onReconnect("connecting", "正在同步后台期间的角色进度……");
      this.open();
      return;
    }
    if (this.ws?.readyState === WebSocket.CLOSED || this.ws?.readyState === WebSocket.CLOSING) {
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      this.open();
    } else this.checkLiveness();
  };
  on                   (t   , h                    )             {
    // Give each subscription its own identity, even for the same callback.
    let active = true;
    const listener = (m       ) => { if (active) h(m); };
    this.handlers.set(t, [...(this.handlers.get(t) ?? []), listener]);
    return () => {
      if (!active) return;
      active = false;
      const remaining = (this.handlers.get(t) ?? []).filter(x => x !== listener);
      if (remaining.length) this.handlers.set(t, remaining); else this.handlers.delete(t);
    };
  }
  once                   (t   , timeoutMs = 8000)                 {
    return new Promise((resolve, reject) => {
      const h = (m       ) => { clearTimeout(timer); remove(); resolve(m); };
      const remove = this.on(t, h);
      const timer = setTimeout(() => { remove(); reject(new Error(`等待 ${t} 超时`)); }, timeoutMs);
    });
  }
  send(m     ) {
    if (this.stopped || this.ws?.readyState !== WebSocket.OPEN) return;
    if (this.handshakePending && m.t !== "Resume" && m.t !== "Ping") return;
    this.log("→", redactCredentials(m));
    const data = JSON.stringify(m), s = slot(); s.outMsg++; s.outBytes += utf8Len(data);
    try { this.ws.send(data); } catch { this.retryTransport("发送失败"); }
  }
          clearPongTimer() { if (this.pongTimer) clearTimeout(this.pongTimer); this.pongTimer = null; this.pendingPong = null; }
          clearSocketTimers() {
    if (this.handshakeTimer) clearTimeout(this.handshakeTimer);
    this.handshakeTimer = null;
    this.clearPongTimer();
  }
          discardSocket() {
    if (!this.ws) return;
    // A late message/close from the abandoned socket cannot mutate session state.
    this.ws.onmessage = this.ws.onclose = null;
    try { this.ws.close(); } catch { /* Already unavailable. */ }
  }
          stop(reason        ) {
    this.stopped = true; clearInterval(this.ping);
    this.clearSocketTimers();
    if (this.readyTimer) clearTimeout(this.readyTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.readyTimer = this.reconnectTimer = null;
    removeEventListener("online", this.wake); removeEventListener("pageshow", this.wake); document.removeEventListener("visibilitychange", this.wake);
    document.removeEventListener("freeze", this.freeze); document.removeEventListener("resume", this.wake);
    if (!this.readySettled) { this.readySettled = true; this.rejectReady(new Error(reason)); }
  }
          terminate(reason        ) {
    if (this.stopped) return;
    this.stop(reason); this.discardSocket(); this.onClose(reason);
  }
  /** Closing transport preserves the resumable world character; Logout is explicit. */
  close() { if (!this.stopped) this.stop("连接已关闭"); this.discardSocket(); }
}
