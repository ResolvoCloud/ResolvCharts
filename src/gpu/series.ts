import type { NormalizedSeries, NormalizedXY, Rect } from "../core/types";
import { parseColor } from "./color";
import { type GpuRequestOptions, getGpuDevice } from "./device";

/**
 * WebGPU series renderer. Data is uploaded once per series as affine-encoded
 * f32 [x, y] pairs (+ an encoded prevY channel for animation) and lives on the
 * GPU: the domain→pixel transform runs in the vertex shader, so pan/zoom,
 * resize and view animation are uniform writes, not buffer re-uploads.
 * Streaming `append()` writes only the new tail into a per-series ring buffer.
 *
 * When a series has more than ~2 points per pixel column a compute pass does
 * M4 decimation (first/min/max/last per column) into a GPU-side output buffer
 * — the CPU never rescans the data. Pipelines use instanced vertex attributes
 * everywhere (no vertex-stage storage buffers), so they also run in WebGPU
 * compatibility mode.
 */

const HEADER = /* wgsl */ `
struct U {
  res: vec4f,   // canvas w,h (device px), dpr, pad
  color: vec4f,
  p: vec4f,     // line: width | area: baseCssY, plotY, plotH | points: radius
  map: vec4f,   // cssX = ex*map.x + map.y ; cssY = map.w - ey*map.z
  anim: vec4f,  // t, flow, invN, pad
  ring: vec4f,  // start, cap (0 = linear), n, pad
  dec: vec4f,   // cols, gapFillYEnc, pad, pad
};
@group(0) @binding(0) var<uniform> u: U;

fn encToCss(e: vec2f) -> vec2f {
  return vec2f(e.x * u.map.x + u.map.y, u.map.w - e.y * u.map.z);
}
fn toClip(css: vec2f) -> vec4f {
  let d = css * u.res.z;
  return vec4f(d.x / u.res.x * 2.0 - 1.0, 1.0 - d.y / u.res.y * 2.0, 0.0, 1.0);
}
fn animT(i: f32) -> f32 {
  return clamp(
    u.anim.x * (1.0 + u.anim.y) - u.anim.y + i * u.anim.z, 0.0, 1.0,
  );
}
`;

const LINE_WGSL = /* wgsl */ `
${HEADER}
const OFF = array<vec2f, 6>(
  vec2f(0.0, -1.0), vec2f(0.0, 1.0), vec2f(1.0, -1.0),
  vec2f(0.0, 1.0), vec2f(1.0, 1.0), vec2f(1.0, -1.0),
);
struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) edge: f32,
};
fn segQuad(v: vec2f, A: vec2f, B: vec2f) -> VOut {
  var dir = B - A;
  let len = length(dir);
  if (len < 1e-6) {
    dir = vec2f(1.0, 0.0);
  } else {
    dir = dir / len;
  }
  let nrm = vec2f(-dir.y, dir.x);
  let halfW = u.p.x * 0.5;
  let aa = 0.9;
  var o: VOut;
  o.pos = toClip(mix(A, B, v.x) + nrm * v.y * (halfW + aa));
  o.edge = v.y * (halfW + aa);
  return o;
}
@vertex fn vs(
  @builtin(vertex_index) vi: u32,
  @builtin(instance_index) inst: u32,
  @location(0) a: vec2f,
  @location(1) b: vec2f,
  @location(2) pa: f32,
  @location(3) pb: f32,
) -> VOut {
  let ya = mix(pa, a.y, animT(f32(inst)));
  let yb = mix(pb, b.y, animT(f32(inst + 1u)));
  var o: VOut;
  // NaN endpoint = data gap → degenerate off-clip position kills the segment
  if (a.x != a.x || ya != ya || b.x != b.x || yb != yb) {
    o.pos = vec4f(0.0, 0.0, 2.0, 1.0);
    o.edge = 0.0;
    return o;
  }
  return segQuad(
    OFF[vi], encToCss(vec2f(a.x, ya)), encToCss(vec2f(b.x, yb)),
  );
}
@fragment fn fs(o: VOut) -> @location(0) vec4f {
  let halfW = u.p.x * 0.5;
  let a = 1.0 - smoothstep(halfW - 0.5, halfW + 0.9, abs(o.edge));
  return vec4f(u.color.rgb, u.color.a * a);
}
`;

// decimated input: no prevY channel (compute already lerped); empty columns
// carry an x=-1e30 sentinel so bridged segments can be killed
const LINE_FLAT_WGSL = /* wgsl */ `
${HEADER}
const OFF = array<vec2f, 6>(
  vec2f(0.0, -1.0), vec2f(0.0, 1.0), vec2f(1.0, -1.0),
  vec2f(0.0, 1.0), vec2f(1.0, 1.0), vec2f(1.0, -1.0),
);
struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) edge: f32,
};
@vertex fn vs(
  @builtin(vertex_index) vi: u32,
  @location(0) a: vec2f,
  @location(1) b: vec2f,
) -> VOut {
  var o: VOut;
  if (
    a.x < -1e20 || b.x < -1e20 ||
    a.x != a.x || a.y != a.y || b.x != b.x || b.y != b.y
  ) {
    o.pos = vec4f(0.0, 0.0, 2.0, 1.0); // outside clip z-range → discarded
    o.edge = 0.0;
    return o;
  }
  let A = encToCss(a);
  let B = encToCss(b);
  var dir = B - A;
  let len = length(dir);
  if (len < 1e-6) {
    dir = vec2f(1.0, 0.0);
  } else {
    dir = dir / len;
  }
  let nrm = vec2f(-dir.y, dir.x);
  let halfW = u.p.x * 0.5;
  let aa = 0.9;
  let v = OFF[vi];
  o.pos = toClip(mix(A, B, v.x) + nrm * v.y * (halfW + aa));
  o.edge = v.y * (halfW + aa);
  return o;
}
@fragment fn fs(o: VOut) -> @location(0) vec4f {
  let halfW = u.p.x * 0.5;
  let a = 1.0 - smoothstep(halfW - 0.5, halfW + 0.9, abs(o.edge));
  return vec4f(u.color.rgb, u.color.a * a);
}
`;

