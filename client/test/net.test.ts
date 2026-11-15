// node --test client/test/net.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { Connection } from "../src/net.ts";
import { Field } from "../src/field.ts";
import type { Assets } from "../src/assets.ts";
import type { C2S } from "../src/proto.gen.ts";

type Timer = { at: number; run: () => void; interval: number };
class Clock {
  now = 0; next = 1; timers = new Map<number, Timer>();
  add = (run: () => void, delay = 0, interval = 0) => { const id = this.next++; this.timers.set(id, { at: this.now + delay, run, interval }); return id; };
  clear = (id: number) => { this.timers.delete(id); };
  tick(ms: number) {
    const until = this.now + ms;
    for (;;) {
      const due = [...this.timers].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!due) break;
      const [id, timer] = due; this.now = timer.at;
      if (timer.interval) timer.at += timer.interval; else this.timers.delete(id);
      timer.run();
    }
    this.now = until;
  }
}
class Socket {
  static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
  static all: Socket[] = [];
  readyState = Socket.CONNECTING; sent: any[] = []; closed = 0;
  onmessage: ((event: any) => void) | null = null;
  onclose: ((event: any) => void) | null = null;
  constructor(_url: string) { Socket.all.push(this); }
  send(data: string) { if (this.readyState !== Socket.OPEN) throw Error("socket unavailable"); this.sent.push(JSON.parse(data)); }
  close() { this.closed++; this.readyState = Socket.CLOSED; }
  message(message: any) { this.readyState = Socket.OPEN; this.onmessage?.({ data: JSON.stringify(message) }); }
  serverClose(reason = "") { this.readyState = Socket.CLOSED; this.onclose?.({ reason }); }
}
const url = "ws://test/ws", storageKey = `sa-session:${url}`, token = "x".repeat(43);
function environment(t: any, stored = "") {
  const clock = new Clock(), window = new EventTarget(), document = Object.assign(new EventTarget(), { hidden: false });
  const storage = new Map<string, string>(); if (stored) storage.set(storageKey, stored);
  Socket.all = [];
  const replacements: Record<string, any> = {
    WebSocket: Socket, document,
    sessionStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) },
    addEventListener: window.addEventListener.bind(window), removeEventListener: window.removeEventListener.bind(window),
    setTimeout: clock.add, clearTimeout: clock.clear,
    setInterval: (run: () => void, delay: number) => clock.add(run, delay, delay), clearInterval: clock.clear,
  };
  const old = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries(replacements)) { old.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); }
  t.after(() => { connection.close(); for (const [key, descriptor] of old) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } });
  const connection = new Connection(url);
  return { clock, window, document, storage, connection, first: Socket.all[0] };
}
const hello = (socket: Socket) => socket.message({ t: "Hello", version: "test", serverTime: 1 });
const session = (socket: Socket, raw = token, inWorld = true) => socket.message({ t: "Session", token: raw, resumed: inWorld, inWorld });

test("ready waits for Hello and permits password login only after no-token handshake", async t => {
  const { connection, first } = environment(t);
  let ready = false; void connection.ready().then(() => { ready = true; });
  connection.send({ t: "Login", account: "user", password: "digest" }); assert.deepEqual(first.sent, []);
  assert.equal(connection.recovering, true); hello(first); await connection.ready();
  assert.equal(ready, true); assert.equal(connection.recovering, false);
  connection.send({ t: "Login", account: "user", password: "digest" }); assert.equal(first.sent[0].t, "Login");
});

test("token handshake waits for Session, dispatches snapshot settings before ready continuation, and redacts bearer", async t => {
  const { connection, first } = environment(t, token); const logs: object[] = [], order: string[] = [];
  connection.log = (_dir, message) => logs.push(message);
  connection.on("Session", () => order.push("session"));
  void connection.ready().then(() => order.push("ready"));
  hello(first); await Promise.resolve();
  assert.equal(connection.recovering, true); assert.deepEqual(order, []); assert.equal(first.sent[0].t, "Resume");
  connection.send({ t: "Login", account: "user", password: "digest" }); assert.equal(first.sent.length, 1);
  session(first); await connection.ready(); assert.deepEqual(order, ["session", "ready"]);
  assert.equal(connection.recovering, false); assert.ok(!JSON.stringify(logs).includes(token));
});

