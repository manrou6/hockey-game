import { TUNING } from '../config/tuning';
import { emptyCommand, type PlayerCommand } from '../sim/commands';
import { createWorld, stepWorld, type WorldState } from '../sim/world';
import type { Renderer } from '../render/renderer';
import { FixedStepLoop } from './fixedStepLoop';
import { FrameStats } from './frameStats';

/** Source of the human player's command, polled once per rendered frame. */
export interface CommandSource {
  read(out: PlayerCommand): void;
  /** Button presses were used by a tick: clear them (so they fire exactly once). */
  consumeEdges?(): void;
}

/** Main loop: real time → fixed sim ticks → interpolated render. */
export class Game {
  readonly world: WorldState;
  readonly loop = new FixedStepLoop(TUNING.sim.tickRate, TUNING.sim.maxStepsPerFrame);
  /** Interval between rendered frames (ms). */
  readonly frameStats = new FrameStats(240);
  /** CPU time spent inside our frame callback (sim + render submit), ms. */
  readonly workStats = new FrameStats(240);
  /** Current command per controlled player (read-only outside; exposed for tests). */
  readonly commands: PlayerCommand[] = [emptyCommand()];
  private lastTime = -1;
  private running = false;
  /** While paused the sim does not advance (the scene is still drawn behind the menu). */
  paused = false;
  private readonly onFrameCallbacks: (() => void)[] = [];

  constructor(
    private readonly renderer: Renderer,
    private readonly input: CommandSource | null,
    seed = 1,
  ) {
    this.world = createWorld(seed);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.renderer.engine.runRenderLoop(() => this.frame());
  }

  /** Called after each rendered frame (debug panel, HUD). */
  onFrame(cb: () => void): void {
    this.onFrameCallbacks.push(cb);
  }

  private frame(): void {
    const now = performance.now();
    const frameMs = this.lastTime < 0 ? 1000 / 60 : now - this.lastTime;
    this.lastTime = now;
    // Ignore huge gaps (tab hidden) in stats; the loop clamps them anyway.
    if (frameMs < 250) this.frameStats.push(frameMs);

    if (!this.paused) {
      if (this.input) this.input.read(this.commands[0]!);
      const cmd = this.commands[0]!;
      this.loop.advance(frameMs / 1000, () => {
        stepWorld(this.world, this.commands, TUNING);
        if (cmd.pass || cmd.shoot || cmd.dribble) {
          cmd.pass = cmd.shoot = cmd.dribble = false;
          this.input?.consumeEdges?.();
        }
      });
    }
    this.renderer.sync(this.world, this.loop.alpha, Math.min(frameMs, 100) / 1000);
    this.renderer.render();
    this.workStats.push(performance.now() - now);
    for (const cb of this.onFrameCallbacks) cb();
  }
}