const AREA_WGSL = /* wgsl */ `
${HEADER}
struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) grad: f32,
};
// input is doubled point data (each point twice): even verts land on the
// path, odd verts drop to the baseline
@vertex fn vs(
  @builtin(vertex_index) vi: u32,
  @location(0) top: vec2f,
  @location(1) prev: f32,
) -> VOut {
  let isTop = (vi & 1u) == 0u;
  let y = mix(prev, top.y, animT(f32(vi >> 1u)));
  let css = encToCss(vec2f(top.x, y));
  var o: VOut;
  // NaN x kills both verts; NaN y only the top edge — adjacent tris culled
  if (top.x != top.x || (isTop && y != y)) {
    o.pos = vec4f(0.0, 0.0, 2.0, 1.0);
    o.grad = 0.0;
    return o;
  }
  o.pos = toClip(vec2f(css.x, select(u.p.x, css.y, isTop)));
  o.grad = clamp((css.y - u.p.y) / max(u.p.z, 1.0), 0.0, 1.0);
  return o;
}
@fragment fn fs(o: VOut) -> @location(0) vec4f {
  let a = mix(0.16, 0.0, o.grad) * u.color.a;
  return vec4f(u.color.rgb, a);
}
`;

const AREA_FLAT_WGSL = /* wgsl */ `
${HEADER}
struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) grad: f32,
};
@vertex fn vs(
  @builtin(vertex_index) vi: u32,
  @location(0) top: vec2f,
) -> VOut {
  let isTop = (vi & 1u) == 0u;
  let css = encToCss(top);
  var o: VOut;
  if (css.x != css.x || (isTop && css.y != css.y)) {
    o.pos = vec4f(0.0, 0.0, 2.0, 1.0);
    o.grad = 0.0;
    return o;
  }
  o.pos = toClip(vec2f(css.x, select(u.p.x, css.y, isTop)));
  o.grad = clamp((css.y - u.p.y) / max(u.p.z, 1.0), 0.0, 1.0);
  return o;
}
@fragment fn fs(o: VOut) -> @location(0) vec4f {
  let a = mix(0.16, 0.0, o.grad) * u.color.a;
  return vec4f(u.color.rgb, a);
}
`;

const POINTS_WGSL = /* wgsl */ `
${HEADER}
const QUAD = array<vec2f, 6>(
  vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
  vec2f(-1.0, 1.0), vec2f(1.0, 1.0), vec2f(1.0, 1.0),
);
struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) local: vec2f,
};
@vertex fn vs(
  @builtin(vertex_index) vi: u32,
  @builtin(instance_index) inst: u32,
  @location(0) c: vec2f,
  @location(1) prev: f32,
) -> VOut {
  let r = u.p.x;
  let q = QUAD[vi];
  let y = mix(prev, c.y, animT(f32(inst)));
  let css = encToCss(vec2f(c.x, y));
  var o: VOut;
  if (css.x != css.x || css.y != css.y) {
    o.pos = vec4f(0.0, 0.0, 2.0, 1.0);
    o.local = vec2f(0.0, 0.0);
    return o;
  }
  o.pos = toClip(css + q * r);
  o.local = q * r;
  return o;
}
@fragment fn fs(o: VOut) -> @location(0) vec4f {
  let r = u.p.x;
  let a = 1.0 - smoothstep(r - 1.2, r, length(o.local));
  return vec4f(u.color.rgb, u.color.a * a);
}
`;

