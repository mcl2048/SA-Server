

/** Validate a precise click against the current native hit rectangle. Call both
 * when queuing and consuming: panels can disappear or resize between frames.
 */
export function mobileHitPoint(hits                      , id        , x        , y        )                                  {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const hit = hits.find(hit => hit.id === id);
  return hit && x >= hit.x1 && x < hit.x2 && y >= hit.y1 && y < hit.y2 ? { x, y } : null;
}




/** Bounded bridge to the original MapWindow.pan mouse contract. A drag has no
 * click edge: taps use mobileHitPoint separately. Preserve start and final move
 * on distinct native frames even when a complete touch occurs between frames;
 * coalesce intermediate moves so high-rate pointers cannot build a backlog.
 */
export class MobileMapPointer {
          bounds                  =null;
          start                 =null;
          last                 =null;
          moved                 =null;
          started=false;
          released=false;

  get active()          {return this.bounds!==null;}

  clear()       {
    this.bounds=null;this.start=this.last=this.moved=null;this.started=this.released=false;
  }

  push(hits                      ,id       ,x       ,y       ,phase                      )          {
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

  next(hits                      )                                     {
    const hit=hits.find(hit=>hit.id===this.bounds?.id);
    if(!hit || !this.matches(hit)){this.clear();return null;}
    if(!this.started){this.started=true;return {...this.start ,down:true};}
    if(this.moved){this.last=this.moved;this.moved=null;return {...this.last,down:true};}
    if(this.released){const point={...this.last ,down:false};this.clear();return point;}
    return {...this.last ,down:true};
  }

          matches(hit           )          {
    const old=this.bounds;
    return !!old && hit.id===old.id && hit.x1===old.x1 && hit.y1===old.y1 && hit.x2===old.x2 && hit.y2===old.y2;
  }
}
