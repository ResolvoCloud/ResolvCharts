type FrameFn = (now: number) => boolean;

const raf: (cb: (t: number) => void) => number =
  typeof requestAnimationFrame === "function"
    ? (cb) => requestAnimationFrame(cb)
    : (cb) => setTimeout(() => cb(Date.now()), 16) as unknown as number;

const caf: (id: number) => void =
  typeof cancelAnimationFrame === "function"
    ? (id) => cancelAnimationFrame(id)
    : (id) => clearTimeout(id);

/**
 * Shared frame scheduler. Registered functions run once per animation frame
 * while they return true; the loop self-terminates when idle so charts burn
 * no CPU at rest.
 */
export class Scheduler {
  private items = new Set<FrameFn>();
  private id: number | null = null;

  add(fn: FrameFn): void {
    this.items.add(fn);
    if (this.id === null) {
      this.id = raf(this.tick);
    }
  }

  remove(fn: FrameFn): void {
    this.items.delete(fn);
  }

  private tick = (now: number): void => {
    this.id = null;
    for (const fn of [...this.items]) {
      if (!fn(now)) this.items.delete(fn);
    }
    if (this.items.size > 0) {
      this.id = raf(this.tick);
    }
  };

  destroy(): void {
    this.items.clear();
    if (this.id !== null) {
      caf(this.id);
      this.id = null;
    }
  }
}

export const sharedScheduler: Scheduler = new Scheduler();

export const easeOutCubic: (t: number) => number = (t) => 1 - (1 - t) ** 3;
