import type { LegendOptions, ThemeTokens } from "./types";

export interface LegendItem {
  label: string;
  color: string;
}

type Pos = NonNullable<LegendOptions["position"]>;

/**
 * DOM legend strip overlaid on the chart edge. Click-to-toggle reports back
 * through `onToggle`; the chart owns the hidden-set. Inset size is measured
 * from the element so `layout()` can shrink the plot around it.
 */
export class Legend {
  readonly el: HTMLDivElement;
  private theme: ThemeTokens;
  private items: LegendItem[] = [];
  private pos: Pos;
  private toggleable: boolean;
  private onToggle: (i: number) => void;
  /** cached {@link inset} — offsetWidth/Height force sync layout per read */
  private ins: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  } | null = null;

  constructor(
    container: HTMLElement,
    theme: ThemeTokens,
    pos: Pos,
    toggleable: boolean,
    onToggle: (i: number) => void,
  ) {
    this.theme = theme;
    this.pos = pos;
    this.toggleable = toggleable;
    this.onToggle = onToggle;
    this.el = document.createElement("div");
    this.el.setAttribute("role", "list");
    this.applyPos();
    // legend clicks must not reach chart pointer handlers (click/zoom)
    this.el.addEventListener("pointerdown", (e) => e.stopPropagation());
    this.el.addEventListener("pointerup", (e) => e.stopPropagation());
    this.el.addEventListener("wheel", (e) => e.stopPropagation());
    container.appendChild(this.el);
  }

  private applyPos(): void {
    const s = this.el.style;
    s.cssText = [
      "position:absolute",
      "display:flex",
      "gap:10px",
      "align-items:center",
      `font:11px ${this.theme.fontFamily}`,
      `color:${this.theme.textMuted}`,
      "z-index:2",
      "box-sizing:border-box",
    ].join(";");
    const p = this.pos;
    if (p === "top" || p === "bottom") {
      s.left = "0";
      s.right = "0";
      s[p] = "0";
      s.justifyContent = "center";
      s.flexWrap = "wrap";
      s.padding = "4px 8px";
    } else {
      s.top = "0";
      s.bottom = "0";
      s[p === "left" ? "left" : "right"] = "0";
      s.flexDirection = "column";
      s.justifyContent = "center";
      s.alignItems = "flex-start";
      s.padding = "0 8px";
      s.maxWidth = "30%";
    }
  }

  /** px the plot must give up on each edge — measured once, cached */
  inset(): { top: number; right: number; bottom: number; left: number } {
    const cached = this.ins;
    if (cached) return cached;
    const zero = { top: 0, right: 0, bottom: 0, left: 0 };
    if (!this.items.length) return zero;
    const p = this.pos;
    const el = this.el;
    const ins =
      p === "top"
        ? { ...zero, top: el.offsetHeight }
        : p === "bottom"
          ? { ...zero, bottom: el.offsetHeight }
          : p === "left"
            ? { ...zero, left: el.offsetWidth }
            : { ...zero, right: el.offsetWidth };
    this.ins = ins;
    return ins;
  }

  /** drop the cached inset — call when content or container size changes */
  invalidate(): void {
    this.ins = null;
  }

  setItems(items: LegendItem[], hidden: ReadonlySet<number>): void {
    this.items = items;
    this.ins = null;
    const el = this.el;
    el.textContent = "";
    if (!items.length) {
      el.style.display = "none";
      return;
    }
    el.style.display = "flex";
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it) continue;
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "listitem");
      b.style.cssText = [
        "display:inline-flex",
        "align-items:center",
        "gap:6px",
        "background:none",
        "border:none",
        "padding:2px 4px",
        "margin:0",
        "font:inherit",
        `color:${this.theme.text}`,
        this.toggleable ? "cursor:pointer" : "cursor:default",
        hidden.has(i) ? "opacity:0.38" : "opacity:1",
      ].join(";");
      const sw = document.createElement("span");
      sw.style.cssText = `width:9px;height:9px;border-radius:2px;background:${it.color};flex:none`;
      const lab = document.createElement("span");
      lab.textContent = it.label;
      b.append(sw, lab);
      if (this.toggleable) {
        const idx = i;
        b.addEventListener("click", () => this.onToggle(idx));
      }
      el.appendChild(b);
    }
  }

  /** reflect toggle state without rebuilding the DOM */
  mark(hidden: ReadonlySet<number>): void {
    const kids = this.el.children;
    for (let i = 0; i < kids.length; i++) {
      (kids[i] as HTMLElement).style.opacity = hidden.has(i) ? "0.38" : "1";
    }
  }

  contains(target: EventTarget | null): boolean {
    return target instanceof Node && this.el.contains(target);
  }

  destroy(): void {
    this.el.remove();
  }
}