test("debug logs redact authentication credentials without modifying wire messages", async t => {
  const { connection, first } = environment(t); const logs: object[] = [];
  connection.log = (_direction, message) => logs.push(message); hello(first); await connection.ready();
  const password = "password-digest", secret = "secret-digest", old = "old-digest";
  const messages: C2S[] = [
    { t: "Login", account: "user", password }, { t: "Register", account: "user", password, secret },
    { t: "ResetPassword", account: "user", password, secret }, { t: "ChangePassword", old, password }, { t: "ChangeSecret", password, secret },
  ];
  for (const message of messages) connection.send(message);
  assert.deepEqual(first.sent, messages);
  const text = JSON.stringify(logs); for (const credential of [password, secret, old]) assert.ok(!text.includes(credential));
  assert.equal((logs.at(-1) as any).password, "[redacted]"); assert.equal((logs.at(-1) as any).secret, "[redacted]");
});

test("recoveredSession identifies a resumed lobby and resets on explicit logout", async t => {
  const { connection, first } = environment(t, token);
  assert.equal(connection.recoveredSession, false); hello(first); session(first, token, false); await connection.ready();
  assert.equal(connection.recoveredSession, true);
  session(first, "", false); assert.equal(connection.recoveredSession, false);
  session(first, "password-login-token", false); assert.equal(connection.recoveredSession, false);
});

test("Hello and Session deadlines replace stale sockets while preserving one ready promise", async t => {
  const { connection, first, clock } = environment(t, token); const ready = connection.ready();
  const staleMessage = first.onmessage!;
  clock.tick(8000); assert.equal(first.closed, 1); clock.tick(500);
  const second = Socket.all[1]; assert.ok(second); hello(second);
  clock.tick(8000); assert.equal(second.closed, 1); clock.tick(1000);
  const third = Socket.all[2]; assert.ok(third);
  staleMessage({ data: JSON.stringify({ t: "Session", token: "obsolete", resumed: true, inWorld: true }) });
  assert.equal(connection.recovering, true);
  hello(third); session(third); await ready;
  assert.equal(connection.recovering, false); assert.equal(Socket.all.length, 3);
});

test("waking an OPEN half-dead connection requires matching Pong within five seconds", async t => {
  const { connection, first, clock, window } = environment(t, token); hello(first); session(first); await connection.ready();
  window.dispatchEvent(new Event("pageshow")); const probe = first.sent.at(-1); assert.equal(probe.t, "Ping");
  first.message({ t: "Pong", seq: probe.seq + 1, serverTime: 1 });
  clock.tick(4999); assert.equal(first.closed, 0); clock.tick(1); assert.equal(first.closed, 1);
  clock.tick(500); const second = Socket.all[1]; hello(second); session(second);
  assert.equal(connection.recovering, false);
  window.dispatchEvent(new Event("online")); const next = second.sent.at(-1); second.message({ t: "Pong", seq: next.seq, serverTime: 1 });
  clock.tick(5000); assert.equal(second.closed, 0); assert.equal(Socket.all.length, 2);
});

test("returning from a frozen tab immediately resumes a live socket and discards queued world history", async t => {
  const { connection, first, document, window } = environment(t, token); hello(first); session(first); await connection.ready();
  const seen: string[] = [];
  connection.on("BattleTurn", () => seen.push("turn")); connection.on("BattleEnd", () => seen.push("end")); connection.on("Status", () => seen.push("status"));
  const oldMessage = first.onmessage!;
  document.hidden = true; document.dispatchEvent(new Event("visibilitychange"));
  first.message({ t: "BattleTurn", events: [] }); first.message({ t: "BattleEnd", result: "win" }); first.message({ t: "Status", level: 2 });
  assert.deepEqual(seen, []);
  // Browser state can become visible before the visibility callback runs.
  document.hidden = false; first.message({ t: "BattleTurn", events: [] }); assert.deepEqual(seen, []);
  document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(first.closed, 1); assert.equal(Socket.all.length, 2); assert.equal(connection.recovering, true);
  const second = Socket.all[1]; hello(second); assert.deepEqual(second.sent[0], { t: "Resume", token }); session(second);
  oldMessage({ data: JSON.stringify({ t: "BattleEnd", result: "lose" }) }); assert.deepEqual(seen, []);
  second.message({ t: "Status", level: 3 }); assert.deepEqual(seen, ["status"]);
  window.dispatchEvent(new Event("pageshow")); assert.equal(Socket.all.length, 2); // No duplicate resume.
});

