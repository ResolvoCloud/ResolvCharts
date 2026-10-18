export interface GpuRequestOptions {
  powerPreference?: "default" | "low-power" | "high-performance";
  /** use WebGPU compatibility mode (GLES 3.1 / D3D11 reach) */
  compat?: boolean;
  /** request "timestamp-query" when the adapter supports it */
  timing?: boolean;
}

/** Shared GPUDevice across charts — adapters/devices are expensive to acquire. */
const cache = new Map<string, Promise<GPUDevice | null>>();

export function getGpuDevice(
  opts: GpuRequestOptions = {},
): Promise<GPUDevice | null> {
  const key = JSON.stringify(opts);
  let p = cache.get(key);
  if (!p) {
    p = (async (): Promise<GPUDevice | null> => {
      const nav = typeof navigator === "undefined" ? null : navigator;
      const gpu = (nav as Navigator | null)?.gpu;
      if (!gpu) return null;
      const req: GPURequestAdapterOptions = {};
      if (opts.powerPreference && opts.powerPreference !== "default") {
        req.powerPreference = opts.powerPreference;
      }
      if (opts.compat) {
        (req as { featureLevel?: "compatibility" }).featureLevel =
          "compatibility";
      }
      const adapter = await gpu.requestAdapter(req);
      if (!adapter) return null;
      const requiredFeatures: GPUFeatureName[] = [];
      if (opts.timing && adapter.features.has("timestamp-query")) {
        requiredFeatures.push("timestamp-query");
      }
      return adapter.requestDevice({ requiredFeatures });
    })();
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}
