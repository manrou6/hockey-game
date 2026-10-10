import { describe, expect, it } from 'vitest';
import { RINK } from '../../src/config/rink';
import { TUNING } from '../../src/config/tuning';
import { emptyCommand } from '../../src/sim/commands';
import { bladePoint } from '../../src/sim/dribble';
import { boardSignedDistance } from '../../src/sim/rink';
import { createWorld, stepWorld } from '../../src/sim/world';
import {
  reproDrivenPass,
  reproOutRespawnInGoal,
  reproScratchLeak,
  reproSwitchDuringHold,
} from './bench/stressBench';

// v0.1.30: the real, clear bugs found by the robustness audit (docs/audit/B.md §B, findings F1-F4
// and F6), fixed without changing the feel. The set-ups are the bench's B6 reproductions.

describe('robustness fixes (v0.1.30)', () => {
  it('F1: CANVI while the stick carries a remate en el aire: the ball drops where it is (no jump to the new player)', () => {
    const r = reproSwitchDuringHold();
    expect(r.to).not.toBe(r.from);
    expect(r.jump).toBeLessThan(0.4);
  });

  it('F6: a long driven pass (beyond pass.driveAirEnd) with the stick aimed at the goal while it flies is still met', () => {
    for (const dist of [18, 20]) {
      const r = reproDrivenPass(dist, 'goal');
      expect(r.passAir).toBe(0);
      expect(r.touched).toBe(true);
    }
    // As before: shorter, or with the stick released.
    expect(reproDrivenPass(14, 'goal').touched).toBe(true);
    expect(reproDrivenPass(20, 'released').touched).toBe(true);
  });

  it('F3: an out ball is put back out of the goal cages and stays still', () => {
    const r = reproOutRespawnInGoal();
    expect(r.insideCage).toBe(false);
    expect(r.nextJump).toBeLessThan(0.05);
  });

  it('F2: a remate en el aire carried on the stick into the boards stops there: never through them', () => {
    for (const h of [0.3, 1.2]) {
      const t = structuredClone(TUNING);
      const w = createWorld(3, 2);
      const p = w.players[0]!;
      // Skating at the side board, the ball on his stick 0.2 m inside it (TIRO held: a late release).
      p.heading = p.prevHeading = Math.PI / 2;
      p.vx = 0;
      p.vy = 3;
      const reach = bladePoint(p, t).y - p.y;
      p.y = p.prevY = RINK.width / 2 - 0.2 - RINK.ballRadius - reach;
      const blade = bladePoint(p, t);
      const b = w.ball;
      b.owner = -1;
      b.x = b.prevX = blade.x;
      b.y = b.prevY = blade.y;
      b.z = b.prevZ = RINK.ballRadius + h;
      b.vx = b.vy = b.vz = 0;
      const v = w.volley;
      v.found = v.incoming = v.open = true;
      v.contactTick = w.tick;
      v.hold = Math.round((t.volley.windowTime / 2) * t.sim.tickRate);
      v.holdHeight = h;
      v.inVx = 8;
      p.shotHold = 0.3;
      p.shotWithBall = false;
      const held = { ...emptyCommand(), moveY: 1, shootHeld: true };
      const n = { nx: 0, ny: 0 };
      let beyond = Number.NEGATIVE_INFINITY;
      let out = false;
      for (let i = 0; i < 40; i++) {
        stepWorld(w, [held], t);
        beyond = Math.max(beyond, boardSignedDistance(b.x, b.y, n));
        if (w.events.some((e) => e.type === 'out')) out = true;
      }
      expect(beyond).toBeLessThan(0);
      // Below the board top the ball can't leave; above it, his body may still knock it over the
      // board once it has dropped off the stick (ball physics, not the carry).
      if (h < RINK.boardHeight) expect(out).toBe(false);
    }
  });

  it("F4: a world's volley view is not touched by another world's (no shared scratch leaking into it)", () => {
    const r = reproScratchLeak();
    expect(r.afterOther).toBe(r.quiet);
  });
});
