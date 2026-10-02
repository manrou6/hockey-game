import { describe, expect, it } from 'vitest';
import { goalLineX, RINK } from '../../src/config/rink';
import { TUNING } from '../../src/config/tuning';
import { createBall, stepBall, type BallEvent, type BallState } from '../../src/sim/ball';
import { createPlayer, type PlayerState } from '../../src/sim/player';
import { boardSignedDistance } from '../../src/sim/rink';
import { createRng, nextFloat } from '../../src/sim/rng';

const DT = 1 / TUNING.sim.tickRate;
const R = RINK.ballRadius;
const GX = goalLineX(1); // right goal line x (17.2)

function sim(b: BallState, seconds: number, players: PlayerState[] = [], seed = 1): BallEvent[] {
  const rng = createRng(seed);
  const all: BallEvent[] = [];
  const events: BallEvent[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    events.length = 0;
    stepBall(b, players, TUNING, rng, DT, events);
    all.push(...events);
    if (b.out) break;
  }
  return all;
}

function ball(x: number, y: number, vx: number, vy: number, z = R, vz = 0): BallState {
  const b = createBall(x, y);
  Object.assign(b, { z, vx, vy, vz, prevZ: z });
  return b;
}

const hspeed = (b: BallState): number => Math.hypot(b.vx, b.vy);

describe('ball: floor', () => {
  it('a dropped ball bounces lower each time and ends up resting on the floor', () => {
    const b = ball(0, 0, 0, 0, 1.5);
    const events = sim(b, 4);
    const bounces = events.filter((e) => e.type === 'floor').map((e) => e.strength);
    expect(bounces.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < bounces.length; i++) expect(bounces[i]!).toBeLessThan(bounces[i - 1]!);
    expect(b.z).toBeCloseTo(R, 6);
    expect(b.vz).toBe(0);
  });

  it('rolls and slows down gradually (no sudden stop)', () => {
    const b = ball(-10, 5, 10, 0);
    sim(b, 1);
    expect(hspeed(b)).toBeGreaterThan(7.5);
    expect(hspeed(b)).toBeLessThan(9.6);
    const c = ball(-15, 5, 3, 0);
    sim(c, 20);
    expect(hspeed(c)).toBe(0);
  });

  it('air drag slows a fast airborne ball more than a slow one', () => {
    const fast = ball(-15, 0, 30, 0, 0.5, 2);
    const slow = ball(-15, 0, 10, 0, 0.5, 2);
    sim(fast, 0.1);
    sim(slow, 0.1);
    expect(30 - hspeed(fast)).toBeGreaterThan(10 - hspeed(slow));
  });
});

describe('ball: boards', () => {
  it('bounces off the side board losing ~30% of the normal speed', () => {
    const b = ball(0, 8, 0, 10);
    const events = sim(b, 0.5);
    const hit = events.find((e) => e.type === 'board');
    expect(hit).toBeDefined();
    expect(b.vy).toBeLessThan(0);
    // ~0.7 restitution on ~9.8 m/s normal speed (+ a little rolling loss afterwards).
    expect(Math.abs(b.vy)).toBeGreaterThan(5.5);
    expect(Math.abs(b.vy)).toBeLessThan(7.2);
  });

  it('deflection is random but deterministic (same seed = same bounce)', () => {
    const a = ball(0, 8, 0, 10);
    const c = ball(0, 8, 0, 10);
    sim(a, 0.5, [], 3);
    sim(c, 0.5, [], 3);
    expect(a.vx).toBe(c.vx);
    const d = ball(0, 8, 0, 10);
    sim(d, 0.5, [], 4);
    expect(d.vx).not.toBe(a.vx);
  });

  it('a 30 m/s ground ball in any direction never leaves the rink', () => {
    const rng = createRng(77);
    const n = { nx: 0, ny: 0 };
    for (let shot = 0; shot < 60; shot++) {
      const a = nextFloat(rng) * Math.PI * 2;
      const b = ball((nextFloat(rng) - 0.5) * 30, (nextFloat(rng) - 0.5) * 14, Math.cos(a) * 30, Math.sin(a) * 30);
      const r2 = createRng(shot);
      const events: BallEvent[] = [];
      for (let i = 0; i < 180; i++) {
        stepBall(b, [], TUNING, r2, DT, events);
        expect(b.out).toBe(false);
        if (b.inGoal === 0) expect(boardSignedDistance(b.x, b.y, n)).toBeLessThanOrEqual(-R + 1e-6);
      }
    }
  });

  it('a high lob over the boards goes out', () => {
    const b = ball(0, 6, 0, 6, 1.5, 6);
    const events = sim(b, 3);
    expect(b.out).toBe(true);
    expect(events.some((e) => e.type === 'out')).toBe(true);
  });
});

