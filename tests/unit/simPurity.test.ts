import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// CLAUDE.md rule 3: src/sim never imports render/DOM/audio and stays deterministic.
const SIM_DIR = fileURLToPath(new URL('../../src/sim', import.meta.url));

function listTs(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return listTs(full);
    return name.endsWith('.ts') ? [full] : [];
  });
}

const FORBIDDEN: [RegExp, string][] = [
  [/from\s+['"]@babylonjs/, 'Babylon import'],
  [/from\s+['"][./]*\.\.\/(render|ui|input|audio|game|net)\//, 'non-sim module import'],
  [/Math\.random/, 'Math.random'],
  [/Date\.now|new Date\(/, 'wall-clock time'],
  [/performance\.now/, 'wall-clock time'],
  [/\b(window|document|navigator|localStorage)\b/, 'DOM/browser global'],
];

describe('src/sim purity', () => {
  const files = listTs(SIM_DIR);
  it('has files to check', () => expect(files.length).toBeGreaterThan(0));
  it.each(files.map((f) => [f.slice(f.indexOf('src/sim')), f]))('%s is pure', (_rel, file) => {
    const code = readFileSync(file, 'utf-8');
    for (const [re, what] of FORBIDDEN) expect(re.test(code), `${what} in ${file}`).toBe(false);
  });
});

describe('player feel layer (F2 attributes)', () => {
  it('movement and passing code read skating/cut/dribble/pass/receive numbers only through src/sim/feel.ts', () => {
    for (const f of listTs(SIM_DIR)) {
      if (f.endsWith('feel.ts')) continue;
      const code = readFileSync(f, 'utf-8');
      expect(/tuning\.(skating|cut|dribble|pass|receive)\b/.test(code), f).toBe(false);
    }
  });
});