test("lifecycle freeze without visibility changes discards old turns and resumes once when active", async t => {
  const { connection, first, document } = environment(t, token); hello(first); session(first); await connection.ready();
  let battleEnds = 0; connection.on("BattleEnd", () => battleEnds++);
  document.dispatchEvent(new Event("freeze")); assert.equal(document.hidden, false);
  first.message({ t: "BattleEnd", result: "win" }); assert.equal(battleEnds, 0);
  document.dispatchEvent(new Event("resume")); assert.equal(Socket.all.length, 2);
  const second = Socket.all[1]; hello(second); session(second);
  document.dispatchEvent(new Event("resume")); assert.equal(Socket.all.length, 2);
  second.message({ t: "BattleEnd", result: "win" }); assert.equal(battleEnds, 1);
  // A lifecycle resume while still hidden waits for visible, without opening twice.
  document.hidden = true; document.dispatchEvent(new Event("freeze")); document.dispatchEvent(new Event("resume")); assert.equal(Socket.all.length, 2);
  document.hidden = false; document.dispatchEvent(new Event("visibilitychange")); assert.equal(Socket.all.length, 3);
});

test("restoring from back-forward cache requests a snapshot even without a visibility event", async t => {
  const { connection, first, window } = environment(t, token); hello(first); session(first); await connection.ready();
  window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
  assert.equal(Socket.all.length, 2); const second = Socket.all[1]; hello(second); session(second);
  assert.equal(connection.recoveredSession, true);
});

test("a token handshake while hidden completes readiness but defers world dispatch until a fresh visible snapshot", async t => {
  const { connection, first, document } = environment(t, token); const seen: string[] = [];
  connection.on("Session", () => seen.push("session")); connection.on("BattleStart", () => seen.push("battle"));
  document.hidden = true; document.dispatchEvent(new Event("visibilitychange")); hello(first); session(first); await connection.ready();
  first.message({ t: "BattleStart", fighters: [] }); assert.deepEqual(seen, ["session"]);
  document.hidden = false; document.dispatchEvent(new Event("visibilitychange")); assert.equal(Socket.all.length, 2);
  const second = Socket.all[1]; hello(second); session(second); second.message({ t: "BattleStart", fighters: [] });
  assert.deepEqual(seen, ["session", "session", "battle"]);
});

test("terminal replacement stops reconnecting without clearing another tab's bearer", async t => {
  const { connection, first, storage, clock } = environment(t, token); hello(first); session(first); await connection.ready();
  const reasons: string[] = []; connection.onClose = reason => reasons.push(reason);
  first.serverClose("session_replaced"); clock.tick(60000);
  assert.equal(Socket.all.length, 1); assert.equal(reasons.length, 1); assert.equal(storage.get(storageKey), token); assert.equal(connection.recovering, false);
});

test("failed resume rejects readiness, stops timers, and cannot erase a newer sessionStorage token", async t => {
  const { connection, first, storage, clock } = environment(t, token); const failed = assert.rejects(connection.ready(), /会话已失效/);
  hello(first); storage.set(storageKey, "new-device-token");
  first.message({ t: "Error", code: "resume_failed", message: "invalid" }); await failed;
  assert.equal(storage.get(storageKey), "new-device-token"); assert.equal(clock.timers.size, 0);
});

test("initial connection has a thirty-second total limit and retains resumable credentials", async t => {
  const { connection, storage, clock } = environment(t, token); const failed = assert.rejects(connection.ready(), /连接恢复超时/);
  clock.tick(30000); await failed;
  assert.equal(storage.get(storageKey), token); assert.equal(clock.timers.size, 0); assert.equal(connection.recovering, false);
});

test("manual close rejects pending readiness and detaches all timers without clearing credentials", async t => {
  const { connection, first, storage, clock, window } = environment(t, token); const failed = assert.rejects(connection.ready(), /连接已关闭/);
  connection.close(); await failed; clock.tick(60000); window.dispatchEvent(new Event("pageshow"));
  assert.equal(first.closed >= 1, true); assert.equal(clock.timers.size, 0); assert.equal(storage.get(storageKey), token); assert.equal(Socket.all.length, 1);
});

test("no-token Hello timeout fails once and late messages cannot restore abandoned UI", async t => {
  const { connection, first, clock } = environment(t); const failed = assert.rejects(connection.ready(), /握手超时/);
  let sessions = 0, closes = 0; connection.on("Session", () => sessions++); connection.onClose = () => closes++;
  const staleMessage = first.onmessage!; clock.tick(8000); await failed;
  staleMessage({ data: JSON.stringify({ t: "Session", token, resumed: true, inWorld: true }) });
  assert.equal(sessions, 0); assert.equal(closes, 1); assert.equal(clock.timers.size, 0);
});


