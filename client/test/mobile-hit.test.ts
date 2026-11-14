import test from "node:test";
import assert from "node:assert/strict";
import { mobileHitPoint } from "../src/mobile-hit.ts";

const hits = [{ id: "map-area", x1: 200, y1: 100, x2: 700, y2: 500 }];
test("reflowed map taps preserve the destination rather than clicking the native map center", () => {
  assert.deepEqual(mobileHitPoint(hits, "map-area", 230, 440), { x: 230, y: 440 });
});
test("stale, outside and nonfinite map points cannot become ground clicks", () => {
  for (const [x, y] of [[199, 100], [700, 100], [200, 500], [NaN, 200], [200, Infinity]])
    assert.equal(mobileHitPoint(hits, "map-area", x, y), null);
  assert.equal(mobileHitPoint([], "map-area", 230, 440), null);
  assert.equal(mobileHitPoint([{ ...hits[0], x2: 220 }], "map-area", 230, 440), null);
});

test("map drags retain the start and final move across frames without queuing unbounded pointer traffic", async () => {
  const {MobileMapPointer}=await import("../src/mobile-hit.ts");
  const input=new MobileMapPointer();
  assert.equal(input.push(hits,"map-area",300,200,"start"),true);
  for(let x=301;x<=400;x++)assert.equal(input.push(hits,"map-area",x,220,"move"),true);
  assert.equal(input.push(hits,"map-area",400,220,"end"),true);
  assert.deepEqual(input.next(hits),{x:300,y:200,down:true});
  assert.deepEqual(input.next(hits),{x:400,y:220,down:true});
  assert.deepEqual(input.next(hits),{x:400,y:220,down:false});
  assert.equal(input.active,false);assert.equal(input.next(hits),null);
});

test("cancelled, replaced and resized native map drags cannot resume or become clicks", async () => {
  const {MobileMapPointer}=await import("../src/mobile-hit.ts");
  const input=new MobileMapPointer();
  assert.equal(input.push(hits,"map-area",300,200,"move"),false,"a late move cannot invent a new press");
  assert.equal(input.push(hits,"other-area",300,200,"start"),false,"only the original map may own the drag");
  input.push(hits,"map-area",300,200,"start");input.next(hits);
  input.clear();assert.equal(input.next(hits),null);
  assert.equal(input.push(hits,"map-area",400,200,"end"),false);
  input.push(hits,"map-area",300,200,"start");
  assert.equal(input.next([{...hits[0],x2:650}]),null,"resizing the native rectangle invalidates the gesture");
  assert.equal(input.active,false);
  input.push(hits,"map-area",300,200,"start");assert.equal(input.next([]),null);
});
