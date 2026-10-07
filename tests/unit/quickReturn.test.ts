import { describe, expect, it } from 'vitest';
import { TUNING, type Tuning } from '../../src/config/tuning';
import { emptyCommand, type PlayerCommand } from '../../src/sim/commands';
import { createWorld, stepWorld, type WorldState } from '../../src/sim/world';

const cmd = (x = 0, y = 0, extra: Partial<PlayerCommand> = {}): PlayerCommand => ({ ...emptyCommand(), moveX: x, moveY: y, ...extra });

function tuningWith(patch: (t: Tuning) => void): Tuning {
  const t = structuredClone(TUNING);
  t.mates.switchControl = 0; // you keep your player; the teammate gives the ball back
  t.mates.move = 0;
  patch(t);
  return t;
}

/** Seconds the teammate keeps the ball before giving it back (NaN if he never has it / never returns it). */
function holdSeconds(t: Tuning, running: boolean, seed = 4): number {
  const w: WorldState = createWorld(seed, 2);
  const step = (c: PlayerCommand, n = 1): void => {
    for (let i = 0; i < n; i++) stepWorld(w, [c], t);
  };
  w.players[2]!.x = w.players[2]!.prevX = -19;
  w.players[2]!.y = w.players[2]!.prevY = -9;
  for (let i = 0; i < 120 && w.ball.owner !== 0; i++) step(cmd(0.5, 0));
  step(cmd(), 60);
  const p = w.players[0]!;
  const m = w.players[1]!;
  p.x = p.prevX = -12;
  p.y = p.prevY = -2;
  p.heading = 0;
  w.ball.x = w.ball.prevX = p.x + 0.6;
  w.ball.y = w.ball.prevY = p.y - 0.2;
  w.ball.vx = w.ball.vy = 0;
  m.x = m.prevX = -9;
  m.y = m.prevY = 4;
  if (running) step(cmd(1, 0), 60);
  const a = Math.atan2(m.y - w.ball.y, m.x - w.ball.x);
  step(cmd(Math.cos(a), Math.sin(a), { pass: true }));
  let got = -1;
  for (let i = 0; i < 360; i++) {
    step(running ? cmd(1, 0) : cmd());
    if (got < 0 && w.ball.owner === 1) got = w.tick;
    if (got >= 0 && w.ball.owner !== 1) return (w.tick - got) / 60;
  }
  return Number.NaN;
}

describe('quick return of the teammates (give-and-go, F1.4d)', () => {
  it('if you keep running he gives the ball back at once; standing he waits returnDelay', () => {
    const t = tuningWith(() => {});
    const quick = holdSeconds(t, true);
    const slow = holdSeconds(t, false);
    expect(quick).toBeLessThan(TUNING.mates.quickReturnDelay + 0.15);
    expect(slow).toBeGreaterThan(TUNING.mates.returnDelay - 0.05);
    expect(slow).toBeLessThan(TUNING.mates.returnDelay + 0.15);
  });

  it('switched off, he waits returnDelay even if you run on', () => {
    const t = tuningWith((x) => {
      x.mates.quickReturn = 0;
    });
    expect(holdSeconds(t, true)).toBeGreaterThan(TUNING.mates.returnDelay - 0.05);
  });

  it('the minimum speed and the delay come from the tuning', () => {
    const fast = tuningWith((x) => {
      x.mates.quickReturnSpeed = 20; // you never run that fast: no quick return
    });
    expect(holdSeconds(fast, true)).toBeGreaterThan(TUNING.mates.returnDelay - 0.05);
    const slower = tuningWith((x) => {
      x.mates.quickReturnDelay = 0.3;
    });
    const h = holdSeconds(slower, true);
    expect(h).toBeGreaterThan(0.25);
    expect(h).toBeLessThan(0.5);
  });

  it('is deterministic', () => {
    const t = tuningWith(() => {});
    expect(holdSeconds(t, true, 9)).toBe(holdSeconds(t, true, 9));
  });
});
