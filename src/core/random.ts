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
 * Exact for typical A/B sizes: instead of flipping n coins, jump straight to the next success.
 * The gap between successes is geometric, so it costs ~n·p draws, not n.
 * When the variance n·p·(1−p) is large (> 1,000, i.e. SD > 31.6; skew < 0.03), the binomial is
 * indistinguishable from a normal at this resolution, so we use that and stay fast.
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

  const logQ = Math.log(1 - p)
  let count = 0
  let pos = 0
  for (;;) {
    let u = 0
    while (u === 0) u = rng()
    pos += Math.floor(Math.log(u) / logQ) + 1
    if (pos > n) return count
    count++
  }
}
