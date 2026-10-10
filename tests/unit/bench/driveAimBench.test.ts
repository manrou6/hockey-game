import { describe, it } from 'vitest';
import type { Tuning } from '../../../src/config/tuning';
import type { AssistLevel } from '../../../src/sim/pass';
import { BASE, DISTS, f2, fmt, pooled, runDrive, THUMB, type DriveStats } from './driveAimBench';

// Aim of the driven lofted pass ("alt fort", a tap) to a teammate 8-16 m away: the scenario, the
// human and what is measured are described in driveAimBench.ts (runDrive).
// Benchmarks (not assertions): PATINS_BENCH=1 npx vitest run tests/unit/bench/driveAimBench
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const run = env.PATINS_BENCH ? describe : describe.skip;

run('driven pass aim bench (alt fort, tap, 8-16 m)', () => {
  it('driven pass (tap): miss at the blade and has / clean, by assist level, passer and receiver state, distance', { timeout: 3600000 }, () => {
    const t = BASE();
    for (const passer of ['still', 'sprint'] as const) {
      for (const receiver of ['still', 'run'] as const) {
        for (const level of ['light', 'medium', 'strong'] as const) {
          const { all, per } = pooled(t, level, passer, receiver);
          for (let i = 0; i < DISTS.length; i++) console.log(`DRIVE ${passer.padEnd(6)} -> ${receiver.padEnd(5)} ${level.padEnd(6)} ${String(DISTS[i]).padStart(2)} m | ${fmt(per[i]!)}`);
          console.log(`DRIVE ${passer.padEnd(6)} -> ${receiver.padEnd(5)} ${level.padEnd(6)} 8-16 | ${fmt(all)}`);
        }
      }
    }
  });

  it('error budget (medium, 12 and 16 m, standing and at a sprint): which error term dominates', { timeout: 3600000 }, () => {
    const variants: [string, (t: Tuning) => void, number][] = [
      ['factory', () => {}, THUMB],
      ['no thumb error', () => {}, 0],
      ['errorSprint 0', (t) => (t.pass.errorSprint = 0), THUMB],
      ['drive error ×1', (t) => (t.pass.driveErrorFactor = 1), THUMB],
      ['drive error ×1.5', (t) => (t.pass.driveErrorFactor = 1.5), THUMB],
      ['errorBase 0', (t) => (t.pass.errorBase = 0), THUMB],
      ['no pass error', (t) => (t.pass.errorBase = t.pass.errorSprint = 0), THUMB],
      ['errorPower 0', (t) => (t.pass.errorPower = 0), THUMB],
      ['all errors 0', (t) => (t.pass.errorBase = t.pass.errorSprint = t.pass.errorPower = 0), 0],
      ['thumb ±0.25', () => {}, 0.25],
    ];
    for (const passer of ['still', 'sprint'] as const) {
      for (const receiver of ['still', 'run'] as const) {
        for (const dist of [12, 16]) {
          for (const [name, mod, thumb] of variants) {
            const t = BASE();
            mod(t);
            console.log(`BUDGET ${passer.padEnd(6)} -> ${receiver.padEnd(5)} ${dist} m ${name.padEnd(15)} | ${fmt(runDrive(t, { level: 'medium', passer, receiver, dist, thumb }))}`);
          }
        }
      }
    }
  });

  it('aiming freedom: aiming ahead of a runner still sends the driven pass ahead (medium / light)', { timeout: 3600000 }, () => {
    const t = BASE();
    for (const level of ['light', 'medium', 'strong'] as const) {
      for (const ahead of [0, 0.35, 0.5]) {
        for (const passer of ['still', 'sprint'] as const) {
          const s = runDrive(t, { level, passer, receiver: 'run', dist: 12, aimAhead: ahead });
          console.log(`FREEDOM ${level.padEnd(6)} aim ${((ahead * 180) / Math.PI).toFixed(0).padStart(2)}° ahead ${passer.padEnd(6)} | launched ${s.aheadDeg.toFixed(1)}° ahead of him | ${fmt(s)}`);
        }
      }
    }
  });

  it('wide angle (54-80° off the skating direction): at a sprint the stick turned to aim is a trencada', { timeout: 3600000 }, () => {
    const t = BASE();
    for (const passer of ['still', 'sprint'] as const) {
      for (const level of ['medium', 'strong'] as const) {
        for (const dist of [8, 10, 12]) {
          const s = runDrive(t, { level, passer, receiver: 'still', dist, bearing: [0.95, 1.4] });
          console.log(`WIDE ${passer.padEnd(6)} ${level.padEnd(6)} ${String(dist).padStart(2)} m | ${fmt(s)}`);
        }
      }
    }
  });

  it('how much Forta helps over Mitjana: thumb ±0.12 / ±0.25 and a sloppier aim (10°, 20°, 30° off), 8-16 m pooled', { timeout: 3600000 }, () => {
    const t = BASE();
    for (const passer of ['still', 'sprint'] as const) {
      for (const receiver of ['still', 'run'] as const) {
        for (const [name, thumb, bias] of [['±0.12', THUMB, 0], ['±0.25', 0.25, 0], ['10° off', THUMB, 0.1745], ['20° off', THUMB, 0.349], ['30° off', THUMB, 0.5236]] as const) {
          for (const level of ['medium', 'strong'] as const) {
            const per = DISTS.map((dist) => runDrive(t, { level, passer, receiver, dist, thumb, aimBias: bias }));
            const nn = per.reduce((a, s) => a + s.n, 0);
            const avg = (k: keyof DriveStats): number => per.reduce((a, s) => a + (s[k] as number) * s.n, 0) / Math.max(1, nn);
            console.log(`FORTA ${passer.padEnd(6)} -> ${receiver.padEnd(5)} ${name.padEnd(7)} ${level.padEnd(6)} | has ${avg('has').toFixed(0)}% clean ${avg('clean').toFixed(0)}% | miss ${f2(avg('missMean'))} p90 ${f2(avg('missP90'))} lat ${f2(avg('latMean'))} p90 ${f2(avg('latP90'))} | launch ${f2(avg('launchMean'))} p90 ${f2(avg('launchP90'))} (n ${nn})`);
          }
        }
      }
    }
  });

  it('sweep (v0.1.29): driven-only error factor x Mitjana driven correction, vs Forta, 8-16 m pooled', { timeout: 3600000 }, () => {
    const configs: [string, AssistLevel, number, number][] = [];
    for (const ef of [1.5, 1.25, 1]) {
      configs.push([`Forta  ef ${ef.toFixed(2)}`, 'strong', ef, 1]);
      for (const corr of [0.85, 0.95, 1]) configs.push([`Mitjana ef ${ef.toFixed(2)} corr ${corr.toFixed(2)}`, 'medium', ef, corr]);
    }
    for (const [name, level, ef, corr] of configs) {
      const t = BASE();
      t.pass.driveErrorFactor = ef;
      t.pass.driveMediumCorrection = corr;
      const cols: string[] = [];
      for (const [aim, bias] of [['±0.12', 0], ['20° off', 0.349]] as const) {
        for (const passer of ['still', 'sprint'] as const) {
          for (const receiver of ['still', 'run'] as const) {
            const per = DISTS.map((dist) => runDrive(t, { level, passer, receiver, dist, aimBias: bias }));
            const nn = per.reduce((a, s) => a + s.n, 0);
            const avg = (k: keyof DriveStats): number => per.reduce((a, s) => a + (s[k] as number) * s.n, 0) / Math.max(1, nn);
            cols.push(`${aim} ${passer}->${receiver} ${avg('has').toFixed(0)}/${avg('clean').toFixed(0)} L ${f2(avg('launchMean'))}/${f2(avg('launchP90'))} M ${f2(avg('missMean'))}`);
          }
        }
      }
      console.log(`SWEEP ${name.padEnd(26)} | ${cols.join(' | ')}`);
    }
  });
});
