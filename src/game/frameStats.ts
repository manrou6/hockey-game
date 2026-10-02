/** Rolling frame-time statistics (ms) for the debug panel and performance tests. */
export class FrameStats {
  private readonly samples: Float64Array;
  private readonly sorted: Float64Array;
  private count = 0;
  private index = 0;

  constructor(capacity = 240) {
    this.samples = new Float64Array(capacity);
    this.sorted = new Float64Array(capacity);
  }

  push(frameMs: number): void {
    this.samples[this.index] = frameMs;
    this.index = (this.index + 1) % this.samples.length;
    if (this.count < this.samples.length) this.count++;
  }

  get size(): number {
    return this.count;
  }

  average(): number {
    if (this.count === 0) return 0;
    let sum = 0;
    for (let i = 0; i < this.count; i++) sum += this.samples[i]!;
    return sum / this.count;
  }

  /** Percentile in [0, 100] (nearest-rank). */
  percentile(p: number): number {
    if (this.count === 0) return 0;
    const view = this.sorted.subarray(0, this.count);
    view.set(this.samples.subarray(0, this.count));
    view.sort();
    const rank = Math.min(this.count - 1, Math.max(0, Math.ceil((p / 100) * this.count) - 1));
    return view[rank]!;
  }

  max(): number {
    let m = 0;
    for (let i = 0; i < this.count; i++) m = Math.max(m, this.samples[i]!);
    return m;
  }

  fps(): number {
    const avg = this.average();
    return avg > 0 ? 1000 / avg : 0;
  }
}
