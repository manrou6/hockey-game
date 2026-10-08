import { describe, it } from 'vitest';
import {
  asV0120,
  asV0122,
  BASE_TUNING,
  FIRST_TOUCH,
  fmt,
  fmtDiag,
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

  it('P7 diagnosis: why can the pass not go as far ahead as aimed (v0.1.22 numbers)', { timeout: 900000 }, () => {
    const t = BASE_TUNING();
    for (const lead of [1, 1.2, 1.4, 1.8]) {
      for (const receive of ['chase', 'release'] as const) {
        const st = runSpace(t, 'medium', { lead, receive });
        console.log(`DIAG medium lead ${lead.toFixed(1)} ${receive.padEnd(7)} ${fmtDiag(st)} | has ${st.has.toFixed(0)}% zone ${st.zone.toFixed(0)}% t ${st.timeMean.toFixed(2)}`);
      }
    }
  });

  it('P7 v0.1.23 grid: respect x max time x dead zone (cone 1.0 rad)', { timeout: 3600000 }, () => {
    const level = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.PATINS_LEVEL ?? 'medium';
    for (const dz of [0.35, 0.2]) {
      for (const respect of [0.5, 0.75, 1]) {
        for (const maxTime of [1, 1.25, 1.5]) {
          const t = BASE_TUNING();
          t.assist.lightSpaceRespect = t.assist.mediumSpaceRespect = respect;
          t.assist.spaceMaxTime = maxTime;
          t.assist.spaceCone = 1;
          t.assist.spaceDeadzone = dz;
          const cols: string[] = [];
          for (const lead of [1, 1.4, 1.8]) {
            const ch = runSpace(t, level, { lead, receive: 'chase' });
            const rel = runSpace(t, level, { lead, receive: 'release' });
            cols.push(`L${lead.toFixed(1)}: chase ${ch.has.toFixed(0)}% ${ch.timeMean.toFixed(1)}s rel ${rel.has.toFixed(0)}% ahead ${ch.aheadSec.toFixed(2)}s (${ch.early >= 0 ? '+' : ''}${ch.early.toFixed(2)})`);
          }
          console.log(`GRID2 ${level} dz ${dz} respect ${respect.toFixed(2)} maxT ${maxTime.toFixed(2)} || ${cols.join(' || ')}`);
        }
      }
    }
  });

  it('P7 v0.1.23 baseline for the grid (respect 0): seconds ahead', { timeout: 600000 }, () => {
    for (const level of ['light', 'medium']) {
      const t = BASE_TUNING();
      t.assist.spaceCone = 1;
      const cols: string[] = [];
      for (const lead of [1, 1.4, 1.8]) {
        const ch = runSpace(t, level, { lead, receive: 'chase' });
        const rel = runSpace(t, level, { lead, receive: 'release' });
        cols.push(`L${lead.toFixed(1)}: chase ${ch.has.toFixed(0)}% ${ch.timeMean.toFixed(1)}s rel ${rel.has.toFixed(0)}% ahead ${ch.aheadSec.toFixed(2)}s (${ch.early >= 0 ? '+' : ''}${ch.early.toFixed(2)})`);
      }
      console.log(`GRID2 ${level} respect 0 || ${cols.join(' || ')}`);
    }
  });

  it('P7 v0.1.23: v0.1.22 numbers vs now (300 passes per case)', { timeout: 3600000 }, () => {
    for (const level of ['medium', 'light', 'strong']) {
      for (const lead of [1, 1.2, 1.4, 1.8]) {
        for (const receive of ['chase', 'release'] as const) {
          for (const [name, t] of [['v0.1.22', asV0122(BASE_TUNING())], ['v0.1.23', BASE_TUNING()]] as const) {
            const st = runSpace(t, level, { lead, receive }, 0.12, 300);
            console.log(`FINAL ${level.padEnd(6)} lead ${lead.toFixed(1)} ${receive.padEnd(7)} ${name} ${fmtDiag(st)} | has ${st.has.toFixed(0)}% zone ${st.zone.toFixed(0)}% t ${st.timeMean.toFixed(2)} ahead ${st.aheadSec.toFixed(2)}s`);
          }
        }
      }
    }
  });

  it('P7 v0.1.23: slower arrival for passes into space (medium, respect 0.75, maxT 1.25, cone 0.9)', { timeout: 3600000 }, () => {
    for (const [arr, min] of [[12, 12], [10, 8], [8, 6], [6, 5]] as const) {
      const t = BASE_TUNING();
      t.assist.spaceArrivalSpeed = arr;
      t.assist.spaceLaunchMin = min;
      const cols: string[] = [];
      for (const lead of [1, 1.4, 1.8]) {
        const ch = runSpace(t, 'medium', { lead, receive: 'chase' });
        const rel = runSpace(t, 'medium', { lead, receive: 'release' });
        cols.push(`L${lead.toFixed(1)}: chase ${ch.has.toFixed(0)}% ${ch.timeMean.toFixed(1)}s | rel ${rel.has.toFixed(0)}% clean ${rel.clean.toFixed(0)}% | ahead ${ch.aheadSec.toFixed(2)}s (${ch.early >= 0 ? '+' : ''}${ch.early.toFixed(2)}) launch ${ch.launch.toFixed(1)}`);
      }
      console.log(`ARR arrival ${arr} launchMin ${min} || ${cols.join(' || ')}`);
    }
  });

  it('P7 v0.1.23: freedom grid with slower arrival (medium)', { timeout: 3600000 }, () => {
    for (const arr of [8, 6]) {
      for (const respect of [0.75, 1]) {
        for (const maxTime of [1.25, 1.75, 2.5]) {
          const t = BASE_TUNING();
          t.assist.spaceArrivalSpeed = arr;
          t.assist.spaceLaunchMin = arr - 1.5;
          t.assist.mediumSpaceRespect = respect;
          t.assist.spaceMaxTime = maxTime;
          const cols: string[] = [];
          for (const lead of [1, 1.4, 1.8]) {
            const ch = runSpace(t, 'medium', { lead, receive: 'chase' });
            const rel = runSpace(t, 'medium', { lead, receive: 'release' });
            cols.push(`L${lead.toFixed(1)}: chase ${ch.has.toFixed(0)}% ${ch.timeMean.toFixed(1)}s rel ${rel.has.toFixed(0)}% ahead ${ch.aheadSec.toFixed(2)}s (${ch.early >= 0 ? '+' : ''}${ch.early.toFixed(2)})`);
          }
          console.log(`FREE arrival ${arr} respect ${respect.toFixed(2)} maxT ${maxTime.toFixed(2)} || ${cols.join(' || ')}`);
        }
      }
    }
  });

  it('v0.1.24: power of a pass into space (tap / half / full charge), v0.1.23 vs now, medium', { timeout: 3600000 }, () => {
    const before = BASE_TUNING();
    before.assist.spaceChargedArrivalSpeed = 30;
    before.assist.spaceArrivalSpeed = 6;
    const now = BASE_TUNING();
    for (const [tname, t] of [['v0.1.23', before], ['v0.1.24', now]] as const) {
      for (const [name, hold] of [['tap', 0.1], ['half', 0.5], ['full', 0.85]] as const) {
        for (const lead of [1, 1.2, 1.4]) {
          for (const receive of ['chase', 'release'] as const) {
            const st = runSpace(t, 'medium', { lead, receive, hold, aimMag: 0.2 }, 0.12, 300);
            console.log(`POWER ${tname} ${name.padEnd(4)} lead ${lead.toFixed(1)} ${receive.padEnd(7)} launch ${st.launch.toFixed(1)} arrival ${st.arrival.toFixed(1)} m/s | has ${st.has.toFixed(0)}% clean ${st.clean.toFixed(0)}% t ${st.timeMean.toFixed(2)}s p90 ${st.timeP90.toFixed(2)}s | ahead ${st.aheadSec.toFixed(2)}s (${st.early >= 0 ? '+' : ''}${st.early.toFixed(2)})`);
          }
        }
      }
    }
  });

  it('v0.1.24: sweep of the space-pass power (tap arrival x full-charge arrival), medium', { timeout: 3600000 }, () => {
    for (const tapArr of [6, 7, 8]) {
      for (const fullArr of [12, 13, 14]) {
        const t = BASE_TUNING();
        t.assist.spaceArrivalSpeed = tapArr;
        t.assist.spaceChargedArrivalSpeed = fullArr;
        const cols: string[] = [];
        for (const [name, hold] of [['tap', 0.1], ['half', 0.5], ['full', 0.85]] as const) {
          const parts: string[] = [];
          for (const lead of [1, 1.4]) {
            const ch = runSpace(t, 'medium', { lead, receive: 'chase', hold, aimMag: 0.2 }, 0.12, 150);
            const rel = runSpace(t, 'medium', { lead, receive: 'release', hold, aimMag: 0.2 }, 0.12, 150);
            parts.push(`L${lead.toFixed(1)} arr ${rel.arrival.toFixed(1)} ch ${ch.has.toFixed(0)}% ${ch.timeMean.toFixed(1)}s rel ${rel.has.toFixed(0)}%`);
          }
          cols.push(`${name}: ${parts.join(', ')}`);
        }
        if (tapArr !== 6 && fullArr !== 13) continue;
        console.log(`SWEEPPOW tap ${tapArr} full ${fullArr} || ${cols.join(' || ')}`);
      }
    }
  });
});