// M4 decimation: one thread per absolute pixel column emits first/min/max/last
// (encoded, y already lerped) into a line region (4 pts/col) and a doubled
// area-strip region (8 verts/col). Empty columns → sentinel / baseline fill.
const DECIMATE_WGSL = /* wgsl */ `
${HEADER}
@group(1) @binding(0) var<storage, read> xy: array<vec2f>;
@group(1) @binding(1) var<storage, read> prev: array<f32>;
@group(1) @binding(2) var<storage, read_write> dst: array<vec2f>;

fn physIdx(i: u32) -> u32 {
  let cap = u32(u.ring.y);
  if (cap == 0u) {
    return i;
  }
  return (u32(u.ring.x) + i) % cap;
}
fn xEnc(i: u32) -> f32 {
  return xy[physIdx(i)].x;
}
fn yLerp(i: u32) -> f32 {
  let p = physIdx(i);
  return mix(prev[p], xy[p].y, animT(f32(i)));
}
fn lowerBound(e: f32) -> u32 {
  var lo = 0u;
  var hi = u32(u.ring.z);
  while (lo < hi) {
    let mid = (lo + hi) >> 1u;
    if (xEnc(mid) < e) {
      lo = mid + 1u;
    } else {
      hi = mid;
    }
  }
  return lo;
}

@compute @workgroup_size(64)
fn dec(@builtin(global_invocation_id) gid: vec3u) {
  let c = gid.x;
  let cols = u32(u.dec.x);
  if (c >= cols) {
    return;
  }
  let lineBase = c * 4u;
  let areaBase = cols * 4u + c * 8u;
  // encoded-x range mapping to css column [c, c+1)
  let lo = lowerBound((f32(c) - u.map.y) / u.map.x);
  let hi = lowerBound((f32(c) + 1.0 - u.map.y) / u.map.x);
  if (lo >= hi) {
    let sent = vec2f(-1e30, -1e30);
    for (var k = 0u; k < 4u; k++) {
      dst[lineBase + k] = sent;
    }
    let gp = vec2f((f32(c) + 0.5 - u.map.y) / u.map.x, u.dec.y);
    for (var k = 0u; k < 8u; k++) {
      dst[areaBase + k] = gp;
    }
    return;
  }
  // finite scan: an all-NaN column renders like an empty one (gap)
  var finite = 0u;
  var iMin = lo;
  var iMax = lo;
  var mn = 0.0;
  var mx = 0.0;
  for (var i = lo; i < hi; i++) {
    let y = yLerp(i);
    if (y != y) {
      continue;
    }
    if (finite == 0u) {
      mn = y;
      mx = y;
      iMin = i;
      iMax = i;
    }
    finite++;
    if (y < mn) {
      mn = y;
      iMin = i;
    }
    if (y > mx) {
      mx = y;
      iMax = i;
    }
  }
  if (finite == 0u) {
    let sent = vec2f(-1e30, -1e30);
    for (var k = 0u; k < 4u; k++) {
      dst[lineBase + k] = sent;
    }
    let gp = vec2f((f32(c) + 0.5 - u.map.y) / u.map.x, u.dec.y);
    for (var k = 0u; k < 8u; k++) {
      dst[areaBase + k] = gp;
    }
    return;
  }
  let xs = array<u32, 4>(lo, iMin, iMax, hi - 1u);
  for (var k = 0u; k < 4u; k++) {
    let i = xs[k];
    let pt = vec2f(xEnc(i), yLerp(i));
    dst[lineBase + k] = pt;
    dst[areaBase + 2u * k] = pt;
    dst[areaBase + 2u * k + 1u] = pt;
  }
}
`;

// GPUBufferUsage flags (lib.dom has the types but not the const objects)
const BUF_VERTEX_DST = 0x28; // VERTEX | COPY_DST
const BUF_UNIFORM_DST = 0x48; // UNIFORM | COPY_DST
const BUF_RESOLVE_SRC = 0x204; // QUERY_RESOLVE | COPY_SRC
const BUF_MAPREAD_DST = 0x09; // MAP_READ | COPY_DST
const BUF_SERIES = 0xac; // STORAGE | VERTEX | COPY_DST | COPY_SRC
const BUF_DEC = 0xa0; // STORAGE | VERTEX
const MAP_READ = 0x1;
const STAGE_ALL = 7; // VERTEX | FRAGMENT | COMPUTE

const UVEC = 7; // vec4s per uniform slot
const UBYTES = 256; // dynamic-offset aligned stride
const UBUF_SIZE = 256 * 1024;
const DEC_ELEMS_PER_COL = 12; // 4 line pts + 8 doubled area verts

interface Slot {
  n: number;
  cap: number;
  start: number;
  enc: { xr: number; xu: number; yr: number; yu: number };
  /** physical-order CPU copies (ring layout: logical i at (start+i)%cap) */
  encXY: Float32Array;
  encPrev: Float32Array;
  xy: GPUBuffer;
  prev: GPUBuffer;
  /** doubled strip data for direct area draws */
  scratch: GPUBuffer | null;
  scratchN: number;
  dec: GPUBuffer | null;
  decCols: number;
  bg: GPUBindGroup | null;
  decStamp: number;
  /** key of the data/view/uniform state the `dec` buffer was built for */
  decKey: string | null;
  /** bumped on every data mutation (upload/append/grow) */
  upStamp: number;
}

interface View {
  x: readonly [number, number];
  y: readonly [number, number];
}

interface DrawOp {
  pipe: GPURenderPipeline;
  vbufs: { buf: GPUBuffer; off: number }[];
  u: number;
  verts: number;
  insts: number;
}

export class GpuSeries {
  canvas: HTMLCanvasElement;
  device: GPUDevice;
  private ctx: GPUCanvasContext;
  private format: GPUTextureFormat;
  private opts: GpuRequestOptions;
  private layout!: GPUBindGroupLayout;
  private decLayout!: GPUBindGroupLayout;
  private ubiGroup!: GPUBindGroup;
  private ubuf!: GPUBuffer;
  private pipes!: {
    line: GPURenderPipeline;
    lineFlat: GPURenderPipeline;
    area: GPURenderPipeline;
    areaFlat: GPURenderPipeline;
    points: GPURenderPipeline;
    dec: GPUComputePipeline;
  };
  private dpr = 1;
  private slots: Slot[] = [];
  private slotCount = 0;
  private appliedRev = -1;
  private draws: DrawOp[] = [];
  private cmps: { slot: Slot; u: number }[] = [];
  private uOff = 0;
  private stamp = 0;
  private plotR: Rect = { x: 0, y: 0, w: 1, h: 1 };
  private cols = 1;
  private t = 1;
  private flow = 0;
  private tailScratch = new Float32Array(4);
  /** CPU staging for per-op uniforms — flushed to `ubuf` once per end() */
  private uStage = new Float32Array(0);
  /** last measured GPU execution time in ms (when timing enabled) */
  gpuMs: number | null = null;
  private querySet: GPUQuerySet | null = null;
  private queryBuf: GPUBuffer | null = null;
  private readBuf: GPUBuffer | null = null;
  private reading = false;
  private timing = false;
  private destroyed = false;
  /** true once the device is unrecoverable — the chart falls back to Canvas2D */
  dead = false;
  /** true while a lost device is being re-acquired */
  recovering = false;
  /** 1/ln(base) per axis under log scales, else 0 — data encodes in log
   * space so the affine enc→css map reproduces the CPU log scale exactly */
  private invLx = 0;
  private invLy = 0;

