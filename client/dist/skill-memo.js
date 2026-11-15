import { FONT, wrapBytes,         } from "./ui.js?v=8a026288d656cdb2";

// The new skill's full rules exceed the native three-line description area.
// Keep every line reachable through ordinary Ui actions; never paint over the
// return/close controls or depend on desktop hover for touch readers.
export class SkillMemoPages {
          text = "";
          page = 0;
  draw(ui    , prefix        , text        , x        , y        ) {
    if (this.text !== text) { this.text = text; this.page = 0; }
    const lines = wrapBytes(text.trim(), 24), pages = Math.max(1, Math.ceil(lines.length / 3));
    this.page = Math.min(this.page, pages - 1);
    if (pages > 1) {
      // The row above the memo is below the seventh skill; the existing return
      // buttons stay below all three lines with their original hit boxes.
      if (ui.text(x, y - 20, "上一页", this.page > 0 ? FONT.AQUA : FONT.GRAY, `${prefix}-memo-prev`)) this.page = Math.max(0, this.page - 1);
      ui.text(x + 78, y - 20, `${this.page + 1}/${pages}`, FONT.YELLOW);
      if (ui.text(x + 156, y - 20, "下一页", this.page < pages - 1 ? FONT.AQUA : FONT.GRAY, `${prefix}-memo-next`)) this.page = Math.min(pages - 1, this.page + 1);
    }
    lines.slice(this.page * 3, this.page * 3 + 3).forEach((line, i) => ui.text(x, y + i * 20, line, FONT.WHITE));
  }
}
