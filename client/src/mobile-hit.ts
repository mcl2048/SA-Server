import type { MobileHit } from "./ui.ts";

/** Validate a precise click against the current native hit rectangle. Call both
 * when queuing and consuming: panels can disappear or resize between frames.
 */
export function mobileHitPoint(hits: readonly MobileHit[], id: string, x: number, y: number): { x: number; y: number } | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const hit = hits.find(hit => hit.id === id);
  return hit && x >= hit.x1 && x < hit.x2 && y >= hit.y1 && y < hit.y2 ? { x, y } : null;
}

export type MobileMapPointerPhase = "start" | "move" | "end" | "cancel";
type MapPoint = {x:number;y:number};

/** Bounded bridge to the original MapWindow.pan mouse contract. A drag has no
 * click edge: taps use mobileHitPoint separately. Preserve start and final move
 * on distinct native frames even when a complete touch occurs between frames;
 * coalesce intermediate moves so high-rate pointers cannot build a backlog.
 */
export class MobileMapPointer {
  private bounds: MobileHit | null=null;
  private start: MapPoint | null=null;
  private last: MapPoint | null=null;
  private moved: MapPoint | null=null;
  private started=false;
  private released=false;

  get active(): boolean {return this.bounds!==null;}

  clear(): void {
    this.bounds=null;this.start=this.last=this.moved=null;this.started=this.released=false;
  }

  push(hits: readonly MobileHit[],id:string,x:number,y:number,phase:MobileMapPointerPhase): boolean {
    if(phase==="cancel"){this.clear();return true;}
    const hit=hits.find(hit=>hit.id===id),point=mobileHitPoint(hits,id,x,y);
    if(id!=="map-area" || !hit || !point){this.clear();return false;}
    if(phase==="start"){
      this.bounds={...hit};this.start=this.last=point;this.moved=null;this.started=this.released=false;return true;
    }
    if(!this.matches(hit) || this.released){this.clear();return false;}
    this.moved=point;
    if(phase==="end")this.released=true;
    return true;
  }

  next(hits: readonly MobileHit[]): (MapPoint & {down:boolean}) | null {
    const hit=hits.find(hit=>hit.id===this.bounds?.id);
    if(!hit || !this.matches(hit)){this.clear();return null;}
    if(!this.started){this.started=true;return {...this.start!,down:true};}
    if(this.moved){this.last=this.moved;this.moved=null;return {...this.last,down:true};}
    if(this.released){const point={...this.last!,down:false};this.clear();return point;}
    return {...this.last!,down:true};
  }

  private matches(hit: MobileHit): boolean {
    const old=this.bounds;
    return !!old && hit.id===old.id && hit.x1===old.x1 && hit.y1===old.y1 && hit.x2===old.x2 && hit.y2===old.y2;
  }
}