  /**
   * Enable log-space encoding per axis (pass the log base, or null for
   * linear). Non-positive values encode as NaN — path gaps, matching the
   * Canvas2D semantics. Invalidates the data revision to force re-encode.
   */
  setLog(bx: number | null, by: number | null): void {
    this.invLx = bx ? 1 / Math.log(bx) : 0;
    this.invLy = by ? 1 / Math.log(by) : 0;
    this.appliedRev = -1;
  }

  private tx(v: number): number {
    return this.invLx ? (v > 0 ? Math.log(v) * this.invLx : NaN) : v;
  }

  private ty(v: number): number {
    return this.invLy ? (v > 0 ? Math.log(v) * this.invLy : NaN) : v;
  }

  get unavailable(): boolean {
    return this.dead || this.recovering;
  }

  private constructor(
    device: GPUDevice,
    canvas: HTMLCanvasElement,
    opts: GpuRequestOptions,
  ) {
    this.opts = opts;
    this.timing = !!opts.timing;
    this.canvas = canvas;
    canvas.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none";
    const ctx = canvas.getContext("webgpu") as GPUCanvasContext | null;
    if (!ctx) throw new Error("resolvcharts: webgpu context unavailable");
    this.ctx = ctx;
    this.device = device;
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.setup(device);
  }

  static async create(
    opts?: GpuRequestOptions | null,
  ): Promise<GpuSeries | null> {
    const o = opts ?? {};
    const device = await getGpuDevice(o);
    if (!device) return null;
    const canvas = document.createElement("canvas");
    try {
      return new GpuSeries(device, canvas, o);
    } catch {
      return null;
    }
  }