describe('ball: goal', () => {
  it('a shot into the mouth is a goal and the net keeps the ball', () => {
    const b = ball(GX - 6, 0.2, 20, 0);
    const events = sim(b, 2);
    const goals = events.filter((e) => e.type === 'goal');
    expect(goals).toHaveLength(1);
    expect(goals[0]!.side).toBe(1);
    expect(b.scored).toBe(true);
    expect(b.inGoal).toBe(1);
    expect(b.x).toBeGreaterThan(GX + R);
    expect(b.x).toBeLessThan(GX + RINK.goalDepthBottom);
    expect(hspeed(b)).toBeLessThan(0.5); // the net soaked it up
  });

  it('a 30 m/s shot at the post bounces back and never passes through', () => {
    const postY = RINK.goalWidth / 2 + RINK.goalPostDiameter / 2;
    const b = ball(GX - 6, postY, 30, 0, 0.3);
    const events = sim(b, 0.5);
    expect(events.some((e) => e.type === 'post')).toBe(true);
    expect(events.some((e) => e.type === 'goal')).toBe(false);
    expect(b.vx).toBeLessThan(0);
  });

  it('hits the crossbar', () => {
    const barZ = RINK.goalHeight + RINK.goalPostDiameter / 2;
    // Close enough that gravity doesn't pull it under the bar on the way.
    const b = ball(GX - 0.6, 0, 25, 0, barZ, 0);
    const events = sim(b, 0.3);
    expect(events.some((e) => e.type === 'post')).toBe(true);
    expect(b.scored).toBe(false);
  });

  it('a shot at the goal from behind hits the net, not a goal', () => {
    const b = ball(19.5, 0, -12, 0);
    const events = sim(b, 1);
    expect(events.some((e) => e.type === 'net')).toBe(true);
    expect(events.some((e) => e.type === 'goal')).toBe(false);
    expect(b.vx).toBeGreaterThan(0);
  });

  it('a shot wide of the post does not score', () => {
    const b = ball(GX - 6, 1.6, 20, 0);
    const events = sim(b, 1);
    expect(events.some((e) => e.type === 'goal')).toBe(false);
  });
});

describe('ball: players', () => {
  it('bounces off a standing player', () => {
    const p = createPlayer(0, 0, 0, 0);
    const b = ball(-3, 0, 8, 0);
    const events = sim(b, 1, [p]);
    expect(events.some((e) => e.type === 'player')).toBe(true);
    expect(b.vx).toBeLessThan(0);
    expect(Math.hypot(b.x - p.x, b.y - p.y)).toBeGreaterThanOrEqual(TUNING.skating.radius + R - 1e-6);
  });

  it('a skating player pushes the ball ahead', () => {
    const p = createPlayer(0, 0, 0, 0);
    p.vx = 6;
    const b = ball(TUNING.skating.radius + R - 0.01, 0, 0, 0); // touching the player's body
    sim(b, 1 / 60, [p]);
    expect(b.vx).toBeGreaterThan(6);
  });
});
