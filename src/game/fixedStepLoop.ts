/**
 * Fixed-timestep accumulator. Real frame time goes in; a whole number of simulation
 * ticks comes out, plus the interpolation factor `alpha` for rendering between the
 * last two ticks. Clamped so a long pause never triggers a burst of catch-up steps.
 */
export class FixedStepLoop {
  readonly stepSeconds: number;
  private accumulator = 0;
  /** Interpolation factor in [0, 1) between previous and current tick. */
  alpha = 0;
  /** Steps run during the last `advance` call (debug). */
  lastSteps = 0;

  constructor(
    tickRate: number,
    private readonly maxStepsPerFrame: number,
  ) {
    this.stepSeconds = 1 / tickRate;
  }

  /** Advance by `frameSeconds` of real time, calling `step` once per fixed tick. */
  advance(frameSeconds: number, step: () => void): void {
    this.accumulator += Math.max(0, frameSeconds);
    const maxAccum = this.stepSeconds * this.maxStepsPerFrame;
    if (this.accumulator > maxAccum) this.accumulator = maxAccum;
    let steps = 0;
    // Small epsilon so 1/60 s frames don't alternate between 0 and 2 steps from float error.
    while (this.accumulator + 1e-9 >= this.stepSeconds) {
      step();
      this.accumulator -= this.stepSeconds;
      steps++;
    }
    if (this.accumulator < 0) this.accumulator = 0;
    this.lastSteps = steps;
    this.alpha = this.accumulator / this.stepSeconds;
  }
}
