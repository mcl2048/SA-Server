import test from "node:test";
import assert from "node:assert/strict";
import * as paths from "../src/pathfinding.ts";

test("unreachable world search yields so input and rendering can run between bounded expansions",()=>{
 const w=96,h=96,walk=new Uint8Array(w*h).fill(2);
 for(let y=0;y<h;y++)walk[y*w+48]=1;
 assert.equal(typeof paths.gridPathSteps,"function","cooperative planner is available");
 const search=paths.gridPathSteps(w,h,walk,0,0,95,95);
 let result=search.next(),yields=0;
 while(!result.done){yields++;assert.ok(yields<200);result=search.next();}
 assert.ok(yields>1,"large failed search must not finish in one frame");assert.equal(result.value,null);
});

test("cooperative planner preserves shortest path and obstacle semantics",()=>{
 assert.equal(typeof paths.gridPathSteps,"function");
 const walk=Uint8Array.from([2,1,2,2,2,2,1,2,1,2,2,2,2,1,2,2,2,2,2,3]);
 const search=paths.gridPathSteps(5,4,walk,0,0,4,3);
 let result=search.next();while(!result.done)result=search.next();
 assert.equal(result.value!.length,6,"hand checked route around wall end");
});

test("a suspended search uses one map revision while later chunks are handled by the next search",()=>{
 const w=96,h=96,walk=new Uint8Array(w*h).fill(2);
 for(let y=0;y<h;y++)walk[y*w+48]=1;
 const search=paths.gridPathSteps(w,h,walk,0,0,95,95);
 let result=search.next();assert.equal(result.done,false);
 for(let y=0;y<h;y++)walk[y*w+48]=2;
 while(!result.done)result=search.next();
 assert.equal(result.value,null,"adding edges cannot change an in-flight revision's result");
 assert.equal(paths.gridPath(w,h,walk,0,0,95,95)!.length,95,"next revision finds the newly opened route");
});
