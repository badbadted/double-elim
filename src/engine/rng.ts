/**
 * Tiny seedable PRNG (mulberry32) + Fisher-Yates shuffle.
 *
 * A seed makes draws reproducible, which is what the unit tests rely on.
 * Passing no seed falls back to Math.random for real, non-deterministic draws.
 */
export type RandomFn = () => number;

/** Deterministic PRNG in [0, 1). */
export function mulberry32(seed: number): RandomFn {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Return a new shuffled copy of `arr` (does not mutate input). */
export function shuffle<T>(arr: readonly T[], rand: RandomFn = Math.random): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
