import type { Assets } from "./assets.ts";
import type { MobilePortrait } from "./ui.ts";
type PortraitTarget = MobilePortrait & { target: HTMLImageElement };
interface AnimatedPose { sources: string[]; frameMs: number; }
interface Playback { pose: AnimatedPose; selection: PortraitTarget; revision: number; startedAt: number; }

// These are existing game CG numbers, shared with menus.ts/fieldpanel.ts/battle.ts.
// Presentation is deliberately independent of native hit IDs and game state.
const ICONS: Readonly<Record<string, number>> = {
  "menu-map":26150,"menu-status":26152,"menu-pets":26154,"menu-items":26156,
  "menu-chat":26158,"menu-system":26162,"menu-quests":26248,"menu-back":26042,
  "field-interact":26103,"menu-tray":26101,
  "b-attack":25100,"b-jujutu":25102,"b-capture":25104,"b-help":25106,
  "b-guard":25108,"b-item":25110,"b-pet":25112,"b-escape":25114,
  "pb-waza":25141,"pb-cancel":25143,
};
function iconNumber(el: HTMLElement): number | undefined {
  if(el.dataset.nativeImage!==undefined){
    const image=Number(el.dataset.nativeImage);
    return Number.isSafeInteger(image) && image>0 ? image : undefined;
  }
  return ICONS[el.dataset.mobileControl ?? el.dataset.action ?? ""];
}

/** Recompose the game's own window tiles and command art at touch size.
 * DOM remains the semantic interaction/IME surface inside the viewport. We do
 * not copy the scene or create alternate game actions. Decoding is sequential
 * and cached: imageCanvas temporarily decodes a complete atlas page, so a fanout
 * here would needlessly multiply peak CPU memory on phones.
 */
export class MobileNativeSkin {
  private readonly assets: Pick<Assets,"imageCanvas">;
  private readonly icons = new Map<number, Promise<string | null>>();
  private window: Promise<string | null> | null = null;
  private readonly attached = new WeakMap<HTMLElement, number>();
  private readonly windows = new WeakSet<HTMLElement>();
  private readonly dirty = new Set<HTMLElement>();
  private pending: Promise<void> | null = null;
  private portrait: PortraitTarget | null = null;
  // At most twelve 192×176 static poses; large decoded atlas pages are discarded.
  private readonly poses = new Map<string,string | null>();
  // Two recently selected actions, at most 32 bounded RGBA/PNG frames each.
  // Long actions sample frames while retaining their original cycle duration.
  private readonly animations = new Map<string,AnimatedPose | null>();
  private revision = 0;
  private playback: Playback | null = null;
  private animationFrame = 0;
  private readonly motion: MediaQueryList | null;

  constructor(assets: Pick<Assets,"imageCanvas">) {
    this.assets = assets;
    this.motion=typeof matchMedia==="function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
    this.motion?.addEventListener?.("change",()=>this.resumePlayback());
    document.addEventListener?.("visibilitychange",()=>this.resumePlayback());
  }

  clearPortrait(): void {
    if(this.portrait)this.portrait.target.hidden=true;
    this.portrait=null;this.revision++;this.playback=null;this.stopFrame();
  }

  sync(root: HTMLElement, portrait?: PortraitTarget | null): Promise<void> {
    if(portrait!==undefined){
      const previous=this.portrait;
      if(previous?.image!==portrait?.image || previous?.rawIndex!==portrait?.rawIndex
        || previous?.target!==portrait?.target || previous?.animation?.key!==portrait?.animation?.key){
        this.clearPortrait();this.portrait=portrait;
      }
    }
    this.dirty.add(root);
    // Several changed native frames may arrive while a page is decoding. A
    // single worker coalesces them and discovers new buttons after its await;
    // independent sync calls must never decode different atlas pages at once.
    this.pending ??= this.flush().finally(() => { this.pending=null; });
    return this.pending;
  }

  private async flush(): Promise<void> {
    while (this.dirty.size) {
      const root=this.dirty.values().next().value!;
      this.dirty.delete(root);
      await this.paint(root);
      await this.paintPortrait();
    }
  }

  private async paintPortrait(): Promise<void> {
    const selection=this.portrait;if(!selection)return;
    const revision=this.revision;
    if(selection.animation && selection.animation.frames.length>1){
      const animationKey=`${selection.rawIndex}:${selection.animation.key}`;
      if(!this.animations.has(animationKey)){
        const pose=await this.makeAnimation(selection,revision);
        if(this.revision!==revision)return;
        this.animations.set(animationKey,pose);
        if(this.animations.size>2)this.animations.delete(this.animations.keys().next().value!);
      }
      const pose=this.animations.get(animationKey);
      if(pose){
        if(this.playback?.revision!==revision){
          this.playback={pose,selection,revision,startedAt:performance.now()};this.resumePlayback();
        }
        return;
      }
    }
    const key=`${selection.rawIndex ? "raw" : "cg"}:${selection.image}`;
    if(!this.poses.has(key)){
      let source: string | null=null;
      try {
        const decoded=await this.assets.imageCanvas(selection.image,selection.rawIndex);
        if(decoded){
          const original=decoded[0],scale=Math.min(1,192/original.width,176/original.height);
          const output=document.createElement("canvas");
          output.width=Math.max(1,Math.round(original.width*scale));output.height=Math.max(1,Math.round(original.height*scale));
          const context=output.getContext("2d");
          if(context){context.imageSmoothingEnabled=false;context.drawImage(original,0,0,output.width,output.height);source=output.toDataURL();}
        }
      }catch{/* Optional art never interrupts a native action or its textual content. */}
      this.poses.set(key,source);
      if(this.poses.size>12)this.poses.delete(this.poses.keys().next().value!);
    }
    // A model may finish decoding after Next/Previous/Close. Never resurrect
    // the old pet or album entry after the player's newer native selection.
    if(this.revision!==revision)return;
    const source=this.poses.get(key);
    if(source){if(selection.target.src!==source)selection.target.src=source;selection.target.hidden=false;}
  }

