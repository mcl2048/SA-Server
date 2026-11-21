// Unit-cost eight-way A*: the Chebyshev heuristic uses the same units as a
// server Move. Unknown cells and intermediate warps remain impassable.
// https://www.redblobgames.com/pathfinding/a-star/implementation.html
export const PATH_MOVE                     = [[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1],[1,0],[1,1],[0,1]];



/** Alternatives are tiles of the same doorway. One search chooses the nearest
 * reachable edge; a multi-tile entrance's geometric center may be unreachable
 * without first stepping onto another warp. Never use an unknown cell to move. */
export function gridPath(w        , h        , walk            , sx        , sy        , tx        , ty        ,
  alternatives                              = [])                  {
  const search = gridPathSteps(w,h,walk,sx,sy,tx,ty,alternatives);
  let result = search.next();
  while (!result.done) result = search.next();
  return result.value;
}

/** The field advances one slice per animation frame. Yielding by expansion
 * count keeps failed world-size searches cancellable and leaves time for input;
 * the synchronous wrapper above remains useful for independent BFS comparisons.
 * A suspended search owns one map snapshot so new chunks cannot change edges
 * underneath its closed nodes. The field retries a failed old revision against
 * newly loaded data; it still checks each actual move before sending it. */
export function* gridPathSteps(w        , h        , walk            , sx        , sy        , tx        , ty        ,
  alternatives                              = [], transfers                          = [])                                   {
  return (yield* gridRouteSteps(w,h,walk,sx,sy,tx,ty,alternatives,transfers))?.path??null;
}

/** A route exposes its selected transfer separately from its walking leg:
 * multiple return passages can share the same source tile. */
