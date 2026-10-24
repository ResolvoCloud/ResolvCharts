export interface GpuRequestOptions {
  powerPreference?: "default" | "low-power" | "high-performance";
  /** use WebGPU compatibility mode (GLES 3.1 / D3D11 reach) */
  compat?: boolean;
  /** request "timestamp-query" when the adapter supports it */
  timing?: boolean;
  /**
   * Accept software (fallback) adapters such as SwiftShader. Off by default:
   * a CPU-rasterized GPU device is usually slower than the Canvas2D path.
   */
  allowFallback?: boolean;
}

/** Shared GPUDevice across charts — adapters/devices are expensive to acquire. */
const cache = new Map<string, Promise<GPUDevice | null>>();

export function getGpuDevice(
  opts?: GpuRequestOptions | null,
): Promise<GPUDevice | null> {
  const o = opts ?? {};
  const key = JSON.stringify(o);
  let p = cache.get(key);
  if (!p) {
    p = (async (): Promise<GPUDevice | null> => {
      try {
        const nav = typeof navigator === "undefined" ? null : navigator;
        const gpu = (nav as Navigator | null)?.gpu;
        if (!gpu) return null;
        const req: GPURequestAdapterOptions = {};
        if (o.powerPreference && o.powerPreference !== "default") {
          req.powerPreference = o.powerPreference;
        }
        if (o.compat) {
          (req as { featureLevel?: "compatibility" }).featureLevel =
            "compatibility";
        }
        // Firefox rejects requestAdapter() (instead of returning null) on
        // platforms where WebGPU isn't shipped — the catch treats both
        // outcomes as "unavailable"
        const adapter = await gpu.requestAdapter(req);
        if (!adapter) return null;
        if (
          !o.allowFallback &&
          (adapter as { isFallbackAdapter?: boolean }).isFallbackAdapter
        ) {
          return null;
        }
        const requiredFeatures: GPUFeatureName[] = [];
        if (o.timing && adapter.features.has("timestamp-query")) {
          requiredFeatures.push("timestamp-query");
        }
        const device = await adapter.requestDevice({ requiredFeatures });
        // evict on loss so the next getGpuDevice() re-requests a fresh
        // adapter+device (all GpuSeries instances share this cache entry)
        device.lost.then(() => cache.delete(key));
        return device;
      } catch {
        return null;
      }
    })();
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}