  private stopFrame(): void {
    if(this.animationFrame)cancelAnimationFrame(this.animationFrame);
    this.animationFrame=0;
  }

  private resumePlayback(): void {
    this.stopFrame();
    if(!this.playback || document.hidden)return;
    this.playback.startedAt=performance.now();
    this.advance(this.playback.startedAt);
  }

  private advance = (now: number): void => {
    this.animationFrame=0;
    const current=this.playback;
    if(!current || this.revision!==current.revision || document.hidden)return;
    const {pose,selection}=current;
    const index=this.motion?.matches ? 0 : Math.floor(Math.max(0,now-current.startedAt)/pose.frameMs)%pose.sources.length;
    const source=pose.sources[index];
    if(selection.target.src!==source)selection.target.src=source;
    selection.target.hidden=false;
    if(!this.motion?.matches && typeof requestAnimationFrame==="function")this.animationFrame=requestAnimationFrame(this.advance);
  };

  private async makeAnimation(selection: PortraitTarget, revision: number): Promise<AnimatedPose | null> {
    const animation=selection.animation!,count=animation.frames.length,samples=Math.min(32,count);
    const bounded: {canvas:HTMLCanvasElement;left:number;top:number;width:number;height:number}[]=[];
    const crops=new Map<number,{canvas:HTMLCanvasElement;ox:number;oy:number;width:number;height:number}>();
    let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
    try {
      for(let i=0;i<samples;i++){
        const [image,fx,fy]=animation.frames[Math.floor(i*count/samples)];
        let crop=crops.get(image);
        if(!crop){
          const decoded=image<0 ? null : await this.assets.imageCanvas(image,selection.rawIndex);
          if(this.revision!==revision)return null;
          if(!decoded)return null; // Fall back to the regular first pose if art is incomplete.
          const [original,ox,oy]=decoded,scale=Math.min(1,192/original.width,176/original.height);
          const canvas=document.createElement("canvas");
          canvas.width=Math.max(1,Math.round(original.width*scale));canvas.height=Math.max(1,Math.round(original.height*scale));
          const context=canvas.getContext("2d");if(!context)return null;
          context.imageSmoothingEnabled=false;context.drawImage(original,0,0,canvas.width,canvas.height);
          // Native timelines often repeat image IDs with different offsets.
          // Retain only the bounded crop, never decode its complete atlas twice.
          crop={canvas,ox,oy,width:original.width,height:original.height};crops.set(image,crop);
        }
        const x=crop.ox+fx,y=crop.oy+fy;
        bounded.push({canvas:crop.canvas,left:x,top:y,width:crop.width,height:crop.height});
        left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+crop.width);bottom=Math.max(bottom,y+crop.height);
      }
      const scale=Math.min(1,192/(right-left),176/(bottom-top)),sources:string[]=[];
      for(const frame of bounded){
        const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round((right-left)*scale));canvas.height=Math.max(1,Math.round((bottom-top)*scale));
        const context=canvas.getContext("2d");if(!context)return null;
        context.imageSmoothingEnabled=false;
        context.drawImage(frame.canvas,(frame.left-left)*scale,(frame.top-top)*scale,frame.width*scale,frame.height*scale);
        sources.push(canvas.toDataURL());
      }
      return {sources,frameMs:Math.max(1,animation.ticks)*(1000/60)*count/samples};
    } catch {return null;}
  }

  private async paint(root: HTMLElement): Promise<void> {
    if (!this.windows.has(root)) {
      this.windows.add(root);
      this.window ??= this.makeWindow().catch(() => null);
      const source = await this.window;
      if (source) root.style.setProperty("--native-window", `url("${source}")`);
    }
    for (const el of root.querySelectorAll<HTMLElement>("button")) {
      const cg = iconNumber(el);
      if(!cg){
        if(this.attached.has(el)){this.attached.delete(el);delete el.dataset.nativeIcon;el.style.removeProperty?.("--native-icon");}
        continue;
      }
      if (this.attached.get(el) === cg) continue;
      this.attached.set(el,cg);
      let loading = this.icons.get(cg);
      if (!loading) {
        loading = this.assets.imageCanvas(cg).then(result => result?.[0].toDataURL() ?? null).catch(() => null);
        this.icons.set(cg,loading);
        // Inventory pages can contain many distinct CGs over a long session.
        // Bound retained PNGs while keeping page inflation strictly serial.
        if(this.icons.size>128)this.icons.delete(this.icons.keys().next().value!);
      }
      const source = await loading;
      if (source && iconNumber(el)===cg) {
        el.style.setProperty("--native-icon", `url("${source}")`);
        el.dataset.nativeIcon = "true";
      }
    }
  }

  private async makeWindow(): Promise<string | null> {
    const image = document.createElement("canvas"); image.width=192;image.height=144;
    const context = image.getContext("2d"); if (!context) return null;
    context.imageSmoothingEnabled=false;
    for (let index=0;index<9;index++) {
      const part=await this.assets.imageCanvas(26001+index); if (!part) return null;
      context.drawImage(part[0],0,0,part[0].width,part[0].height,(index%3)*64,Math.floor(index/3)*48,64,48);
    }
    return image.toDataURL();
  }
}
