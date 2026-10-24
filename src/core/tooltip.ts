import type { ThemeTokens } from "./types";

export class Tooltip {
  readonly el: HTMLDivElement;
  private theme: ThemeTokens;

  constructor(
    container: HTMLElement,
    theme: ThemeTokens,
    radius?: number | string,
  ) {
    this.theme = theme;
    this.el = document.createElement("div");
    this.el.style.cssText = [
      "position:absolute",
      "pointer-events:none",
      `background:${theme.tooltipBg}`,
      `border:1px solid ${theme.tooltipBorder}`,
      `box-shadow:${theme.tooltipShadow}`,
      `border-radius:${typeof radius === "number" ? `${radius}px` : (radius ?? "6px")}`,
      "padding:6px 10px",
      `font:12px ${theme.fontFamily}`,
      `color:${theme.tooltipText}`,
      "white-space:nowrap",
      "opacity:0",
      "transition:opacity 80ms ease-out",
      "z-index:1",
      "left:0",
      "top:0",
    ].join(";");
    container.appendChild(this.el);
  }

  setTheme(theme: ThemeTokens): void {
    this.theme = theme;
    const s = this.el.style;
    s.background = theme.tooltipBg;
    s.border = `1px solid ${theme.tooltipBorder}`;
    s.boxShadow = theme.tooltipShadow;
    s.color = theme.tooltipText;
  }

  show(
    x: number,
    y: number,
    rows: { color?: string; label: string; value: string }[],
    title?: string,
    custom?: { text?: string; html?: string },
  ): void {
    const el = this.el;
    el.textContent = "";
    if (custom?.html != null) {
      el.innerHTML = custom.html;
      el.style.opacity = "1";
      this.position(x, y);
      return;
    }
    if (custom?.text != null) {
      el.textContent = custom.text;
      el.style.opacity = "1";
      this.position(x, y);
      return;
    }
    if (title) {
      const t = document.createElement("div");
      t.style.cssText = `font-weight:600;margin-bottom:2px;color:${this.theme.tooltipText}`;
      t.textContent = title;
      el.appendChild(t);
    }
    for (const r of rows) {
      const row = document.createElement("div");
      row.style.cssText =
        "display:flex;align-items:center;gap:6px;line-height:1.5";
      if (r.color) {
        const sw = document.createElement("span");
        sw.style.cssText = `width:8px;height:2px;background:${r.color};display:inline-block;border-radius:1px`;
        row.appendChild(sw);
      }
      const lab = document.createElement("span");
      lab.style.color = this.theme.tooltipMuted;
      lab.textContent = r.label;
      const val = document.createElement("span");
      val.style.cssText = "font-weight:600;margin-left:auto;padding-left:12px";
      val.textContent = r.value;
      row.append(lab, val);
      el.appendChild(row);
    }
    el.style.opacity = "1";
    this.position(x, y);
  }

  private position(x: number, y: number): void {
    const el = this.el;
    const parent = el.parentElement;
    if (!parent) return;
    const pw = parent.clientWidth;
    const ph = parent.clientHeight;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = x + 12;
    let top = y + 12;
    if (left + w > pw - 4) left = x - w - 12;
    if (top + h > ph - 4) top = y - h - 12;
    el.style.left = `${Math.max(0, left)}px`;
    el.style.top = `${Math.max(0, top)}px`;
  }

  hide(): void {
    this.el.style.opacity = "0";
  }

  destroy(): void {
    this.el.remove();
  }
}
