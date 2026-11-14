

/** Retained native slot layout. Buttons are owned by MobileShell so moving a
 * slot between layouts never changes its input handler or invents an action.
 */
export class MobileNativeCards {
           element = document.createElement("div");
          rows = new Map                                                                                                                                  ();

  constructor() { this.element.className="mobile-native-cards";this.element.hidden=true; }

  sync(cards                       , hits                      , button                                       )              {
    const live=new Map(hits.map(hit=>[hit.id,hit])),used=new Set        (),keep=new Set        ();
    let previous                  =null;
    for(const card of cards){
      const actions=card.actions.map(id=>live.get(id)).filter((hit)                 =>!!hit && !used.has(hit.id));
      if(!actions.length)continue;
      keep.add(card.id);
      let row=this.rows.get(card.id);
      if(!row){
        const element=document.createElement("article"),category=document.createElement("span"),detail=document.createElement("small"),controls=document.createElement("div");
        element.className="mobile-native-card";controls.className="mobile-native-card-controls";
        category.className="mobile-native-card-category";
        element.append(category,controls,detail);row={element,category,detail,controls};this.rows.set(card.id,row);
      }
      row.element.dataset.kind=card.kind;
      row.category.hidden=!card.category;
      if(row.category.textContent!==(card.category??""))row.category.textContent=card.category??"";
      if(row.detail.textContent!==card.detail)row.detail.textContent=card.detail;
      const primary=card.primaryAction && actions.find(hit=>hit.id===card.primaryAction .id);
      if(row.primary && row.primary.dataset.action!==primary?.id){row.primary.remove();row.primary=undefined;}
      let prior                  =null;
      for(const hit of actions){
        used.add(hit.id);const control=button(hit);
        if(hit===primary){
          control.textContent=card.primaryAction .label;
          control.dataset.primaryAction="true";
          control.setAttribute("aria-label",`${card.title}：${card.primaryAction .label}`);
          if(row.primary!==control || row.element.lastElementChild!==control)row.element.append(control);
          row.primary=control;continue;
        }
        if(hit.id===card.actions[0]){
          if(control.textContent!==card.title)control.textContent=card.title;
          const image=card.image===undefined ? "" : String(card.image);
          if(control.dataset.nativeImage!==image)control.dataset.nativeImage=image;
        }
        const next                  =prior ? prior.nextSibling : row.controls.firstChild;
        if(next!==control)row.controls.insertBefore(control,next);prior=control;
      }
      // A state-dependent ride/mail button may disappear while other controls
      // survive. Remove it now instead of retaining a stale visual operation.
      for(const child of Array.from(row.controls.children))if(!actions.some(hit=>hit.id===(child               ).dataset.action))child.remove();
      const next                  =previous ? previous.nextSibling : this.element.firstChild;
      if(next!==row.element)this.element.insertBefore(row.element,next);previous=row.element;
    }
    for(const [id,row] of this.rows)if(!keep.has(id)){row.element.remove();this.rows.delete(id);}
    this.element.hidden=keep.size===0;
    this.element.dataset.kind=cards[0]?.kind ?? "";
    return used;
  }
}
