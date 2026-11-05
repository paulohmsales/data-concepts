import { normal, type Rng } from './random.ts'
import { mean } from './stats.ts'

export type DistName = 'uniform' | 'exponential' | 'bimodal' | 'lognormal' | 'rare' | 'cauchy'

export interface Dist {
  name: DistName
  label: string
  /** Theoretical mean and standard deviation (NaN when they don't exist). */
  mu: number
  sigma: number
  /** Theoretical skewness of one draw (NaN when undefined). */
  skew: number
  /** Range to draw the population on. */
  range: [number, number]
  sample: (rng: Rng) => number
}

const E = Math.E

export const DISTS: Record<DistName, Dist> = {
  uniform: {
    name: 'uniform',
    label: 'Uniform 0–10',
    mu: 5,
    sigma: 10 / Math.sqrt(12),
    skew: 0,
    range: [0, 10],
    sample: (rng) => 10 * rng(),
  },
  exponential: {
    name: 'exponential',
    label: 'Exponential (waiting times)',
    mu: 2,
    sigma: 2,
    skew: 2,
    range: [0, 14],
    sample: (rng) => -2 * Math.log(1 - rng()),
  },
  bimodal: {
    name: 'bimodal',
    label: 'Two humps',
    mu: 5,
    sigma: Math.sqrt(0.49 + 9),
    skew: 0,
    range: [0, 10],
    sample: (rng) => (rng() < 0.5 ? 2 : 8) + 0.7 * normal(rng),
  },
  lognormal: {
    name: 'lognormal',
    label: 'Log-normal (incomes)',
    mu: Math.exp(0.5),
    sigma: Math.sqrt((E - 1) * E),
    skew: (E + 2) * Math.sqrt(E - 1),
    range: [0, 10],
    sample: (rng) => Math.exp(normal(rng)),
  },
  rare: {
    name: 'rare',
    label: 'Rare event (5% yes)',
    mu: 0.05,
    sigma: Math.sqrt(0.05 * 0.95),
    skew: 0.9 / Math.sqrt(0.05 * 0.95),
    range: [0, 1],
    sample: (rng) => (rng() < 0.05 ? 1 : 0),
  },
  cauchy: {
    name: 'cauchy',
    label: 'Cauchy (no mean!)',
    mu: NaN,
    sigma: NaN,
    skew: NaN,
    range: [-10, 20],
    sample: (rng) => 5 + Math.tan(Math.PI * (rng() - 0.5)),
  },
}

export const draw = (d: Dist, count: number, rng: Rng) => Array.from({ length: count }, () => d.sample(rng))

/** k samples of size n; returns the mean of each sample. */
export function sampleMeans(d: Dist, n: number, k: number, rng: Rng): number[] {
  const out = new Array<number>(k)
  for (let i = 0; i < k; i++) {
    let s = 0
    for (let j = 0; j < n; j++) s += d.sample(rng)
    out[i] = s / n
  }
  return out
}

/** The CLT's promise: the sample mean is ≈ Normal(μ, σ/√n), so its skew fades as skew/√n. */
export const predicted = (d: Dist, n: number) => ({
  mean: d.mu,
  se: d.sigma / Math.sqrt(n),
  skew: d.skew / Math.sqrt(n),
})

export { mean }
