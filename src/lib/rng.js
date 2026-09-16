/**
 * Mulberry32: a tiny seeded PRNG. Same seed, same sequence, on client and
 * server, which is what lets everyone fly the same daily challenge course.
 */
export function createRng(seed) {
  let t = seed | 0
  return function rand() {
    t = (t + 0x6d2b79f5) | 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}