test("separate tabs do not inherit or overwrite another tab's actor credential", async t => {
 const {connection,first,storage} = environment(t,token);
 hello(first); session(first); await connection.ready();
 const other = new Map<string,string>();
 Object.defineProperty(globalThis,"sessionStorage",{configurable:true,writable:true,value:{getItem:(k:string)=>other.get(k)??null,setItem:(k:string,v:string)=>other.set(k,v),removeItem:(k:string)=>other.delete(k)}});
 assert.equal(Connection.hasSession(url),false);
 const secondConnection = new Connection(url);
 const second = Socket.all[1]; hello(second); await secondConnection.ready();
 assert.deepEqual(second.sent,[]);
 secondConnection.send({t:"Login",account:"user",password:"digest"});
 session(second,"another-tab-token",false);
 assert.equal(other.get(storageKey),"another-tab-token");
 assert.equal(storage.get(storageKey),token);
 secondConnection.close();
});

test("legacy shared localStorage credential is discarded without implicit takeover", async t => {
 const {connection,first} = environment(t);
 const previous = Object.getOwnPropertyDescriptor(globalThis,"localStorage");
 const legacy = new Map([[storageKey,token]]);
 Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{removeItem:(key:string)=>legacy.delete(key)}});
 t.after(()=>{if(previous) Object.defineProperty(globalThis,"localStorage",previous);else Reflect.deleteProperty(globalThis,"localStorage");});
 hello(first);await connection.ready();
 const fresh = new Connection(url);
 const socket=Socket.all[1];hello(socket);await fresh.ready();
 assert.equal(legacy.has(storageKey),false);assert.deepEqual(socket.sent,[]);fresh.close();
});


test("repeated character switching releases Field handlers and ignores disposed actors", async t => {
 const {connection,first}=environment(t);hello(first);await connection.ready();
 const handlers=(connection as unknown as {handlers:Map<string,unknown[]>}).handlers;
 const count=()=>[...handlers.values()].reduce((sum,list)=>sum+list.length,0);
 const baseline=count();
 const keep=connection.on("Self",()=>{});
 for(let i=0;i<100;i++) {
  const field=new Field({} as Assets,connection);
  const active=count();assert.ok(active>baseline+1);
  first.message({t:"Self",id:i+1,name:"active",sprite:100000});
  assert.equal(field.self?.id,i+1);
  field.dispose();field.dispose();
  assert.equal(count(),baseline+1,"only Field-owned handlers must be removed");
  first.message({t:"Self",id:1000,name:"next",sprite:100000});
  assert.equal(field.self,null,"disposed Field must not consume a later character snapshot");
 }
 keep();assert.equal(count(),baseline);
});

test("unsubscribe preserves duplicate registrations and once removes its listener",async t=>{
 const {connection,first}=environment(t);hello(first);await connection.ready();
 let calls=0;const callback=()=>calls++;
 const one=connection.on("Self",callback),two=connection.on("Self",callback);
 one();one();first.message({t:"Self",id:1,name:"one",sprite:100000});assert.equal(calls,1);
 two();first.message({t:"Self",id:2,name:"two",sprite:100000});assert.equal(calls,1);
 const handlers=(connection as unknown as {handlers:Map<string,unknown[]>}).handlers;
 const result=connection.once("Self");first.message({t:"Self",id:3,name:"three",sprite:100000});
 assert.equal((await result).id,3);assert.equal(handlers.has("Self"),false);
});

test("wire-level location entries restore omitted zero coordinates before actual navigation",async t=>{
 const {connection,first}=environment(t);hello(first);await connection.ready();
 const field=new Field({} as Assets,connection);t.after(()=>field.dispose());
 first.message({t:"Self",id:1,name:"edge",sprite:100000});
 first.message({t:"EnterFloor",floor:1,name:"edge",width:10,height:10,x:1,y:8,mapVer:"zero-edge",step:260});
 await new Promise(resolve=>setImmediate(resolve));
 first.message({t:"MapData",floor:1,x1:0,y1:0,x2:10,y2:10,tiles:Array(100).fill(100),objs:Array(100).fill(0),walk:"1".repeat(100),ver:"zero-edge"});
 // Exactly the Go omitempty wire shape: x=0 and conditional=false are absent.
 first.message({t:"NpcList",floor:1,places:[{name:"边界洞窟",floor:2,entrances:[{y:8}]}]});
 const place=field.mapPlaces(1)![0];
 assert.deepEqual(place.entrances[0],{x:0,y:8},"nested zero values must be restored by the real Connection decoder");
 assert.equal(place.conditional,false);
 field.navigatePlace(1,place);assert.deepEqual(field.target,[0,8]);
 field.update(performance.now());
 assert.ok(first.sent.some(m=>m.t==="Move"&&m.x===1&&m.y===8&&m.dir===1),"zero-coordinate doorway must cause a real legal Move");
 first.message({t:"NpcList",floor:1});
 assert.deepEqual(field.mapPlaces(1),[],"legacy servers without the new array remain compatible");
});
