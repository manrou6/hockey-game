/**
 * Deterministic seeded PRNG (sfc32). The whole state is 4 uint32 numbers so it can be
 * snapshotted for replays/online. The simulation must use this, never the global non-seeded random.
 */
export interface RngState {
  a: number;
  b: number;
  c: number;
  d: number;
}

export function createRng(seed: number): RngState {
  // Expand the seed with splitmix32 so nearby seeds give unrelated sequences.
  let s = seed >>> 0;
  const next = (): number => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
  const rng: RngState = { a: next(), b: next(), c: next(), d: next() };
  for (let i = 0; i < 12; i++) nextUint32(rng);
  return rng;
}

export function nextUint32(r: RngState): number {
  const t = (((r.a + r.b) >>> 0) + r.d) >>> 0;
  r.d = (r.d + 1) >>> 0;
  r.a = r.b ^ (r.b >>> 9);
  r.b = (r.c + (r.c << 3)) >>> 0;
  r.c = ((r.c << 21) | (r.c >>> 11)) >>> 0;
  r.c = (r.c + t) >>> 0;
  return t;
}

/** Uniform float in [0, 1). */
export function nextFloat(r: RngState): number {
  return nextUint32(r) / 4294967296;
}

/** Uniform float in [min, max). */
export function nextRange(r: RngState, min: number, max: number): number {
  return min + (max - min) * nextFloat(r);
}
