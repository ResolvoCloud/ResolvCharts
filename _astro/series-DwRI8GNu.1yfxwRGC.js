function e(e){if(e.startsWith(`#`)){let t=e.slice(1);if(t.length===3)return[parseInt(t[0],16)/15,parseInt(t[1],16)/15,parseInt(t[2],16)/15,1];if(t.length===6)return[parseInt(t.slice(0,2),16)/255,parseInt(t.slice(2,4),16)/255,parseInt(t.slice(4,6),16)/255,1]}let t=/rgba?\(([^)]+)\)/.exec(e);if(t){let e=t[1].split(`,`).map(e=>Number.parseFloat(e));return[(e[0]??0)/255,(e[1]??0)/255,(e[2]??0)/255,e[3]??1]}return[0,0,0,1]}var t=new Map;function n(e){let n=e??{},r=JSON.stringify(n),i=t.get(r);return i||(i=(async()=>{try{let e=(typeof navigator>`u`?null:navigator)?.gpu;if(!e)return null;let i={};n.powerPreference&&n.powerPreference!=="default"&&(i.powerPreference=n.powerPreference),n.compat&&(i.featureLevel=`compatibility`);let a=await e.requestAdapter(i);if(!a||!n.allowFallback&&a.isFallbackAdapter)return null;let o=[];n.timing&&a.features.has(`timestamp-query`)&&o.push(`timestamp-query`);let s=await a.requestDevice({requiredFeatures:o});return s.lost.then(()=>t.delete(r)),s}catch{return null}})(),i.catch(()=>t.delete(r)),t.set(r,i)),i}var r=`
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
`,i=`
${r}
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
`,a=`
${r}
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
`,o=`
${r}
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
`,s=`
${r}
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
`,c=`
${r}
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
`,l=`
${r}
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
`,u=40,d=72,f=516,p=9,m=172,h=160,g=1,_=7,v=256,y=262144,b=12,x=class t{setLog(e,t){this.invLx=e?1/Math.log(e):0,this.invLy=t?1/Math.log(t):0,this.appliedRev=-1}tx(e){return this.invLx?e>0?Math.log(e)*this.invLx:NaN:e}ty(e){return this.invLy?e>0?Math.log(e)*this.invLy:NaN:e}get unavailable(){return this.dead||this.recovering}constructor(e,t,n){this.dpr=1,this.slots=[],this.slotCount=0,this.appliedRev=-1,this.draws=[],this.cmps=[],this.uOff=0,this.stamp=0,this.plotR={x:0,y:0,w:1,h:1},this.cols=1,this.t=1,this.flow=0,this.tailScratch=new Float32Array(4),this.uStage=new Float32Array,this.gpuMs=null,this.querySet=null,this.queryBuf=null,this.readBuf=null,this.reading=!1,this.timing=!1,this.destroyed=!1,this.dead=!1,this.recovering=!1,this.invLx=0,this.invLy=0,this.opts=n,this.timing=!!n.timing,this.canvas=t,t.style.cssText=`position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none`;let r=t.getContext(`webgpu`);if(!r)throw Error(`resolvcharts: webgpu context unavailable`);this.ctx=r,this.device=e,this.format=navigator.gpu.getPreferredCanvasFormat(),this.setup(e)}static async create(e){let r=e??{},i=await n(r);if(!i)return null;let a=document.createElement(`canvas`);try{return new t(i,a,r)}catch{return null}}setup(e){this.device=e,this.layout=e.createBindGroupLayout({entries:[{binding:0,visibility:_,buffer:{type:`uniform`,hasDynamicOffset:!0}}]}),this.decLayout=e.createBindGroupLayout({entries:[{binding:0,visibility:4,buffer:{type:`read-only-storage`}},{binding:1,visibility:4,buffer:{type:`read-only-storage`}},{binding:2,visibility:4,buffer:{type:`storage`}}]}),this.ubuf=e.createBuffer({size:y,usage:d}),this.ubiGroup=e.createBindGroup({layout:this.layout,entries:[{binding:0,resource:{buffer:this.ubuf,size:112}}]});let t=e.createPipelineLayout({bindGroupLayouts:[this.layout]}),n=e.createPipelineLayout({bindGroupLayouts:[this.layout,this.decLayout]}),r=(n,r,i)=>e.createRenderPipeline({layout:t,vertex:{module:e.createShaderModule({code:n}),entryPoint:`vs`,buffers:i},fragment:{module:e.createShaderModule({code:n}),entryPoint:`fs`,targets:[{format:this.format,blend:S}]},primitive:{topology:r}}),u={arrayStride:8,stepMode:`instance`,attributes:[{shaderLocation:0,offset:0,format:`float32x2`}]},m={arrayStride:8,stepMode:`instance`,attributes:[{shaderLocation:1,offset:0,format:`float32x2`}]},h={arrayStride:4,stepMode:`instance`,attributes:[{shaderLocation:2,offset:0,format:`float32`}]},g={arrayStride:4,stepMode:`instance`,attributes:[{shaderLocation:3,offset:0,format:`float32`}]},v={arrayStride:4,stepMode:`instance`,attributes:[{shaderLocation:1,offset:0,format:`float32`}]},b={arrayStride:8,stepMode:`vertex`,attributes:[{shaderLocation:0,offset:0,format:`float32x2`}]},x={arrayStride:4,stepMode:`vertex`,attributes:[{shaderLocation:1,offset:0,format:`float32`}]};this.pipes={line:r(i,`triangle-list`,[u,m,h,g]),lineFlat:r(a,`triangle-list`,[u,m]),area:r(o,`triangle-strip`,[b,x]),areaFlat:r(s,`triangle-strip`,[b]),points:r(c,`triangle-list`,[u,v]),dec:e.createComputePipeline({layout:n,compute:{module:e.createShaderModule({code:l}),entryPoint:`dec`}})},this.timing&&e.features.has(`timestamp-query`)&&(this.querySet=e.createQuerySet({type:`timestamp`,count:2}),this.queryBuf=e.createBuffer({size:16,usage:f}),this.readBuf=e.createBuffer({size:16,usage:p})),e.lost.then(e=>this.onLost(e))}onLost(e){this.destroyed||(e.reason===`destroyed`?this.dead=!0:(this.recovering=!0,n(this.opts).then(e=>{if(!e||this.destroyed)this.fail();else try{this.teardownResources(),this.setup(e);try{this.configure()}catch{let e=document.createElement(`canvas`);e.width=this.canvas.width,e.height=this.canvas.height,this.canvas.replaceWith(e),this.canvas=e;let t=e.getContext(`webgpu`);if(!t)throw Error(`webgpu context lost`);this.ctx=t,this.configure()}this.appliedRev=-1,this.recovering=!1}catch{this.fail()}})))}fail(){this.dead=!0,this.recovering=!1,this.destroy()}teardownResources(){for(let e of this.slots)e.xy.destroy(),e.prev.destroy(),e.scratch?.destroy(),e.dec?.destroy();this.slots=[],this.slotCount=0,this.ubuf.destroy(),this.queryBuf?.destroy(),this.readBuf?.destroy(),this.querySet?.destroy(),this.querySet=null,this.queryBuf=null,this.readBuf=null}configure(){this.ctx.configure({device:this.device,format:this.format,alphaMode:`premultiplied`})}setSize(e,t,n){this.dpr=n,this.canvas.width=Math.max(1,Math.round(e*n)),this.canvas.height=Math.max(1,Math.round(t*n)),this.unavailable||this.configure()}upload(e,t,n){let r=t.sortedX,i=this.invLx&&t.sortedXLog?t.sortedXLog:null,a=this.invLy&&n.yLog?n.yLog:null,o=a&&n.prevYLog?n.prevYLog:null,s=Math.min(r.length,n.y.length),c=s>0?i?i[0]:this.tx(r[0]):0,l=1/((s>0?(i?i[s-1]:this.tx(r[s-1]))-c:0)||Math.max(1,Math.abs(c),1)),u=1/0,d=-1/0;for(let e=0;e<s;e++){let t=a?a[e]:this.ty(n.y[e]);t<u&&(u=t),t>d&&(d=t)}let f=u===1/0?0:u,p=1/(d-u||Math.max(1,Math.abs(f))),h=this.slots[e],g=Math.max(1024,Math.ceil(s*1.25));!h||h.cap<s?(h?.xy.destroy(),h?.prev.destroy(),h?.dec?.destroy(),h={n:s,cap:g,start:0,enc:{xr:c,xu:l,yr:f,yu:p},encXY:new Float32Array(g*2),encPrev:new Float32Array(g),xy:this.device.createBuffer({size:g*8,usage:m}),prev:this.device.createBuffer({size:g*4,usage:m}),scratch:null,scratchN:0,dec:null,decCols:0,decKey:null,upStamp:0,bg:null,decStamp:-1},this.slots[e]=h):(h.n=s,h.start=0,h.enc={xr:c,xu:l,yr:f,yu:p},h.bg=null,h.decStamp=-1);let{encXY:_,encPrev:v}=h,y=n.prevY;for(let e=0;e<s;e++)_[2*e]=((i?i[e]:this.tx(r[e]))-c)*l,_[2*e+1]=((a?a[e]:this.ty(n.y[e]))-f)*p,v[e]=y?((o?o[e]:this.ty(y[e]))-f)*p:0;this.device.queue.writeBuffer(h.xy,0,_,0,s*2),this.device.queue.writeBuffer(h.prev,0,v,0,s),h.upStamp++}syncData(e,t){if(!(this.unavailable||t===this.appliedRev&&this.slotCount===e.series.length)){for(let t=0;t<e.series.length;t++){let n=e.series[t];n&&this.upload(t,e,n)}this.slotCount=e.series.length,this.appliedRev=t}}appended(e,t,n,r){if(this.unavailable)return!1;let i=this.device.queue;for(let a=0;a<this.slotCount;a++){let o=this.slots[a];if(!o)return!1;let s=o.n-r+1;s>o.cap&&this.grow(o,s),o.start=(o.start+r)%o.cap,o.n=s;let c=(o.start+o.n-1)%o.cap,{xr:l,xu:u,yr:d,yu:f}=o.enc,p=(this.tx(e)-l)*u,m=(this.ty(t[a]??0)-d)*f,h=(this.ty(n[a]??0)-d)*f,g=this.tailScratch;if(g[0]=p,g[1]=m,i.writeBuffer(o.xy,c*8,g,0,2),o.encXY[2*c]=p,o.encXY[2*c+1]=m,g[0]=h,i.writeBuffer(o.prev,c*4,g,0,1),o.encPrev[c]=h,o.n>1){let e=(c+o.cap-1)%o.cap;i.writeBuffer(o.prev,e*4,g,0,1),o.encPrev[e]=h}o.upStamp++}return!0}grow(e,t){let n=Math.max(e.cap*2,t+1024),r=e.cap-e.start,i=this.device.createCommandEncoder(),a=this.device.createBuffer({size:n*8,usage:m}),o=this.device.createBuffer({size:n*4,usage:m});i.copyBufferToBuffer(e.xy,e.start*8,a,0,r*8),e.start>0&&i.copyBufferToBuffer(e.xy,0,a,r*8,e.start*8),i.copyBufferToBuffer(e.prev,e.start*4,o,0,r*4),e.start>0&&i.copyBufferToBuffer(e.prev,0,o,r*4,e.start*4),this.device.queue.submit([i.finish()]),e.xy.destroy(),e.prev.destroy(),e.xy=a,e.prev=o;let s=new Float32Array(n*2),c=new Float32Array(n);s.set(e.encXY.subarray(e.start*2,e.cap*2),0),s.set(e.encXY.subarray(0,e.start*2),r*2),c.set(e.encPrev.subarray(e.start,e.cap),0),c.set(e.encPrev.subarray(0,e.start),r),e.encXY=s,e.encPrev=c,e.cap=n,e.start=0,e.bg=null,e.upStamp++}begin(e,t=1,n=0){this.plotR=e,this.t=t,this.flow=n,this.cols=Math.max(1,Math.ceil(e.x+e.w)),this.stamp++,this.draws.length=0,this.cmps.length=0,this.uOff=0}mapFor(e,t){let{xr:n,xu:r,yr:i,yu:a}=e.enc,o=this.plotR,s=(this.tx(t.x[0])-n)*r,c=(this.tx(t.x[1])-n)*r,l=o.w/(c-s||1e-30),u=o.x-s*l,d=(this.ty(t.y[0])-i)*a,f=(this.ty(t.y[1])-i)*a,p=o.h/(f-d||1e-30);return[l,u,p,o.y+f*p]}writeU(t,n,r,i,a,o){let s=this.uOff;this.uOff+=v;let c=new Float32Array(28);c.set([this.canvas.width,this.canvas.height,this.dpr,0]);let[l,u,d,f]=e(t);c.set([l,u,d,f*n],4),c.set(r,8),c.set(i,12);let p=a.n>1?this.flow/(a.n-1):0;if(c.set([this.t,this.flow,p,0],16),c.set([a.start,a.cap,a.n,0],20),c.set([o[0],o[1],0,0],24),this.uStage.length<this.uOff/4+28){let e=new Float32Array(this.uOff/4+28);e.set(this.uStage),this.uStage=e}return this.uStage.set(c,s/4),s}decimateWanted(e){return e.n>this.cols*2}ensureDec(e){if(e.dec&&e.decCols>=this.cols)return;e.decKey=null,e.dec?.destroy();let t=Math.max(this.cols,Math.ceil(this.canvas.width/this.dpr));e.dec=this.device.createBuffer({size:t*b*8,usage:h}),e.decCols=t,e.bg=null}dispatchDec(e,t,n){if(e.decStamp===this.stamp)return;e.decStamp=this.stamp;let r=`${e.upStamp}|${this.cols}|${t.join(`,`)}|${this.t}|${this.flow}|${n}`;if(e.dec&&e.bg&&e.decKey===r)return;e.decKey=r,this.ensureDec(e),e.bg||=this.device.createBindGroup({layout:this.decLayout,entries:[{binding:0,resource:{buffer:e.xy}},{binding:1,resource:{buffer:e.prev}},{binding:2,resource:{buffer:e.dec}}]});let i=this.writeU(`#ffffff`,1,[0,0,0,0],t,e,[this.cols,n]);this.cmps.push({slot:e,u:i})}line(e,t,n,r){let i=this.slots[e];if(!i||i.n<2)return;let a=this.mapFor(i,r);if(this.decimateWanted(i)){this.dispatchDec(i,a,0);let e=this.writeU(t,1,[n,0,0,0],a,i,[0,0]);this.draws.push({pipe:this.pipes.lineFlat,vbufs:[{buf:i.dec,off:0},{buf:i.dec,off:8}],u:e,verts:6,insts:4*this.cols-1});return}let o=this.writeU(t,1,[n,0,0,0],a,i,[0,0]),s=(e,t,n)=>({pipe:this.pipes.line,vbufs:[{buf:i.xy,off:e*8},{buf:i.xy,off:t*8},{buf:i.prev,off:e*4},{buf:i.prev,off:t*4}],u:o,verts:6,insts:n});if(i.start+i.n<=i.cap){this.draws.push(s(i.start,i.start+1,i.n-1));return}let c=i.cap-i.start;c>1&&this.draws.push(s(i.start,i.start+1,c-1)),this.draws.push(s(i.cap-1,0,1));let l=i.n-1-c;l>0&&this.draws.push(s(0,1,l))}area(e,t,n,r){let i=this.slots[e];if(!i||i.n<2)return;let a=this.mapFor(i,r),o=(this.ty(n)-i.enc.yr)*i.enc.yu,s=a[3]-o*a[2],c=this.plotR;if(this.decimateWanted(i)){this.dispatchDec(i,a,o);let e=this.writeU(t,1,[s,c.y,c.h,0],a,i,[0,0]);this.draws.push({pipe:this.pipes.areaFlat,vbufs:[{buf:i.dec,off:this.cols*4*8}],u:e,verts:8*this.cols,insts:1});return}let l=i.n,d=new Float32Array(l*4),f=new Float32Array(l*2);for(let e=0;e<l;e++){let t=(i.start+e)%i.cap;d[4*e]=i.encXY[2*t],d[4*e+1]=i.encXY[2*t+1],d[4*e+2]=d[4*e],d[4*e+3]=d[4*e+1],f[2*e]=i.encPrev[t],f[2*e+1]=f[2*e]}(!i.scratch||i.scratchN<l)&&(i.scratch?.destroy(),i.scratch=this.device.createBuffer({size:Math.max(4096,l*24),usage:u}),i.scratchN=l);let p=l*16;this.device.queue.writeBuffer(i.scratch,0,d),this.device.queue.writeBuffer(i.scratch,p,f);let m=this.writeU(t,1,[s,c.y,c.h,0],a,i,[0,0]);this.draws.push({pipe:this.pipes.area,vbufs:[{buf:i.scratch,off:0},{buf:i.scratch,off:p}],u:m,verts:l*2,insts:1})}points(e,t,n,r,i){let a=this.slots[e];if(!a||a.n<1)return;let o=this.mapFor(a,i),s=this.writeU(t,r,[n,0,0,0],o,a,[0,0]),c=(e,t)=>({pipe:this.pipes.points,vbufs:[{buf:a.xy,off:e*8},{buf:a.prev,off:e*4}],u:s,verts:6,insts:t});if(a.start+a.n<=a.cap){this.draws.push(c(a.start,a.n));return}let l=a.cap-a.start;this.draws.push(c(a.start,l)),a.n-l>0&&this.draws.push(c(0,a.n-l))}end(){if(!(this.unavailable||!this.draws.length&&!this.cmps.length))try{this.uOff>0&&this.device.queue.writeBuffer(this.ubuf,0,this.uStage,0,this.uOff/4);let e=this.device.createCommandEncoder();if(this.cmps.length){let t=e.beginComputePass();t.setPipeline(this.pipes.dec);for(let e of this.cmps)t.setBindGroup(0,this.ubiGroup,[e.u]),t.setBindGroup(1,e.slot.bg),t.dispatchWorkgroups(Math.ceil(this.cols/64));t.end()}if(this.draws.length){let t=this.ctx.getCurrentTexture().createView(),n=this.dpr,r=this.plotR,i=e.beginRenderPass({colorAttachments:[{view:t,loadOp:`clear`,storeOp:`store`,clearValue:{r:0,g:0,b:0,a:0}}],...this.querySet?{timestampWrites:{querySet:this.querySet,beginningOfPassWriteIndex:0,endOfPassWriteIndex:1}}:{}});i.setScissorRect(Math.max(0,Math.floor(r.x*n)),Math.max(0,Math.floor(r.y*n)),Math.max(1,Math.floor(r.w*n)),Math.max(1,Math.floor(r.h*n)));for(let e of this.draws){i.setPipeline(e.pipe),i.setBindGroup(0,this.ubiGroup,[e.u]);for(let t=0;t<e.vbufs.length;t++){let n=e.vbufs[t];n&&i.setVertexBuffer(t,n.buf,n.off)}i.draw(e.verts,e.insts)}i.end()}let t=this.querySet,n=this.queryBuf,r=this.readBuf;t&&n&&r&&!this.reading?(e.resolveQuerySet(t,0,2,n,0),e.copyBufferToBuffer(n,0,r,0,16),this.reading=!0,this.device.queue.submit([e.finish()]),r.mapAsync(g).then(()=>{let e=new BigUint64Array(r.getMappedRange()),t=e[0],n=e[1];t!==void 0&&n!==void 0&&(this.gpuMs=Number(n-t)/1e6),r.unmap(),this.reading=!1},()=>{this.reading=!1})):this.device.queue.submit([e.finish()])}catch{}}destroy(){this.destroyed=!0;for(let e of this.slots)e.xy.destroy(),e.prev.destroy(),e.scratch?.destroy(),e.dec?.destroy();this.slots=[],this.ubuf?.destroy(),this.queryBuf?.destroy(),this.readBuf?.destroy(),this.querySet?.destroy();try{this.ctx.unconfigure()}catch{}this.canvas.remove()}},S={color:{srcFactor:`src-alpha`,dstFactor:`one-minus-src-alpha`,operation:`add`},alpha:{srcFactor:`one`,dstFactor:`one-minus-src-alpha`,operation:`add`}};export{x as GpuSeries};