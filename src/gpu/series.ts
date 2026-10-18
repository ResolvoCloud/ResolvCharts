import type { Rect } from "../core/types";
import { parseColor } from "./color";
import { type GpuRequestOptions, getGpuDevice } from "./device";

/**
 * WebGPU series renderer. Points arrive as interleaved [x, y] CSS-pixel pairs
 * (the same Float32Array the canvas path decimates into) uploaded as vertex
 * buffers; the GPU only rasterizes — instanced segment quads for lines, a
 * triangle strip to the baseline for areas, SDF circle sprites for scatter.
 *
 * Vertex-pulling via attributes is used everywhere (no vertex-stage storage
 * buffers), so the same pipelines work in WebGPU compatibility mode.
 */

const HEADER = /* wgsl */ `
struct U {
  res: vec4f,   // canvas w, h (device px), dpr, unused
  color: vec4f,
  p: vec4f,     // line: width | area: baseY, plotTop, plotH | points: radius
};
@group(0) @binding(0) var<uniform> u: U;

fn toClip(p: vec2f) -> vec4f {
  let d = p * u.res.z;
  return vec4f(d.x / u.res.x * 2.0 - 1.0, 1.0 - d.y / u.res.y * 2.0, 0.0, 1.0);
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
@vertex fn vs(
  @builtin(vertex_index) vi: u32,
  @location(0) a: vec2f,
  @location(1) b: vec2f,
) -> VOut {
  let v = OFF[vi];
  var dir = b - a;
  let len = length(dir);
  if (len < 1e-6) {
    dir = vec2f(1.0, 0.0);
  } else {
    dir = dir / len;
  }
  let nrm = vec2f(-dir.y, dir.x);
  let halfW = u.p.x * 0.5;
  let aa = 0.9;
  let p = mix(a, b, v.x) + nrm * v.y * (halfW + aa);
  var o: VOut;
  o.pos = toClip(p);
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
// triangle strip over a doubled buffer: buf[2k] and buf[2k+1] both hold
// point k; even verts land on the path, odd verts drop to the baseline
@vertex fn vs(
  @builtin(vertex_index) vi: u32,
  @location(0) top: vec2f,
) -> VOut {
  let isTop = (vi & 1u) == 0u;
  let baseY = u.p.x;
  let y = select(baseY, top.y, isTop);
  var o: VOut;
  o.pos = toClip(vec2f(top.x, y));
  o.grad = clamp((top.y - u.p.y) / max(u.p.z, 1.0), 0.0, 1.0);
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
  vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
);
struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) local: vec2f,
};
@vertex fn vs(
  @builtin(vertex_index) vi: u32,
  @location(0) c: vec2f,
) -> VOut {
  let r = u.p.x;
  let q = QUAD[vi];
  var o: VOut;
  o.pos = toClip(c + q * r);
  o.local = q * r;
  return o;
}
@fragment fn fs(o: VOut) -> @location(0) vec4f {
  let r = u.p.x;
  let a = 1.0 - smoothstep(r - 1.2, r, length(o.local));
  return vec4f(u.color.rgb, u.color.a * a);
}
`;

const UNIFORM_SIZE = 64; // 4 x vec4f
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

// GPUBufferUsage flags (lib.dom has the types but not the const objects)
const BUF_VERTEX_DST = 0x28; // VERTEX | COPY_DST
const BUF_UNIFORM_DST = 0x48; // UNIFORM | COPY_DST
const BUF_RESOLVE_SRC = 0x204; // QUERY_RESOLVE | COPY_SRC
const BUF_MAPREAD_DST = 0x09; // MAP_READ | COPY_DST
const MAP_READ = 0x1;

export class GpuSeries {
  readonly canvas: HTMLCanvasElement;
  private device: GPUDevice;
  private ctx: GPUCanvasContext;
  private format: GPUTextureFormat;
  private pipes: {
    line: GPURenderPipeline;
    area: GPURenderPipeline;
    points: GPURenderPipeline;
  };
  private layout: GPUBindGroupLayout;
  private dpr = 1;
  private drawIdx = 0;
  private bufs: GPUBuffer[] = [];
  private encoder: GPUCommandEncoder | null = null;
  private pass: GPURenderPassEncoder | null = null;
  /** last measured GPU execution time in ms (when timing enabled) */
  gpuMs: number | null = null;
  private querySet: GPUQuerySet | null = null;
  private queryBuf: GPUBuffer | null = null;
  private readBuf: GPUBuffer | null = null;
  private reading = false;
  private areaScratch = new Float32Array(0);

