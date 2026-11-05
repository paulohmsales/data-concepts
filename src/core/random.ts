/**
 * Seeded PRNG (D10). Same seed → same sequence, so a simulation can be shared and re-checked.
 *
 * mulberry32: a tiny, fast 32-bit generator. Good enough for teaching simulations;
 * not for cryptography.
 */
export type Rng = () => number

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Standard normal draw (Box–Muller). */
export function normal(rng: Rng): number {
  let u = 0
  while (u === 0) u = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng())
}

/**
 * Number of successes in n Bernoulli(p) trials.
 *
 * Variance n·p·(1−p) ≤ 1,000: exact. Weigh each count k by P(k)/P(mode), using the ratio
 * P(k+1)/P(k) = (n−k)/(k+1) · p/(1−p), out to where the weight drops below 1e-17 (about ±9 SD),
 * then pick a k with one uniform draw over the total weight. A few hundred multiplications, no logs.
 *
 * Variance > 1,000 (SD > 31.6, skew < 0.03): the binomial is indistinguishable from a normal at
 * this resolution, so use that.
 */
export function binomial(n: number, p: number, rng: Rng): number {
  if (n <= 0 || p <= 0) return 0
  if (p >= 1) return n
  if (p > 0.5) return n - binomial(n, 1 - p, rng)

  const variance = n * p * (1 - p)
  if (variance > 1000) {
    const x = Math.round(n * p + Math.sqrt(variance) * normal(rng))
    return Math.min(n, Math.max(0, x))
  }

  const r = p / (1 - p)
  const mode = Math.floor((n + 1) * p)
  const EPS = 1e-17

  // Pass 1: total weight (mode has weight 1).
  let total = 1
  let w = 1
  for (let k = mode; k > 0; k--) {
    w *= k / ((n - k + 1) * r) // weight of k−1
    if (w < EPS) break
    total += w
  }
  w = 1
  for (let k = mode; k < n; k++) {
    w *= ((n - k) / (k + 1)) * r // weight of k+1
    if (w < EPS) break
    total += w
  }

  // Pass 2: walk the same weights in the same order until the draw is used up.
  let u = rng() * total - 1
  if (u < 0) return mode
  w = 1
  for (let k = mode; k > 0; k--) {
    w *= k / ((n - k + 1) * r)
    if (w < EPS) break
    u -= w
    if (u < 0) return k - 1
  }
  w = 1
  for (let k = mode; k < n; k++) {
    w *= ((n - k) / (k + 1)) * r
    if (w < EPS) break
    u -= w
    if (u < 0) return k + 1
  }
  return mode // only reachable through float rounding at the very edge
}