export function* gridRouteSteps(w        , h        , walk            , sx        , sy        , tx        , ty        ,
  alternatives                              = [], transfers                          = [])                                    {
  if (!Number.isSafeInteger(w) || !Number.isSafeInteger(h) || w <= 0 || h <= 0 || w*h !== walk.length) return null;
  const inside = (x        , y        ) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < w && y < h;
  const enter = (x        , y        ) => inside(x,y) && walk[y*w+x] >= 2;
  if (!inside(sx,sy)) return null;
  // Preserve the normal A* fast path, cost and non-target-warp rules. Only a
  // disconnected route needs a second search across explicit safe transfers.
  // Dijkstra's zero heuristic remains admissible across arbitrary teleports,
  // and avoids an O(portal-count) heuristic in every node expansion.
  const jumps = new Map                       ();
  for (const p of transfers) if (enter(p.x,p.y) && walk[p.y*w+p.x] === 3 && enter(p.toX,p.toY)
    && (p.x!==p.toX || p.y!==p.toY)) {
      const k=p.y*w+p.x; jumps.set(k,[...(jumps.get(k)??[]),p]);
    }
  if (jumps.size) {
    const direct = yield* gridRouteSteps(w,h,walk,sx,sy,tx,ty,alternatives);
    if (direct !== null) return direct;
  }
  const targets = [[tx,ty]                   ,...alternatives].filter(([x,y]) => enter(x,y));
  if (!targets.length) return null;
  const start = sy*w+sx, goals = new Set(targets.map(([x,y]) => y*w+x));
  const gx=targets[0][0],gy=targets[0][1];
  const heuristic = jumps.size ? (_x       ,_y       ) => 0 : targets.length===1 ? (x       ,y       ) => Math.max(Math.abs(x-gx),Math.abs(y-gy)) : (x       ,y       ) => {
    let best=Infinity;
    for(const [gx,gy] of targets) best=Math.min(best,Math.max(Math.abs(x-gx),Math.abs(y-gy)));
    return best;
  };
  // The overwhelmingly common clear straight/diagonal route has an optimal
  // Chebyshev cost. Validate it before allocating whole-floor search buffers.
  // For doorways only a route to the geometrically closest entry can prove
  // optimality this way; otherwise the full multi-goal search still runs.
  const closest=Math.min(...targets.map(([x,y])=>Math.max(Math.abs(x-sx),Math.abs(y-sy))));
  for(const [gx,gy] of targets) {
    const dx=gx-sx,dy=gy-sy,steps=Math.max(Math.abs(dx),Math.abs(dy));
    if(steps!==closest)continue;
    const direct         =[];let x=sx,y=sy;
    for(let i=1;i<=steps;i++) {
      const nx=sx+Math.round(dx*i/steps),ny=sy+Math.round(dy*i/steps),mx=nx-x,my=ny-y;
      if(!enter(nx,ny)||(mx&&my&&(!enter(nx,y)||!enter(x,ny)))||(i<steps&&walk[ny*w+nx]===3))break;
      direct.push(PATH_MOVE.findIndex(([vx,vy])=>vx===mx&&vy===my));x=nx;y=ny;
    }
    if(direct.length===steps)return {path:direct};
  }
  // Integer tile IDs avoid per-node Map entries and predecessor tuples. A
  // node has at most one heap slot: decrease-key avoids stale duplicate nodes
  // flooding the queue when a long obstacle produces improving detours.
  // Only searches that may yield need a snapshot. Clear direct routes and
  // unknown/invalid goals above retain their allocation-free early returns.
  walk = walk.slice();
  const costs=new Uint32Array(w*h),ranks=new Uint32Array(w*h),positions=new Uint32Array(w*h),directions=new Uint8Array(w*h);
  const parents = jumps.size ? new Uint32Array(w*h) : null;
  const selectedTransfers = new Map                     ();
  const heap         =[];
  const before=(a       ,b       )=>ranks[a]<ranks[b] || ranks[a]===ranks[b] && costs[a]>costs[b];
  const promote=(k       )=>{
    let i=positions[k]?positions[k]-1:heap.length;
    if(i===heap.length)heap.push(k);
    while(i) {const p=(i-1)>>1;if(!before(k,heap[p]))break;heap[i]=heap[p];positions[heap[i]]=i+1;i=p;}
    heap[i]=k;positions[k]=i+1;
  };
  const pop=()=>{
    const top=heap[0],v=heap.pop() ;positions[top]=0;
    if(heap.length) {
      let i=0;
      while(i*2+1<heap.length) {
        let c=i*2+1;if(c+1<heap.length&&before(heap[c+1],heap[c]))c++;
        if(!before(heap[c],v))break;heap[i]=heap[c];positions[heap[i]]=i+1;i=c;
      }
      heap[i]=v;positions[v]=i+1;
    }
    return top;
  };
  costs[start]=1;ranks[start]=heuristic(sx,sy);promote(start);
  let expanded = 0;
  while(heap.length) {
    if (expanded++ === 256) { expanded = 0; yield; }
    const k=pop(),g=costs[k]-1;
    if(goals.has(k)) {
      const out         =[];
      let transfer                       ;
      for(let n=k;n!==start;) {
        const d=directions[n]&7;
        // A jump's predecessor stores the walking step onto its source. Drop
        // later legs: the server must confirm EnterFloor before they execute.
        if (directions[n]&16) { out.length=0; transfer=selectedTransfers.get(n); }
        out.push(d); n=parents ? parents[n]-1 : n-PATH_MOVE[d][1]*w-PATH_MOVE[d][0];
      }
      return {path:out.reverse(),transfer};
    }
    // A consistent heuristic finalizes a node on pop. Bit 3 shares the compact
    // direction array so closed nodes need neither another allocation nor work.
    directions[k]|=8;
    if(k!==start&&walk[k]===3&&!(directions[k]&16))continue;
    const x=k%w,y=Math.floor(k/w);
    for(let d=0;d<8;d++) {
      const [dx,dy]=PATH_MOVE[d],nx=x+dx,ny=y+dy,entered=ny*w+nx;
      if(!enter(nx,ny)||(dx&&dy&&(!enter(x+dx,y)||!enter(x,y+dy))))continue;
      const options=goals.has(entered)?undefined:jumps.get(entered);
      for (const transfer of options??[undefined]) {
        const nk=transfer?transfer.toY*w+transfer.toX:entered;
        if(directions[nk]&8)continue;
        const next=g+1;
        if(costs[nk]&&next+1>=costs[nk])continue;
        costs[nk]=next+1;directions[nk]=d|(transfer?16:0);
        if (parents) parents[nk]=k+1;
        if (transfer) selectedTransfers.set(nk,transfer); else selectedTransfers.delete(nk);
        ranks[nk]=next+heuristic(nx,ny);promote(nk);
      }
    }
  }
  return null;
}