  private constructor(
    device: GPUDevice,
    canvas: HTMLCanvasElement,
    timing: boolean,
  ) {
    this.device = device;
    if (timing && device.features.has("timestamp-query")) {
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
    this.canvas = canvas;
    canvas.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none";
    const ctx = canvas.getContext("webgpu") as GPUCanvasContext | null;
    if (!ctx) throw new Error("resolvcharts: webgpu context unavailable");
    this.ctx = ctx;
    this.format = navigator.gpu.getPreferredCanvasFormat();

    this.layout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          // GPUShaderStage.VERTEX | FRAGMENT
          visibility: 3,
          buffer: { type: "uniform" },
        },
      ],
    });
    const pl = device.createPipelineLayout({ bindGroupLayouts: [this.layout] });
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
    // line: same points buffer bound twice — slot 0 yields pts[i],
    // slot 1 (bound at +8 bytes) yields pts[i+1]
    const pairLayout: GPUVertexBufferLayout[] = [
      {
        arrayStride: 8,
        stepMode: "instance",
        attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }],
      },
      {
        arrayStride: 8,
        stepMode: "instance",
        attributes: [{ shaderLocation: 1, offset: 0, format: "float32x2" }],
      },
    ];
    const ptLayout: GPUVertexBufferLayout = {
      arrayStride: 8,
      stepMode: "instance",
      attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }],
    };
    const areaLayout: GPUVertexBufferLayout = {
      arrayStride: 8,
      stepMode: "vertex",
      attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }],
    };
    this.pipes = {
      line: mk(LINE_WGSL, "triangle-list", pairLayout),
      area: mk(AREA_WGSL, "triangle-strip", [areaLayout]),
      points: mk(POINTS_WGSL, "triangle-list", [ptLayout]),
    };
  }

  static async create(opts: GpuRequestOptions = {}): Promise<GpuSeries | null> {
    const device = await getGpuDevice(opts);
    if (!device) return null;
    const canvas = document.createElement("canvas");
    try {
      const g = new GpuSeries(device, canvas, !!opts.timing);
      return g;
    } catch {
      return null;
    }
  }

  setSize(cssW: number, cssH: number, dpr: number): void {
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(cssW * dpr));
    this.canvas.height = Math.max(1, Math.round(cssH * dpr));
    this.ctx.configure({
      device: this.device,
      format: this.format,
      alphaMode: "premultiplied",
    });
  }

  private bufferFor(idx: number, bytes: number): GPUBuffer {
    let b = this.bufs[idx];
    if (!b || b.size < bytes) {
      b?.destroy();
      b = this.device.createBuffer({
        size: Math.max(256, bytes),
        usage: BUF_VERTEX_DST,
      });
      this.bufs[idx] = b;
    }
    return b;
  }

  begin(plot: Rect): void {
    this.encoder = this.device.createCommandEncoder();
    const view = this.ctx.getCurrentTexture().createView();
    this.pass = this.encoder.beginRenderPass({
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
    const d = this.dpr;
    this.pass.setScissorRect(
      Math.max(0, Math.floor(plot.x * d)),
      Math.max(0, Math.floor(plot.y * d)),
      Math.max(1, Math.floor(plot.w * d)),
      Math.max(1, Math.floor(plot.h * d)),
    );
    this.drawIdx = 0;
  }

  private draw(
    pipe: GPURenderPipeline,
    vbufs: { buf: GPUBuffer; offset: number }[],
    color: string,
    alpha: number,
    params: [number, number, number],
    vertCount: number,
    instances: number,
  ): void {
    const pass = this.pass;
    if (!pass || instances <= 0) return;
    const [r, g, b, a] = parseColor(color);
    const udata = new Float32Array(16);
    udata.set([this.canvas.width, this.canvas.height, this.dpr, 0]);
    udata.set([r, g, b, a * alpha], 4);
    udata.set(params, 8);
    const ubuf = this.device.createBuffer({
      size: UNIFORM_SIZE,
      usage: BUF_UNIFORM_DST,
    });
    this.device.queue.writeBuffer(ubuf, 0, udata);

    const bind = this.device.createBindGroup({
      layout: this.layout,
      entries: [{ binding: 0, resource: { buffer: ubuf } }],
    });
    pass.setPipeline(pipe);
    pass.setBindGroup(0, bind);
    for (let i = 0; i < vbufs.length; i++) {
      const v = vbufs[i];
      if (v) pass.setVertexBuffer(i, v.buf, v.offset);
    }
    pass.draw(vertCount, instances);
  }

  line(pts: Float32Array, color: string, width = 2): void {
    const n = pts.length / 2;
    const idx = this.drawIdx++;
    const pbuf = this.bufferFor(idx, pts.byteLength);
    this.device.queue.writeBuffer(pbuf, 0, pts as Float32Array<ArrayBuffer>);
    this.draw(
      this.pipes.line,
      [
        { buf: pbuf, offset: 0 },
        { buf: pbuf, offset: 8 },
      ],
      color,
      1,
      [width, 0, 0],
      6,
      n - 1,
    );
  }

  area(pts: Float32Array, color: string, baseY: number, plot: Rect): void {
    const n = pts.length / 2;
    // double each point so vertex_index can pick top vs baseline by parity
    if (this.areaScratch.length < n * 4) {
      this.areaScratch = new Float32Array(n * 4);
    }
    const d = this.areaScratch;
    for (let i = 0; i < n; i++) {
      const x = pts[2 * i] as number;
      const y = pts[2 * i + 1] as number;
      const o = 4 * i;
      d[o] = x;
      d[o + 1] = y;
      d[o + 2] = x;
      d[o + 3] = y;
    }
    const out = d.subarray(0, n * 4);
    const idx = this.drawIdx++;
    const pbuf = this.bufferFor(idx, out.byteLength);
    this.device.queue.writeBuffer(pbuf, 0, out as Float32Array<ArrayBuffer>);
    this.draw(
      this.pipes.area,
      [{ buf: pbuf, offset: 0 }],
      color,
      1,
      [baseY, plot.y, plot.h],
      n * 2,
      1,
    );
  }

  points(pts: Float32Array, color: string, radius = 2.5, alpha = 0.65): void {
    const n = pts.length / 2;
    const idx = this.drawIdx++;
    const pbuf = this.bufferFor(idx, pts.byteLength);
    this.device.queue.writeBuffer(pbuf, 0, pts as Float32Array<ArrayBuffer>);
    this.draw(
      this.pipes.points,
      [{ buf: pbuf, offset: 0 }],
      color,
      alpha,
      [radius, 0, 0],
      6,
      n,
    );
  }

  end(): void {
    if (!this.pass || !this.encoder) return;
    this.pass.end();
    const qs = this.querySet;
    const qb = this.queryBuf;
    const rb = this.readBuf;
    if (qs && qb && rb && !this.reading) {
      this.encoder.resolveQuerySet(qs, 0, 2, qb, 0);
      this.encoder.copyBufferToBuffer(qb, 0, rb, 0, 16);
      this.reading = true;
      this.device.queue.submit([this.encoder.finish()]);
      void rb.mapAsync(MAP_READ).then(() => {
        const v = new BigUint64Array(rb.getMappedRange());
        const t0 = v[0];
        const t1 = v[1];
        if (t0 !== undefined && t1 !== undefined) {
          this.gpuMs = Number(t1 - t0) / 1e6;
        }
        rb.unmap();
        this.reading = false;
      });
    } else {
      this.device.queue.submit([this.encoder.finish()]);
    }
    this.pass = null;
    this.encoder = null;
  }

  destroy(): void {
    for (const b of this.bufs) b.destroy();
    this.queryBuf?.destroy();
    this.readBuf?.destroy();
    this.querySet?.destroy();
    this.bufs = [];
    this.ctx.unconfigure();
    this.canvas.remove();
  }
}
