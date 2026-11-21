// Static reachability across every effective unconditional native warp.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const graph=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const adj=new Map();
for(const edge of graph.edges)for(const region of edge.Source??[]){const k=`${edge.Floor},${region}`;if(!adj.has(k))adj.set(k,[]);adj.get(k).push(edge);}
const byFloor=new Map();for(const edge of graph.edges){if(!byFloor.has(edge.Floor))byFloor.set(edge.Floor,[]);byFloor.get(edge.Floor).push(edge);}
// Also permit every adjacent warp after a landing, even if its diagonal corner
// is blocked. This deliberate overapproximation closes the only region-only
// graph omission: a landing may enter a second warp without an ordinary cell.
// Unreachability in this larger graph is therefore stronger than relying on
// region IDs alone. It does not claim these permissive edges are safe routes.
const landingEdges=edge=>(byFloor.get(edge.ToFloor)??[]).filter(next=>Math.max(Math.abs(edge.ToX-next.X),Math.abs(edge.ToY-next.Y))===1);
const results=[];
for(const floor of [703,704]){
 const start=graph.points.find(p=>p.Floor===floor&&p.X===(floor===703?238:13)&&p.Y===(floor===703?96:81));
 assert.ok(start.Regions?.length,'start coordinate must be an indexed native endpoint');
 const previous=new Map(),queue=start.Regions.map(r=>`${floor},${r}`);for(const k of queue)previous.set(k,null);
 const reachedLandings=new Map();
 const startAdjacent=(byFloor.get(floor)??[]).filter(next=>Math.max(Math.abs(start.X-next.X),Math.abs(start.Y-next.Y))===1);
 for(let i=0;i<queue.length;i++)for(const edge of [...(adj.get(queue[i])??[]),...(i===0?startAdjacent:[])]){
  const pending=[edge],seen=new Set();
  for(let n=0;n<pending.length;n++){
   const via=pending[n],key=`${via.Floor},${via.X},${via.Y}`;if(seen.has(key))continue;seen.add(key);
   reachedLandings.set(`${via.ToFloor},${via.ToX},${via.ToY}`,true);
   for(const region of via.Destination??[]){const k=`${via.ToFloor},${region}`;if(previous.has(k))continue;previous.set(k,{from:queue[i],edge:via});queue.push(k);}
   pending.push(...landingEdges(via));
  }
 }
 for(const goal of graph.points.filter(p=>p.Floor===floor&&p!==start)){
  assert.ok(goal.Regions?.length,'goal entrance must have an ordinary approach');
  const reached=goal.Regions.map(r=>`${floor},${r}`).find(k=>previous.has(k));let chain=[];
  if(reached)for(let k=reached;previous.get(k);k=previous.get(k).from)chain.push(previous.get(k).edge);
  results.push({floor,start:[start.X,start.Y],startRegions:start.Regions,goal:[goal.X,goal.Y],goalRegions:goal.Regions,reachable:!!reached||reachedLandings.has(`${floor},${goal.X},${goal.Y}`),visitedRegions:previous.size,warpChain:chain.reverse().map(({Source,Destination,...edge})=>edge)});
 }
}
console.log(JSON.stringify({scope:`All 1382 loaded floors; eight-way ordinary components plus ${graph.edges.some(e=>e.Conditional)?'all valid native warps including every parsed conditional FREE/TO destination':'all valid unconditional native warps'}, with permissive adjacent-warp landing transitions; dialogue actions excluded; conditional eligibility never assumed by the product`,wallLandingUpperBound:!!graph.wallLandingUpperBound,edgeCount:graph.edges.length,conditionalEdges:graph.edges.filter(e=>e.Conditional).length,emptySources:graph.edges.filter(e=>!e.Source?.length).length,emptyDestinations:graph.edges.filter(e=>!e.Destination?.length).length,results},null,2));
