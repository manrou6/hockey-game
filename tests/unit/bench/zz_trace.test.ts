import { it } from 'vitest';
import { BASE_TUNING, runVolley, traceVolley } from './volleyBench';
it('trace', () => {
  const t = BASE_TUNING();
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const c = { pass: 'drive' as const, passDist: 12, dist: 7, angle: 0, timing: 0.07, aimLead: 0, gesture: 'tap' as const, followCue: true };
    console.log(traceVolley(t, 'medium', c, seed).join('\n'));
    console.log('----');
  }
  void runVolley;
});
