import type { Rect } from "./types";

/**
 * Renderer seam. Canvas2D is the only backend for now; a WebGPU backend can
 * implement this contract later and interpret the same scene/marks.
 */
export interface RenderBackend {
  readonly kind: "canvas2d" | "webgpu";
  readonly width: number;
  readonly height: number;
  readonly plot: Rect;
  readonly main: CanvasRenderingContext2D;
  readonly overlay: CanvasRenderingContext2D;
  resize(w: number, h: number): void;
  setPlot(plot: Rect): void;
  begin(): void;
  beginOverlay(): void;
  destroy(): void;
}

function makeCanvas(cssW: number, cssH: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;display:block";
  c.width = Math.max(1, Math.round(cssW));
  c.height = Math.max(1, Math.round(cssH));
  return c;
}

function setup2d(
  canvas: HTMLCanvasElement,
  alpha: boolean,
): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d", { alpha });
  if (!ctx) throw new Error("resolvcharts: could not get 2d context");
  return ctx;
}

export class CanvasBackend implements RenderBackend {
  readonly kind = "canvas2d" as const;
  width: number;
  height: number;
  dpr: number;
  plot: Rect = { x: 0, y: 0, w: 0, h: 0 };
  readonly mainCanvas: HTMLCanvasElement;
  readonly overlayCanvas: HTMLCanvasElement;
  readonly main: CanvasRenderingContext2D;
  readonly overlay: CanvasRenderingContext2D;
  private gridCache: HTMLCanvasElement | null = null;
  private gridCtx: CanvasRenderingContext2D | null = null;
  private container: HTMLElement;

  constructor(container: HTMLElement, cssW: number, cssH: number) {
    this.container = container;
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
    this.width = cssW;
    this.height = cssH;
    this.mainCanvas = makeCanvas(cssW, cssH);
    this.overlayCanvas = makeCanvas(cssW, cssH);
    this.overlayCanvas.style.pointerEvents = "none";
    this.main = setup2d(this.mainCanvas, true);
    this.overlay = setup2d(this.overlayCanvas, true);
    container.append(this.mainCanvas, this.overlayCanvas);
    this.applySize();
  }

  private applySize(): void {
    const w = this.width * this.dpr;
    const h = this.height * this.dpr;
    for (const c of [this.mainCanvas, this.overlayCanvas]) {
      c.width = Math.max(1, Math.round(w));
      c.height = Math.max(1, Math.round(h));
    }
    for (const ctx of [this.main, this.overlay]) {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }
    if (this.gridCache) {
      this.gridCache.width = Math.max(1, Math.round(w));
      this.gridCache.height = Math.max(1, Math.round(h));
      this.gridCtx?.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }
  }

  /** Static layer (grid/axes). Draw into returned ctx, then blitGrid(). */
  grid(): CanvasRenderingContext2D {
    if (!this.gridCache) {
      this.gridCache = document.createElement("canvas");
      this.gridCache.width = Math.max(1, this.width * this.dpr);
      this.gridCache.height = Math.max(1, this.height * this.dpr);
      this.gridCtx = setup2d(this.gridCache, true);
      this.gridCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }
    const ctx = this.gridCtx as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, this.width, this.height);
    return ctx;
  }

  blitGrid(): void {
    if (this.gridCache) {
      this.main.drawImage(this.gridCache, 0, 0, this.width, this.height);
    }
  }

  resize(w: number, h: number): void {
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);
    this.applySize();
  }

  setPlot(plot: Rect): void {
    this.plot = plot;
  }

  begin(): void {
    this.main.clearRect(0, 0, this.width, this.height);
  }

  beginOverlay(): void {
    this.overlay.clearRect(0, 0, this.width, this.height);
  }

  destroy(): void {
    this.mainCanvas.remove();
    this.overlayCanvas.remove();
    this.gridCache = null;
    this.gridCtx = null;
    void this.container;
  }
}
