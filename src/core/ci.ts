import { normalQuantile } from './abtest.ts'
import { normal, type Rng } from './random.ts'
import { mean, sd, tQuantile } from './stats.ts'

export type Population = 'normal' | 'exponential'
export type Method = 't' | 'z'

export const POPULATIONS: Record<Population, { label: string; mu: number; sigma: number; sample: (rng: Rng) => number }> = {
  normal: { label: 'Normal (μ 50, σ 10)', mu: 50, sigma: 10, sample: (rng) => 50 + 10 * normal(rng) },
  exponential: { label: 'Skewed: exponential (μ 50)', mu: 50, sigma: 50, sample: (rng) => -50 * Math.log(1 - rng()) },
}

export interface Interval {
  lo: number
  hi: number
  center: number
  covers: boolean
}

/**
 * Confidence interval for a mean from one sample: x̄ ± critical · s/√n.
 * t: critical from Student's t with n − 1 df (accounts for s itself being estimated).
 * z: critical from the normal (what people often use by mistake; too narrow for small n).
 */
export function meanInterval(sample: readonly number[], level: number, method: Method, truth: number): Interval {
  const n = sample.length
  const center = mean(sample)
  const p = 1 - (1 - level) / 2
  const crit = method === 't' ? tQuantile(p, n - 1) : normalQuantile(p)
  const half = (crit * sd(sample)) / Math.sqrt(n)
  return { lo: center - half, hi: center + half, center, covers: center - half <= truth && truth <= center + half }
}

export interface CiParams {
  population: Population
  n: number
  level: number
  method: Method
}

/** k independent experiments, each producing one interval. */
export function simulateIntervals(params: CiParams, k: number, rng: Rng): Interval[] {
  const pop = POPULATIONS[params.population]
  const out: Interval[] = []
  for (let i = 0; i < k; i++) {
    const sample = Array.from({ length: params.n }, () => pop.sample(rng))
    out.push(meanInterval(sample, params.level, params.method, pop.mu))
  }
  return out
}

export const coverage = (intervals: readonly Interval[]) =>
  intervals.filter((iv) => iv.covers).length / intervals.length
