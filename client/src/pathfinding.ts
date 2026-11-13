// A* on an implicit eight-way grid; unit edge costs and admissible Chebyshev heuristic.
// Reference: https://www.boost.org/doc/libs/1_85_0/libs/graph/doc/astar_search.html
export const PATH_MOVE: [number, number][] = [[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1],[1,0],[1,1],[0,1]];
export function gridPath(w: number, h: number, walk: Uint8Array, sx: number, sy: number, tx: number, ty: number): number[] | null {
  const inside = (x: number, y: number) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < w && y < h;
  const enter = (x: number, y: number) => inside(x,y) && walk[y*w+x] >= 2;
  if (!inside(sx,sy) || !enter(tx,ty)) return null;
  const start = sy*w+sx, goal = ty*w+tx;
  const heuristic = (k: number) => Math.max(Math.abs(k%w-tx), Math.abs(Math.floor(k/w)-ty));
  const cost = new Map<number, number>([[start,0]]), prev = new Map<number,[number,number]>();
  const heap: {k:number; g:number; f:number}[] = [];
  const push = (v: typeof heap[number]) => { let i = heap.length; heap.push(v); while(i) { const p=(i-1)>>1; if(heap[p].f<=v.f) break; heap[i]=heap[p]; i=p; } heap[i]=v; };
  const pop = () => { const top=heap[0], v=heap.pop()!; if(heap.length) { let i=0; while(i*2+1<heap.length) { let c=i*2+1; if(c+1<heap.length && heap[c+1].f<heap[c].f) c++; if(heap[c].f>=v.f) break; heap[i]=heap[c]; i=c; } heap[i]=v; } return top; };
  push({k:start,g:0,f:heuristic(start)});
  while(heap.length) {
    const {k,g}=pop(); if(cost.get(k)!==g) continue;
    if(k===goal) { const out:number[]=[]; for(let n=goal;n!==start;) { const [p,d]=prev.get(n)!; out.push(d); n=p; } return out.reverse(); }
    if(k!==start && walk[k]===3) continue; // Warps may only be destinations.
    const x=k%w, y=Math.floor(k/w);
    for(let d=0;d<8;d++) {
      const [dx,dy]=PATH_MOVE[d], nx=x+dx, ny=y+dy, nk=ny*w+nx;
      if(!enter(nx,ny) || (dx && dy && (!enter(x+dx,y) || !enter(x,y+dy)))) continue;
      if(g+1 >= (cost.get(nk) ?? Infinity)) continue;
      cost.set(nk,g+1); prev.set(nk,[k,d]); push({k:nk,g:g+1,f:g+1+heuristic(nk)});
    }
  }
  return null;
}
