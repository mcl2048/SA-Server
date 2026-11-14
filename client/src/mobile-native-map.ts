import type { Ui, MobileHit } from "./ui.ts";
import type { MobileMapPointerPhase } from "./mobile-hit.ts";

/** Reuse the native map's already rendered base/marks, not a scene screenshot.
 * The surface is screen-sized while taps return to the original map hit bounds;
 * the host revalidates those bounds before feeding its normal input pipeline.
 */
export class MobileNativeMap {
  private canvas: HTMLCanvasElement | null = null;
  private hit: MobileHit | null = null;
  private drawnAt = -Infinity;
  private press: {id:number;x:number;y:number;moved:boolean;logicalX:number;logicalY:number} | null=null;
  private readonly content: HTMLElement;
  private readonly point: (id: string, x: number, y: number) => void;
  private readonly pointer?: (id:string,x:number,y:number,phase:MobileMapPointerPhase)=>void;

  constructor(content: HTMLElement, point: (id: string, x: number, y: number) => void,
    pointer?: (id:string,x:number,y:number,phase:MobileMapPointerPhase)=>void) {
    this.content=content;this.point=point;this.pointer=pointer;
  }

  sync(ui: Ui, hits: readonly MobileHit[], active: boolean): void {
    const next=active ? hits.find(hit=>hit.id==="map-area") ?? null : null;
    if(this.hit && (!next || next.x1!==this.hit.x1 || next.x2!==this.hit.x2 || next.y1!==this.hit.y1 || next.y2!==this.hit.y2))this.cancel();
    this.hit=next;
    if (!this.hit) { this.cancel();this.drawnAt=-Infinity;if (this.canvas) this.canvas.hidden=true;return; }
    if (!this.canvas) this.create();
    const canvas=this.canvas!;canvas.hidden=false;
    const now=performance.now();if (now-this.drawnAt<50) return;
    const hit=this.hit,width=hit.x2-hit.x1,height=hit.y2-hit.y1;
    const pictures=(ui.pics ?? []).filter(p=>p.x===hit.x1 && p.y===hit.y1 && p.canvas.width===width && p.canvas.height===height);
    if (!pictures.length) return;
    this.drawnAt=now;
    if(canvas.width!==width)canvas.width=width;if(canvas.height!==height)canvas.height=height;
    const context=canvas.getContext("2d");if(!context)return;
    context.clearRect(0,0,width,height);context.imageSmoothingEnabled=false;
    for(const picture of pictures)context.drawImage(picture.canvas,0,0);
  }

  private create(): void {
    const canvas=document.createElement("canvas");this.canvas=canvas;
    canvas.className="mobile-shell-native-map";canvas.dataset.mobileMap="true";
    canvas.setAttribute("role","img");canvas.setAttribute("aria-label","区域地图，轻点选择目的地，拖动平移");
    this.content.insertBefore(canvas,this.content.firstChild);
    canvas.addEventListener("pointerdown",event=>{
      if(!event.isPrimary || this.press){this.cancel();return;}
      const point=this.position(event.clientX,event.clientY,false);if(!point)return;
      this.press={id:event.pointerId,x:event.clientX,y:event.clientY,moved:false,logicalX:point.x,logicalY:point.y};
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove",event=>{
      this.move(event.pointerId,event.clientX,event.clientY);
    });
    canvas.addEventListener("pointerup",event=>{
      if(this.press?.id!==event.pointerId)return;
      this.move(event.pointerId,event.clientX,event.clientY);
      const start=this.press;this.press=null;
      if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
      const hit=this.hit;
      if(!start || start.id!==event.pointerId || !hit || canvas.hidden)return;
      const point=this.position(event.clientX,event.clientY,start.moved);if(!point)return;
      if(start.moved)this.pointer?.(hit.id,point.x,point.y,"end");
      else this.point(hit.id,point.x,point.y);
    });
    for(const event of ["pointercancel","lostpointercapture"])canvas.addEventListener(event,()=>this.cancel());
    addEventListener("blur",()=>this.cancel());
    document.addEventListener("visibilitychange",()=>{if(document.hidden)this.cancel();});
    document.addEventListener("pointerdown",event=>{if(this.press && event.pointerId!==this.press.id)this.cancel();},{capture:true});
    for(const event of ["sa-mobile-gesture","sa-device-change"])document.addEventListener(event,()=>this.cancel());
  }

  private move(id:number,x:number,y:number): void {
    const press=this.press,hit=this.hit;
    if(!press || press.id!==id || !hit)return;
    if(!press.moved && Math.hypot(x-press.x,y-press.y)<=10)return;
    if(!press.moved){
      press.moved=true;
      this.pointer?.(hit.id,press.logicalX,press.logicalY,"start");
    }
    const point=this.position(x,y,true);
    if(point)this.pointer?.(hit.id,point.x,point.y,"move");
  }

  private position(clientX:number,clientY:number,clamp:boolean): {x:number;y:number} | null {
    const hit=this.hit,rect=this.canvas?.getBoundingClientRect();
    if(!hit || !rect?.width || !rect.height)return null;
    let x=(clientX-rect.left)/rect.width,y=(clientY-rect.top)/rect.height;
    if(!Number.isFinite(x) || !Number.isFinite(y))return null;
    if(clamp){x=Math.max(0,Math.min(1-1e-9,x));y=Math.max(0,Math.min(1-1e-9,y));}
    else if(x<0 || x>=1 || y<0 || y>=1)return null;
    return {x:hit.x1+x*(hit.x2-hit.x1),y:hit.y1+y*(hit.y2-hit.y1)};
  }

  private cancel(): void {
    const press=this.press;this.press=null;
    if(press?.moved)this.pointer?.("map-area",press.logicalX,press.logicalY,"cancel");
    if(press && this.canvas?.hasPointerCapture(press.id))this.canvas.releasePointerCapture(press.id);
  }
}
