/**
 * Seeded, deterministic randomness (mulberry32) so exercise generation and
 * tests are reproducible when a seed is provided.
 */

export type Rng = () => number;

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return function rng(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random integer in [min, max] inclusive. */
export function randomInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Fisher–Yates shuffle (pure: returns a new array). */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Pick `count` distinct items, preferring items weighted by `weight` (higher = more likely). */
export function pickWeighted<T>(items: readonly T[], weight: (item: T) => number, count: number, rng: Rng): T[] {
  const pool = items.slice();
  const out: T[] = [];
  while (out.length < count && pool.length > 0) {
    const total = pool.reduce((s, it) => s + Math.max(0.001, weight(it)), 0);
    let r = rng() * total;
    let idx = 0;
    for (let i = 0; i < pool.length; i++) {
      r -= Math.max(0.001, weight(pool[i]));
      if (r <= 0) {
        idx = i;
        break;
      }
    }
    out.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return out;
}

/** Sample of `count` items (uniform, without replacement). */
export function sample<T>(items: readonly T[], count: number, rng: Rng): T[] {
  return shuffle(items, rng).slice(0, count);
}
