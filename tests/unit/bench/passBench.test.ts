import { describe, it } from 'vitest';
import {
  asV0120,
  BASE_TUNING,
  FIRST_TOUCH,
  fmt,
  fmtSpace,
  IDEAL,
  measureTurn,
  REACTIVE,
  runMany,
  runSpace,
  runSingles,
} from './passBench';

// Benchmarks (not assertions): PATINS_BENCH=1 npx vitest run tests/unit/bench
const run = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.PATINS_BENCH ? describe : describe.skip;

run('passing bench', () => {
  it('chains of 5 passes among the 3 players (300 seeds): v0.1.20 numbers vs now', { timeout: 900000 }, () => {
    for (const [name, t, levels] of [
      ['v0.1.20', asV0120(BASE_TUNING()), ['light', 'strong']],
      ['v0.1.21', BASE_TUNING(), ['light', 'medium', 'strong']],
    ] as const) {
      for (const level of levels) {
        console.log(`CHAIN ${name} ${level.padEnd(6)} ideal      ${fmt(runMany(t, level, IDEAL, 300))}`);
        console.log(`CHAIN ${name} ${level.padEnd(6)} reactive   ${fmt(runMany(t, level, REACTIVE, 300))}`);
        console.log(`CHAIN ${name} ${level.padEnd(6)} firstTouch ${fmt(runMany(t, level, FIRST_TOUCH, 300))}`);
      }
    }
  });

  it('single passes (150 per case, receiver moving, aiming error ±0.12 rad): has it / clean control', { timeout: 900000 }, () => {
    for (const [name, t, levels] of [
      ['v0.1.20', asV0120(BASE_TUNING()), ['light']],
      ['v0.1.21', BASE_TUNING(), ['light', 'medium', 'strong']],
    ] as const) {
      for (const level of levels) {
        for (const [kind, h] of [['ground', 0], ['driven', 1], ['lob', 2]] as const) {
          const f = (lo: number, hi: number): string => {
            const s = runSingles(t, level, h, lo, hi, 0.12);
            return `${s.has.toFixed(0)}/${s.clean.toFixed(0)}`;
          };
          console.log(`SINGLE ${name} ${level.padEnd(6)} ${kind.padEnd(6)} short(5-12) ${f(5, 12)} | medium(13-22) ${f(13, 22)} | long(23-35) ${f(23, 35)}`);
        }
      }
    }
  });

  it('changing direction 90° at full speed: flick (trencada) vs a gradual turn', { timeout: 120000 }, () => {
    const t = BASE_TUNING();
    const fmtCut = (name: string, c: ReturnType<typeof measureTurn>): string => `TURN ${name.padEnd(28)} cut ${c.cut} | turned ${c.turned.toFixed(2)}s | back to 90% speed ${c.recovered.toFixed(2)}s over ${c.distance.toFixed(1)}m`;
    console.log(fmtCut('flick (trencada), prepTime 0.3', measureTurn(t, 0)));
    const t2 = BASE_TUNING();
    t2.cut.prepTime = 0.15;
    console.log(fmtCut('flick, prepTime 0.15 (proposal)', measureTurn(t2, 0)));
    console.log(fmtCut('gradual turn over 0.6 s', measureTurn(t, 0.6)));
    console.log(fmtCut('gradual turn over 0.3 s', measureTurn(t, 0.3)));
  });

  it('pass into space (P7): a running teammate, the human aims ahead; before (v0.1.21) vs now', { timeout: 900000 }, () => {
    const before = BASE_TUNING();
    before.assist.lightSpaceRespect = before.assist.mediumSpaceRespect = before.assist.strongSpaceRespect = 0;
    before.assist.spaceCone = 0;
    const after = BASE_TUNING();
    for (const level of ['light', 'medium', 'strong']) {
      for (const lead of [0.6, 0.8, 1, 1.2, 1.4]) {
        for (const receive of ['chase', 'release'] as const) {
          console.log(`SPACE ${level.padEnd(6)} lead ${lead.toFixed(1)} ${receive.padEnd(7)} before: ${fmtSpace(runSpace(before, level, { lead, receive }))}`);
          console.log(`SPACE ${level.padEnd(6)} lead ${lead.toFixed(1)} ${receive.padEnd(7)} after : ${fmtSpace(runSpace(after, level, { lead, receive }))}`);
        }
      }
    }
  });

  it('P7 regression guard: chains (300 seeds) and single passes at the factory numbers', { timeout: 900000 }, () => {
    const t = BASE_TUNING();
    for (const level of ['light', 'medium', 'strong']) {
      console.log(`GUARD chain ${level.padEnd(6)} reactive   ${fmt(runMany(t, level, REACTIVE, 300))}`);
      console.log(`GUARD chain ${level.padEnd(6)} firstTouch ${fmt(runMany(t, level, FIRST_TOUCH, 300))}`);
    }
    for (const level of ['light', 'medium', 'strong']) {
      for (const [kind, h] of [['ground', 0], ['driven', 1], ['lob', 2]] as const) {
        const f = (lo: number, hi: number): string => {
          const r = runSingles(t, level, h, lo, hi, 0.12);
          return `${r.has.toFixed(0)}/${r.clean.toFixed(0)}`;
        };
        console.log(`GUARD single ${level.padEnd(6)} ${kind.padEnd(6)} short ${f(5, 12)} | medium ${f(13, 22)} | long ${f(23, 35)}`);
      }
    }
  });

  it('P7 sweep: dead zone of the aim ahead (medium assist)', { timeout: 900000 }, () => {
    const off = BASE_TUNING();
    off.assist.lightSpaceRespect = off.assist.mediumSpaceRespect = off.assist.strongSpaceRespect = 0;
    off.assist.spaceCone = 0;
    for (const [name, dz] of [['off', -1], ['dz 0.14', 0.14], ['dz 0.22', 0.22], ['dz 0.30', 0.3], ['dz 0.38', 0.38]] as const) {
      const t = dz < 0 ? off : BASE_TUNING();
      if (dz >= 0) t.assist.spaceDeadzone = dz;
      for (const lead of [0.6, 0.8, 1, 1.2, 1.4]) {
        const rel = runSpace(t, 'medium', { lead, receive: 'release' });
        const ch = runSpace(t, 'medium', { lead, receive: 'chase' });
        console.log(`SWEEP ${name.padEnd(8)} lead ${lead.toFixed(1)} | release zone ${rel.zone.toFixed(0)}% has ${rel.has.toFixed(0)}% clean ${rel.clean.toFixed(0)}% t ${rel.timeMean.toFixed(2)} | chase zone ${ch.zone.toFixed(0)}% has ${ch.has.toFixed(0)}% clean ${ch.clean.toFixed(0)}% t ${ch.timeMean.toFixed(2)} p90 ${ch.timeP90.toFixed(2)} | no-switch ${ch.noSwitch.toFixed(0)}%`);
      }
    }
  });

  it('P7 sweep: how much of the aim is respected (extended receiver choice on)', { timeout: 900000 }, () => {
    for (const level of ['light', 'medium'] as const) {
      for (const respect of [0, 0.5, 1]) {
        const t = BASE_TUNING();
        t.assist.lightSpaceRespect = t.assist.mediumSpaceRespect = respect;
        for (const lead of [0.8, 1, 1.2, 1.4]) {
          const rel = runSpace(t, level, { lead, receive: 'release' });
          const ch = runSpace(t, level, { lead, receive: 'chase' });
          console.log(`RESPECT ${level.padEnd(6)} respect ${respect.toFixed(1)} lead ${lead.toFixed(1)} | release zone ${rel.zone.toFixed(0)}% has ${rel.has.toFixed(0)}% clean ${rel.clean.toFixed(0)}% | chase zone ${ch.zone.toFixed(0)}% has ${ch.has.toFixed(0)}% t ${ch.timeMean.toFixed(2)} p90 ${ch.timeP90.toFixed(2)}`);
        }
      }
    }
  });

  it('P7 sweep: range of the extended receiver choice (respect 0)', { timeout: 900000 }, () => {
    for (const level of ['light', 'medium'] as const) {
      for (const cone of [0, 0.3, 0.5, 0.7]) {
        const t = BASE_TUNING();
        t.assist.lightSpaceRespect = t.assist.mediumSpaceRespect = 0;
        t.assist.spaceCone = cone;
        for (const [lead, speed] of [[1, 6.5], [1.4, 6.5], [1.8, 6.5], [1, 4], [1.4, 4]] as const) {
          const rel = runSpace(t, level, { lead, receive: 'release' }, 0.12, 150, speed);
          const ch = runSpace(t, level, { lead, receive: 'chase' }, 0.12, 150, speed);
          console.log(`CONE ${level.padEnd(6)} cone ${cone.toFixed(1)} lead ${lead.toFixed(1)} speed ${speed} | release zone ${rel.zone.toFixed(0)}% has ${rel.has.toFixed(0)}% clean ${rel.clean.toFixed(0)}% | chase zone ${ch.zone.toFixed(0)}% has ${ch.has.toFixed(0)}% t ${ch.timeMean.toFixed(2)} | no-switch ${ch.noSwitch.toFixed(0)}%`);
        }
      }
    }
  });
});
