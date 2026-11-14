import test from "node:test";
import assert from "node:assert/strict";
import {MapWindow} from "../src/worldmap.ts";
import {MobileMapPointer} from "../src/mobile-hit.ts";

Object.assign(globalThis,{document:{createElement:()=>({width:0,height:0})}});
const hits=[{id:"map-area",x1:264,y1:106,x2:694,y2:462}];
function setup(){
 const routes:unknown[]=[];
 const mouse={x:-1,y:-1,down:false,clicked:false};
 const field={floor:1,navigateTo:(...xy:unknown[])=>routes.push(xy)};
 const map:any=new MapWindow({ui:{mouse},assets:{},root:"/assets/",field:()=>field} as any);
 map.cx=50;map.cy=50;map.follow=true;
 const view={floor:1,w:100,h:100};
 const input=new MobileMapPointer();
 const step=()=>{const point=input.next(hits);if(point)Object.assign(mouse,point,{clicked:false});map.pan({mouse},view);return point;};
 return {routes,mouse,map,input,step};
}
test("reflowed pointer traffic pans the existing native MapWindow and never starts navigation",()=>{
 const h=setup();h.input.push(hits,"map-area",400,200,"start");
 h.input.push(hits,"map-area",460,200,"move");h.input.push(hits,"map-area",460,200,"end");
 h.step();h.step();h.step();
 assert.equal(h.map.cx,45);assert.equal(h.map.cy,45);assert.equal(h.map.follow,false);
 assert.deepEqual(h.routes,[]);assert.equal(h.mouse.down,false);
});
test("native pan cancellation clears any retained press before the next map frame",()=>{
 const h=setup();h.input.push(hits,"map-area",400,200,"start");h.step();
 h.map.pressInside=true;h.map.cancelPointer();h.input.clear();Object.assign(h.mouse,{x:-1,y:-1,down:false,clicked:false});h.step();
 assert.equal(h.map.drag,null);assert.equal(h.map.pressInside,false);assert.deepEqual(h.routes,[]);
});
