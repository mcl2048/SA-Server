import type { Assets } from "./assets.ts";
import type { MobilePortrait } from "./ui.ts";
type PortraitTarget = MobilePortrait & { target: HTMLImageElement };

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

  constructor(assets: Pick<Assets,"imageCanvas">) { this.assets = assets; }

  clearPortrait(): void { this.portrait=null; }

  sync(root: HTMLElement, portrait?: PortraitTarget | null): Promise<void> {
    if(portrait!==undefined)this.portrait=portrait;
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
    if(this.portrait?.image!==selection.image || this.portrait.rawIndex!==selection.rawIndex
      || this.portrait.target!==selection.target)return;
    const source=this.poses.get(key);
    if(source){if(selection.target.src!==source)selection.target.src=source;selection.target.hidden=false;}
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
