import assert from "node:assert/strict";
import test from "node:test";
import { immersiveScene } from "../src/mobile-camera.ts";

test("portrait immersive scene fills the viewport at native scale or larger without stretching", () => {
  const scene = immersiveScene(390, 844);
  assert.equal(scene.scale, 844 / 600);
  assert.ok(Math.abs(scene.width - 1125.3333333333333) < 1e-9);
  assert.equal(scene.height, 844);
  assert.ok(Math.abs(scene.left + 367.66666666666663) < 1e-9);
  assert.equal(scene.top, 0);
  assert.ok(scene.scale >= 1);
});

test("landscape immersive scene keeps native character pixels and crops vertically", () => {
  const scene = immersiveScene(844, 390);
  assert.equal(scene.scale, 844 / 800);
  assert.equal(scene.left, 0);
  assert.equal(scene.top, -121.5);
  assert.equal(scene.width, 844);
  assert.equal(scene.height, 633);
});

test("focusing edge targets never reveals empty space outside the original scene", () => {
  for (const [width, height] of [[320, 568], [390, 844], [844, 390], [1024, 768]]) {
    for (const [x, y] of [[-100, -100], [0, 0], [400, 300], [800, 600], [1000, 1000]]) {
      const scene = immersiveScene(width, height, x, y, 2);
      assert.ok(scene.left <= 0 && scene.top <= 0);
      assert.ok(scene.left + scene.width >= width - 1e-9);
      assert.ok(scene.top + scene.height >= height - 1e-9);
      // The same transform is invertible for native game intents at every crop.
      assert.ok(Math.abs(((400 * scene.scale + scene.left) - scene.left) / scene.scale - 400) < 1e-9);
    }
  }
});

test("invalid or shrunken inputs cannot create NaN geometry or shrink immersive character scale", () => {
  for (const args of [[NaN, Infinity, NaN, Infinity, NaN], [0, -1, 400, 300, -10]]) {
    const scene = immersiveScene(...args as [number, number, number, number, number]);
    assert.ok(Object.values(scene).every(Number.isFinite));
    assert.ok(scene.scale >= 1);
  }
});
