import test from "node:test";
import assert from "node:assert/strict";
import { mobileGeometry } from "../src/mobile-view.ts";
import { clampControlOffset } from "../src/mobile-position.ts";

test("portrait fills the full width and keeps 4:3 without borrowing control height", () => {
  for (const [width, height] of [[320,740],[390,844],[430,932],[768,1024]]) {
    const g = mobileGeometry(width, height);
    assert.equal(g.width, width); assert.equal(g.height, width * .75);
    assert.equal(g.left, 0); assert.equal(g.top, 0); assert.equal(g.landscape, false);
  }
});
test("landscape fills height where possible, stays centered and preserves independent rails", () => {
  for (const [width,height] of [[844,390],[932,430],[667,375],[568,320]]) {
    const g = mobileGeometry(width,height);
    assert.ok(g.rail >= 72); assert.ok(g.height <= height);
    assert.ok(Math.abs(g.width / g.height - 4 / 3) < 1e-12);
    assert.equal(g.left, (width-g.width)/2); assert.equal(g.top,(height-g.height)/2);
    if (width - height*4/3 >= 144) assert.equal(g.height,height);
  }
});
test("dragged controls stay within the browser after large moves and rotation", () => {
  const r={left:20,top:30,width:80,height:80};
  assert.deepEqual(clampControlOffset(r,{x:-1000,y:1000},390,844),{x:-20,y:734});
  assert.deepEqual(clampControlOffset(r,{x:400,y:400},844,390),{x:400,y:280});
});
