// node --test client/test/pets-selection.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { PetWindow, type PetHost } from "../src/pets.ts";
import type { PetInfo, S2CPets } from "../src/proto.gen.ts";

// PetWindow renders the actual buttons; only canvas text metrics need a DOM shim.
Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => ({ getContext: () => ({ font: "", measureText: (s: string) => ({ width: s.length * 7 }) }) }) } });

function setup(states: string[], hp = 100) {
  let clicked = "", mailPet = -1;
  let pets = { t: "Pets", battle: states.indexOf("battle"), ride: -1, pets: states.map((state, slot) => ({ slot, state, hp, name: `pet${slot}`, freeName: "", level: 10, maxHp: 100, trans: 0, attrs: [0, 0, 0, 0], loyalty: 100, rideable: false } as PetInfo)) } as S2CPets;
  const statesSent: [number, string][] = [], mailSelections: number[] = [];
  const ui = { bottomLine: "", mouse: { rightClicked: false }, hitBox() { return false; }, hovered() { return false; }, box() {},
    image(_image: number, _x: number, _y: number, id?: string) { return id === clicked; }, clicked(id: string) { return id === clicked; },
    text(_x: number, _y: number, _text: string, _color?: string, id?: string) { return id === clicked; } };
  const host = { ui, pets: () => pets, mailPet: () => mailPet,
    setMailPet(slot: number) { mailPet = slot; mailSelections.push(slot); },
    setState(slot: number, state: string) {
      statesSent.push([slot, state]);
      // Model the authoritative server acknowledgement: at most four standby,
      // plus one primary; return a new snapshot so the next click can proceed.
      if (state === "standby" && pets.pets.filter((p) => p.slot !== slot && p.state === "standby").length >= 4) return;
      pets = { ...pets, battle: state === "battle" ? slot : pets.battle === slot ? -1 : pets.battle,
        pets: pets.pets.map((p) => p.slot === slot ? { ...p, state } : p) };
    },
  } as unknown as PetHost;
  const window = new PetWindow(host);window.open = true;
  return { host, window, statesSent, mailSelections, snapshot: () => pets,
    click(id: string) { clicked = id;window.frame([]);clicked = ""; } };
}

test("status buttons select one primary and all four remaining pets for battle", () => {
  const h = setup(["rest", "rest", "rest", "rest", "rest"]);
  h.click("pet-st0");h.click("pet-st0");
  for (let slot = 1; slot < 5; slot++) h.click(`pet-st${slot}`);
  assert.deepEqual(h.snapshot().pets.map((p) => p.state), ["battle", "standby", "standby", "standby", "standby"]);
  assert.equal(h.snapshot().battle, 0);
  assert.deepEqual(h.statesSent.at(-1), [4, "standby"]);
  assert.deepEqual(h.mailSelections, []);
});

test("a fifth selection becomes the primary when four pets are already standby", () => {
  const h = setup(["standby", "standby", "standby", "standby", "rest"]);
  h.click("pet-st4");
  assert.deepEqual(h.statesSent, [[4, "battle"]]);
  assert.equal(h.snapshot().battle, 4);
  assert.equal(h.snapshot().pets.filter((p) => p.state === "standby").length, 4);
  assert.deepEqual(h.mailSelections, []);
});

test("mail selection stays available separately and never consumes the fifth combat selection", () => {
  const h = setup(["battle", "standby", "standby", "standby", "rest"]);
  h.click("pet-mail4");
  assert.deepEqual(h.mailSelections, [4]);assert.deepEqual(h.statesSent, []);
  h.click("pet-mail4");assert.deepEqual(h.mailSelections, [4, -1]);
  h.click("pet-st4");assert.deepEqual(h.statesSent, [[4, "standby"]]);
  h.click("pet-mail0");assert.deepEqual(h.mailSelections, [4, -1]);
});

test("mail, riding and zero-HP pets retain their state protections", () => {
  const away = setup(["mail"]);away.click("pet-st0");assert.deepEqual(away.statesSent, []);
  const down = setup(["standby"], 0);down.click("pet-st0");assert.deepEqual(down.statesSent, []);
  const fifthDown = setup(["standby", "standby", "standby", "standby", "rest"], 0);fifthDown.click("pet-st4");assert.deepEqual(fifthDown.statesSent, []);
  const ride = setup(["ride"]);ride.click("pet-st0");assert.deepEqual(ride.statesSent, [[0, "rest"]]);
  const mail = setup(["rest"]);mail.click("pet-mail0");mail.click("pet-st0");assert.deepEqual(mail.mailSelections, [0, -1]);assert.deepEqual(mail.statesSent, []);
});
