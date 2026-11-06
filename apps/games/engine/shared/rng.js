/** Seeded mulberry32 PRNG. */
export function createRng(seed = 1) {
  let s = (seed >>> 0) || 1;
  const next = () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, range: (a, b) => a + next() * (b - a), int: (a, b) => Math.floor(a + next() * (b - a + 1)) };
}