  /** (re)create all device-bound resources — called on init and after loss */
  private setup(device: GPUDevice): void {
    this.device = device;
    this.layout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: STAGE_ALL,
          buffer: { type: "uniform", hasDynamicOffset: true },
        },
      ],
    });
    this.decLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: 4, buffer: { type: "read-only-storage" } },
        { binding: 1, visibility: 4, buffer: { type: "read-only-storage" } },
        { binding: 2, visibility: 4, buffer: { type: "storage" } },
      ],
    });
    this.ubuf = device.createBuffer({
      size: UBUF_SIZE,
      usage: BUF_UNIFORM_DST,
    });
    this.ubiGroup = device.createBindGroup({
      layout: this.layout,
      entries: [
        { binding: 0, resource: { buffer: this.ubuf, size: UVEC * 16 } },
      ],
    });
    const pl = device.createPipelineLayout({
      bindGroupLayouts: [this.layout],
    });
    const decPl = device.createPipelineLayout({
      bindGroupLayouts: [this.layout, this.decLayout],
    });
    const mk = (
      code: string,
      topology: GPUPrimitiveTopology,
      buffers: GPUVertexBufferLayout[],
    ) =>
      device.createRenderPipeline({
        layout: pl,
        vertex: {
          module: device.createShaderModule({ code }),
          entryPoint: "vs",
          buffers,
        },
        fragment: {
          module: device.createShaderModule({ code }),
          entryPoint: "fs",
          targets: [{ format: this.format, blend: BLEND }],
        },
        primitive: { topology },
      });
    const iXY: GPUVertexBufferLayout = {
      arrayStride: 8,
      stepMode: "instance",
      attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }],
    };
    const iXY1: GPUVertexBufferLayout = {
      arrayStride: 8,
      stepMode: "instance",
      attributes: [{ shaderLocation: 1, offset: 0, format: "float32x2" }],
    };
    const iPrev: GPUVertexBufferLayout = {
      arrayStride: 4,
      stepMode: "instance",
      attributes: [{ shaderLocation: 2, offset: 0, format: "float32" }],
    };
    const iPrev1: GPUVertexBufferLayout = {
      arrayStride: 4,
      stepMode: "instance",
      attributes: [{ shaderLocation: 3, offset: 0, format: "float32" }],
    };
    const iPrevPt: GPUVertexBufferLayout = {
      arrayStride: 4,
      stepMode: "instance",
      attributes: [{ shaderLocation: 1, offset: 0, format: "float32" }],
    };
    const vXY: GPUVertexBufferLayout = {
      arrayStride: 8,
      stepMode: "vertex",
      attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }],
    };
    const vPrev: GPUVertexBufferLayout = {
      arrayStride: 4,
      stepMode: "vertex",
      attributes: [{ shaderLocation: 1, offset: 0, format: "float32" }],
    };
    this.pipes = {
      line: mk(LINE_WGSL, "triangle-list", [iXY, iXY1, iPrev, iPrev1]),
      lineFlat: mk(LINE_FLAT_WGSL, "triangle-list", [iXY, iXY1]),
      area: mk(AREA_WGSL, "triangle-strip", [vXY, vPrev]),
      areaFlat: mk(AREA_FLAT_WGSL, "triangle-strip", [vXY]),
      points: mk(POINTS_WGSL, "triangle-list", [iXY, iPrevPt]),
      dec: device.createComputePipeline({
        layout: decPl,
        compute: {
          module: device.createShaderModule({ code: DECIMATE_WGSL }),
          entryPoint: "dec",
        },
      }),
    };
    if (this.timing && device.features.has("timestamp-query")) {
      this.querySet = device.createQuerySet({ type: "timestamp", count: 2 });
      this.queryBuf = device.createBuffer({
        size: 16,
        usage: BUF_RESOLVE_SRC,
      });
      this.readBuf = device.createBuffer({
        size: 16,
        usage: BUF_MAPREAD_DST,
      });
    }
    device.lost.then((info) => this.onLost(info));
  }

  private onLost(info: GPUDeviceLostInfo): void {
    if (this.destroyed) return;
    if (info.reason === "destroyed") {
      this.dead = true;
      return;
    }
    this.recovering = true;
    void getGpuDevice(this.opts).then((nd) => {
      if (!nd || this.destroyed) {
        this.fail();
        return;
      }
      try {
        this.teardownResources();
        this.setup(nd);
        try {
          this.configure();
        } catch {
          // some drivers reject reconfiguring a context with a new device —
          // swap in a fresh canvas instead
          const nc = document.createElement("canvas");
          nc.width = this.canvas.width;
          nc.height = this.canvas.height;
          this.canvas.replaceWith(nc);
          this.canvas = nc;
          const ctx = nc.getContext("webgpu") as GPUCanvasContext | null;
          if (!ctx) throw new Error("webgpu context lost");
          this.ctx = ctx;
          this.configure();
        }
        this.appliedRev = -1; // force full re-upload on next frame
        this.recovering = false;
      } catch {
        this.fail();
      }
    });
  }

  private fail(): void {
    this.dead = true;
    this.recovering = false;
    this.destroy();
  }

  private teardownResources(): void {
    for (const s of this.slots) {
      s.xy.destroy();
      s.prev.destroy();
      s.scratch?.destroy();
      s.dec?.destroy();
    }
    this.slots = [];
    this.slotCount = 0;
    this.ubuf.destroy();
    this.queryBuf?.destroy();
    this.readBuf?.destroy();
    this.querySet?.destroy();
    this.querySet = null;
    this.queryBuf = null;
    this.readBuf = null;
  }

  private configure(): void {
    this.ctx.configure({
      device: this.device,
      format: this.format,
      alphaMode: "premultiplied",
    });
  }

  setSize(cssW: number, cssH: number, dpr: number): void {
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(cssW * dpr));
    this.canvas.height = Math.max(1, Math.round(cssH * dpr));
    if (!this.unavailable) this.configure();
  }

  // ---------------------------------------------------------------- data --
  // Points are affine-encoded to f32: enc(v) = (v - ref) * unit. The shader
  // gets a second affine (encoded → css px) per frame, so any view window
  // lands on the same buffer without re-uploading. Ref/unit are fixed at
  // upload; out-of-range appends simply encode outside [0,1].

  private upload(i: number, d: NormalizedXY, s: NormalizedSeries): void {
    const xs = d.sortedX;
    // cached display-space copies skip the per-point log transform
    const xsL = this.invLx && d.sortedXLog ? d.sortedXLog : null;
    const ysL = this.invLy && s.yLog ? s.yLog : null;
    const pvL = ysL && s.prevYLog ? s.prevYLog : null;
    const n = Math.min(xs.length, s.y.length);
    const xr =
      n > 0 ? (xsL ? (xsL[0] as number) : this.tx(xs[0] as number)) : 0;
    const xu =
      1 /
      ((n > 0
        ? (xsL ? (xsL[n - 1] as number) : this.tx(xs[n - 1] as number)) - xr
        : 0) || Math.max(1, Math.abs(xr), 1));
    let mn = Infinity;
    let mx = -Infinity;
    for (let j = 0; j < n; j++) {
      const v = ysL ? (ysL[j] as number) : this.ty(s.y[j] as number);
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    const yr = mn === Infinity ? 0 : mn;
    const yu = 1 / (mx - mn || Math.max(1, Math.abs(yr)));
    let slot = this.slots[i];
    const cap = Math.max(1024, Math.ceil(n * 1.25));
    if (!slot || slot.cap < n) {
      slot?.xy.destroy();
      slot?.prev.destroy();
      slot?.dec?.destroy();
      slot = {
        n,
        cap,
        start: 0,
        enc: { xr, xu, yr, yu },
        encXY: new Float32Array(cap * 2),
        encPrev: new Float32Array(cap),
        xy: this.device.createBuffer({
          size: cap * 8,
          usage: BUF_SERIES,
        }),
        prev: this.device.createBuffer({
          size: cap * 4,
          usage: BUF_SERIES,
        }),
        scratch: null,
        scratchN: 0,
        dec: null,
        decCols: 0,
        decKey: null,
        upStamp: 0,
        bg: null,
        decStamp: -1,
      };
      this.slots[i] = slot;
    } else {
      slot.n = n;
      slot.start = 0;
      slot.enc = { xr, xu, yr, yu };
      slot.bg = null;
      slot.decStamp = -1;
    }
    const { encXY, encPrev } = slot;
    const prev = s.prevY;
    for (let j = 0; j < n; j++) {
      encXY[2 * j] =
        ((xsL ? (xsL[j] as number) : this.tx(xs[j] as number)) - xr) * xu;
      encXY[2 * j + 1] =
        ((ysL ? (ysL[j] as number) : this.ty(s.y[j] as number)) - yr) * yu;
      encPrev[j] = prev
        ? ((pvL ? (pvL[j] as number) : this.ty(prev[j] as number)) - yr) * yu
        : 0;
    }
    this.device.queue.writeBuffer(slot.xy, 0, encXY, 0, n * 2);
    this.device.queue.writeBuffer(slot.prev, 0, encPrev, 0, n);
    slot.upStamp++;
  }

  /**
   * Full-upload hook: call once per frame with a revision that changes
   * whenever the data is replaced/rebuilt. Unchanged revisions are free.
   */
  syncData(d: NormalizedXY, rev: number): void {
    if (
      this.unavailable ||
      (rev === this.appliedRev && this.slotCount === d.series.length)
    ) {
      return;
    }
    for (let i = 0; i < d.series.length; i++) {
      const s = d.series[i];
      if (s) this.upload(i, d, s);
    }
    this.slotCount = d.series.length;
    this.appliedRev = rev;
  }

  /**
   * Ring-buffer streaming append: writes only the appended tail per series.
   * `ys[i]` is the new y for series i, `prevYs[i]` the y it animates from
   * (the previous tail value), `dropped` how many leading points were evicted.
   */
  appended(
    x: number,
    ys: number[],
    prevYs: number[],
    dropped: number,
  ): boolean {
    if (this.unavailable) return false;
    const q = this.device.queue;
    for (let i = 0; i < this.slotCount; i++) {
      const s = this.slots[i];
      if (!s) return false;
      const n2 = s.n - dropped + 1;
      if (n2 > s.cap) this.grow(s, n2);
      s.start = (s.start + dropped) % s.cap;
      s.n = n2;
      const pNew = (s.start + s.n - 1) % s.cap;
      const { xr, xu, yr, yu } = s.enc;
      const ex = (this.tx(x) - xr) * xu;
      const ey = (this.ty(ys[i] ?? 0) - yr) * yu;
      const ep = (this.ty(prevYs[i] ?? 0) - yr) * yu;
      const t = this.tailScratch;
      t[0] = ex;
      t[1] = ey;
      q.writeBuffer(s.xy, pNew * 8, t, 0, 2);
      s.encXY[2 * pNew] = ex;
      s.encXY[2 * pNew + 1] = ey;
      t[0] = ep;
      q.writeBuffer(s.prev, pNew * 4, t, 0, 1);
      s.encPrev[pNew] = ep;
      // the displaced tail's prev channel becomes its own y (steady-state
      // invariant: prevY[i] = y[i] for every non-tail point)
      if (s.n > 1) {
        const pOld = (pNew + s.cap - 1) % s.cap;
        q.writeBuffer(s.prev, pOld * 4, t, 0, 1);
        s.encPrev[pOld] = ep;
      }
      s.upStamp++;
    }
    return true;
  }

  /** grow ring capacity, unwrapping logical order into the new buffer */
  private grow(s: Slot, need: number): void {
    const cap = Math.max(s.cap * 2, need + 1024);
    const a = s.cap - s.start;
    const enc = this.device.createCommandEncoder();
    const xy = this.device.createBuffer({ size: cap * 8, usage: BUF_SERIES });
    const prev = this.device.createBuffer({ size: cap * 4, usage: BUF_SERIES });
    enc.copyBufferToBuffer(s.xy, s.start * 8, xy, 0, a * 8);
    if (s.start > 0) enc.copyBufferToBuffer(s.xy, 0, xy, a * 8, s.start * 8);
    enc.copyBufferToBuffer(s.prev, s.start * 4, prev, 0, a * 4);
    if (s.start > 0)
      enc.copyBufferToBuffer(s.prev, 0, prev, a * 4, s.start * 4);
    this.device.queue.submit([enc.finish()]);
    s.xy.destroy();
    s.prev.destroy();
    s.xy = xy;
    s.prev = prev;
    const encXY = new Float32Array(cap * 2);
    const encPrev = new Float32Array(cap);
    encXY.set(s.encXY.subarray(s.start * 2, s.cap * 2), 0);
    encXY.set(s.encXY.subarray(0, s.start * 2), a * 2);
    encPrev.set(s.encPrev.subarray(s.start, s.cap), 0);
    encPrev.set(s.encPrev.subarray(0, s.start), a);
    s.encXY = encXY;
    s.encPrev = encPrev;
    s.cap = cap;
    s.start = 0;
    s.bg = null;
    s.upStamp++;
  }

  // --------------------------------------------------------------- frame --

  begin(plot: Rect, t = 1, flow = 0): void {
    this.plotR = plot;
    this.t = t;
    this.flow = flow;
    this.cols = Math.max(1, Math.ceil(plot.x + plot.w));
    this.stamp++;
    this.draws.length = 0;
    this.cmps.length = 0;
    this.uOff = 0;
  }

  /** encoded→css affine for this slot and view domain */
  private mapFor(s: Slot, view: View): [number, number, number, number] {
    const { xr, xu, yr, yu } = s.enc;
    const p = this.plotR;
    const ex0 = (this.tx(view.x[0]) - xr) * xu;
    const ex1 = (this.tx(view.x[1]) - xr) * xu;
    const ax = p.w / (ex1 - ex0 || 1e-30);
    const bx = p.x - ex0 * ax;
    const ey0 = (this.ty(view.y[0]) - yr) * yu;
    const ey1 = (this.ty(view.y[1]) - yr) * yu;
    const ay = p.h / (ey1 - ey0 || 1e-30);
    const by = p.y + ey1 * ay;
    return [ax, bx, ay, by];
  }

  private writeU(
    color: string,
    alpha: number,
    p: [number, number, number, number],
    map: [number, number, number, number],
    s: Slot,
    dec: [number, number],
  ): number {
    const off = this.uOff;
    this.uOff += UBYTES;
    const u = new Float32Array(UVEC * 4);
    u.set([this.canvas.width, this.canvas.height, this.dpr, 0]);
    const [r, g, b, a] = parseColor(color);
    u.set([r, g, b, a * alpha], 4);
    u.set(p, 8);
    u.set(map, 12);
    const inv = s.n > 1 ? this.flow / (s.n - 1) : 0;
    u.set([this.t, this.flow, inv, 0], 16);
    u.set([s.start, s.cap, s.n, 0], 20);
    u.set([dec[0], dec[1], 0, 0], 24);
    // staged — one queue.writeBuffer for all uniforms in end()
    if (this.uStage.length < this.uOff / 4 + UVEC * 4) {
      const bigger = new Float32Array(this.uOff / 4 + UVEC * 4);
      bigger.set(this.uStage);
      this.uStage = bigger;
    }
    this.uStage.set(u, off / 4);
    return off;
  }

  private decimateWanted(s: Slot): boolean {
    return s.n > this.cols * 2;
  }

  private ensureDec(s: Slot): void {
    if (s.dec && s.decCols >= this.cols) return;
    s.decKey = null;
    s.dec?.destroy();
    const cols = Math.max(this.cols, Math.ceil(this.canvas.width / this.dpr));
    s.dec = this.device.createBuffer({
      size: cols * DEC_ELEMS_PER_COL * 8,
      usage: BUF_DEC,
    });
    s.decCols = cols;
    s.bg = null;
  }

  private dispatchDec(
    s: Slot,
    map: [number, number, number, number],
    gapFillY: number,
  ): void {
    if (s.decStamp === this.stamp) return;
    s.decStamp = this.stamp;
    // decimated output is still valid while data/map/t/flow are unchanged
    const key = `${s.upStamp}|${this.cols}|${map.join(",")}|${this.t}|${this.flow}|${gapFillY}`;
    if (s.dec && s.bg && s.decKey === key) return;
    s.decKey = key;
    this.ensureDec(s);
    if (!s.bg) {
      s.bg = this.device.createBindGroup({
        layout: this.decLayout,
        entries: [
          { binding: 0, resource: { buffer: s.xy } },
          { binding: 1, resource: { buffer: s.prev } },
          { binding: 2, resource: { buffer: s.dec as GPUBuffer } },
        ],
      });
    }
    const u = this.writeU("#ffffff", 1, [0, 0, 0, 0], map, s, [
      this.cols,
      gapFillY,
    ]);
    this.cmps.push({ slot: s, u });
  }

  line(slot: number, color: string, width: number, view: View): void {
    const s = this.slots[slot];
    if (!s || s.n < 2) return;
    const map = this.mapFor(s, view);
    if (this.decimateWanted(s)) {
      this.dispatchDec(s, map, 0);
      const u = this.writeU(color, 1, [width, 0, 0, 0], map, s, [0, 0]);
      this.draws.push({
        pipe: this.pipes.lineFlat,
        vbufs: [
          { buf: s.dec as GPUBuffer, off: 0 },
          { buf: s.dec as GPUBuffer, off: 8 },
        ],
        u,
        verts: 6,
        insts: 4 * this.cols - 1,
      });
      return;
    }
    const u = this.writeU(color, 1, [width, 0, 0, 0], map, s, [0, 0]);
    const mk = (o0: number, o1: number, insts: number): DrawOp => ({
      pipe: this.pipes.line,
      vbufs: [
        { buf: s.xy, off: o0 * 8 },
        { buf: s.xy, off: o1 * 8 },
        { buf: s.prev, off: o0 * 4 },
        { buf: s.prev, off: o1 * 4 },
      ],
      u,
      verts: 6,
      insts,
    });
    if (s.start + s.n <= s.cap) {
      // contiguous run
      this.draws.push(mk(s.start, s.start + 1, s.n - 1));
      return;
    }
    // wrapped ring: run A (phys start..cap-1), bridging segment, run B (0..)
    const capA = s.cap - s.start;
    if (capA > 1) this.draws.push(mk(s.start, s.start + 1, capA - 1));
    // bridge: phys cap-1 → phys 0
    this.draws.push(mk(s.cap - 1, 0, 1));
    const rem = s.n - 1 - capA;
    if (rem > 0) this.draws.push(mk(0, 1, rem));
  }

  area(slot: number, color: string, baseVal: number, view: View): void {
    const s = this.slots[slot];
    if (!s || s.n < 2) return;
    const map = this.mapFor(s, view);
    const baseEnc = (this.ty(baseVal) - s.enc.yr) * s.enc.yu;
    const baseCss = map[3] - baseEnc * map[2];
    const p = this.plotR;
    if (this.decimateWanted(s)) {
      this.dispatchDec(s, map, baseEnc);
      const u = this.writeU(color, 1, [baseCss, p.y, p.h, 0], map, s, [0, 0]);
      this.draws.push({
        pipe: this.pipes.areaFlat,
        vbufs: [{ buf: s.dec as GPUBuffer, off: this.cols * 4 * 8 }],
        u,
        verts: 8 * this.cols,
        insts: 1,
      });
      return;
    }
    // direct strip: build doubled [x,y] + prev in logical order on CPU
    const m = s.n;
    const xyD = new Float32Array(m * 4);
    const pvD = new Float32Array(m * 2);
    for (let i = 0; i < m; i++) {
      const ph = (s.start + i) % s.cap;
      xyD[4 * i] = s.encXY[2 * ph] as number;
      xyD[4 * i + 1] = s.encXY[2 * ph + 1] as number;
      xyD[4 * i + 2] = xyD[4 * i] as number;
      xyD[4 * i + 3] = xyD[4 * i + 1] as number;
      pvD[2 * i] = s.encPrev[ph] as number;
      pvD[2 * i + 1] = pvD[2 * i] as number;
    }
    // scratch layout: doubled xy (m*16 B) then doubled prev (m*8 B)
    if (!s.scratch || s.scratchN < m) {
      s.scratch?.destroy();
      s.scratch = this.device.createBuffer({
        size: Math.max(4096, m * 24),
        usage: BUF_VERTEX_DST,
      });
      s.scratchN = m;
    }
    const prevOff = m * 16;
    this.device.queue.writeBuffer(s.scratch, 0, xyD);
    this.device.queue.writeBuffer(s.scratch, prevOff, pvD);
    const u = this.writeU(color, 1, [baseCss, p.y, p.h, 0], map, s, [0, 0]);
    this.draws.push({
      pipe: this.pipes.area,
      vbufs: [
        { buf: s.scratch, off: 0 },
        { buf: s.scratch, off: prevOff },
      ],
      u,
      verts: m * 2,
      insts: 1,
    });
  }

  points(
    slot: number,
    color: string,
    radius: number,
    alpha: number,
    view: View,
  ): void {
    const s = this.slots[slot];
    if (!s || s.n < 1) return;
    const map = this.mapFor(s, view);
    const u = this.writeU(color, alpha, [radius, 0, 0, 0], map, s, [0, 0]);
    const mk = (o0: number, insts: number): DrawOp => ({
      pipe: this.pipes.points,
      vbufs: [
        { buf: s.xy, off: o0 * 8 },
        { buf: s.prev, off: o0 * 4 },
      ],
      u,
      verts: 6,
      insts,
    });
    if (s.start + s.n <= s.cap) {
      this.draws.push(mk(s.start, s.n));
      return;
    }
    const capA = s.cap - s.start;
    this.draws.push(mk(s.start, capA));
    if (s.n - capA > 0) this.draws.push(mk(0, s.n - capA));
  }

  end(): void {
    if (this.unavailable || (!this.draws.length && !this.cmps.length)) return;
    try {
      if (this.uOff > 0) {
        this.device.queue.writeBuffer(
          this.ubuf,
          0,
          this.uStage,
          0,
          this.uOff / 4,
        );
      }
      const encoder = this.device.createCommandEncoder();
      if (this.cmps.length) {
        const cp = encoder.beginComputePass();
        cp.setPipeline(this.pipes.dec);
        for (const c of this.cmps) {
          cp.setBindGroup(0, this.ubiGroup, [c.u]);
          cp.setBindGroup(1, c.slot.bg as GPUBindGroup);
          cp.dispatchWorkgroups(Math.ceil(this.cols / 64));
        }
        cp.end();
      }
      if (this.draws.length) {
        const view = this.ctx.getCurrentTexture().createView();
        const d = this.dpr;
        const plot = this.plotR;
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view,
              loadOp: "clear",
              storeOp: "store",
              clearValue: { r: 0, g: 0, b: 0, a: 0 },
            },
          ],
          ...(this.querySet
            ? {
                timestampWrites: {
                  querySet: this.querySet,
                  beginningOfPassWriteIndex: 0,
                  endOfPassWriteIndex: 1,
                },
              }
            : {}),
        });
        pass.setScissorRect(
          Math.max(0, Math.floor(plot.x * d)),
          Math.max(0, Math.floor(plot.y * d)),
          Math.max(1, Math.floor(plot.w * d)),
          Math.max(1, Math.floor(plot.h * d)),
        );
        for (const op of this.draws) {
          pass.setPipeline(op.pipe);
          pass.setBindGroup(0, this.ubiGroup, [op.u]);
          for (let i = 0; i < op.vbufs.length; i++) {
            const v = op.vbufs[i];
            if (v) pass.setVertexBuffer(i, v.buf, v.off);
          }
          pass.draw(op.verts, op.insts);
        }
        pass.end();
      }
      const qs = this.querySet;
      const qb = this.queryBuf;
      const rb = this.readBuf;
      if (qs && qb && rb && !this.reading) {
        encoder.resolveQuerySet(qs, 0, 2, qb, 0);
        encoder.copyBufferToBuffer(qb, 0, rb, 0, 16);
        this.reading = true;
        this.device.queue.submit([encoder.finish()]);
        void rb.mapAsync(MAP_READ).then(
          () => {
            const v = new BigUint64Array(rb.getMappedRange());
            const t0 = v[0];
            const t1 = v[1];
            if (t0 !== undefined && t1 !== undefined) {
              this.gpuMs = Number(t1 - t0) / 1e6;
            }
            rb.unmap();
            this.reading = false;
          },
          () => {
            this.reading = false;
          },
        );
      } else {
        this.device.queue.submit([encoder.finish()]);
      }
    } catch {
      // transient device loss mid-frame — onLost() drives recovery
    }
  }

  destroy(): void {
    this.destroyed = true;
    for (const s of this.slots) {
      s.xy.destroy();
      s.prev.destroy();
      s.scratch?.destroy();
      s.dec?.destroy();
    }
    this.slots = [];
    this.ubuf?.destroy();
    this.queryBuf?.destroy();
    this.readBuf?.destroy();
    this.querySet?.destroy();
    try {
      this.ctx.unconfigure();
    } catch {
      // context may already be dead
    }
    this.canvas.remove();
  }
}

const BLEND: GPUBlendState = {
  color: {
    srcFactor: "src-alpha",
    dstFactor: "one-minus-src-alpha",
    operation: "add",
  },
  alpha: {
    srcFactor: "one",
    dstFactor: "one-minus-src-alpha",
    operation: "add",
  },
};
