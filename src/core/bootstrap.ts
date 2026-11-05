import { normalQuantile } from './abtest.ts'
import { normal, type Rng } from './random.ts'
import { quantile } from './stats.ts'

export type StatName = 'mean' | 'median' | 'p90' | 'max'

export interface StatDef {
  label: string
  of: (xs: readonly number[]) => number
  /** The population the statistic is estimated on, and the true value there. */
  population: string
  sample: (rng: Rng) => number
  truth: number
}

// Incomes in $k: log-normal with median 40 and a long right tail.
const income = (rng: Rng) => 40 * Math.exp(0.8 * normal(rng))
const INCOME = 'incomes ($k, log-normal, median 40)'

const mean = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0) / xs.length

export const STATS: Record<StatName, StatDef> = {
  mean: { label: 'Mean', of: mean, population: INCOME, sample: income, truth: 40 * Math.exp(0.32) },
  median: { label: 'Median', of: (xs) => quantile(xs, 0.5), population: INCOME, sample: income, truth: 40 },
  p90: {
    label: '90th percentile',
    of: (xs) => quantile(xs, 0.9),
    population: INCOME,
    sample: income,
    truth: 40 * Math.exp(0.8 * normalQuantile(0.9)),
  },
  max: {
    label: 'Maximum',
    of: (xs) => Math.max(...xs),
    population: 'scores, uniform 0–100 (true max 100)',
    sample: (rng) => 100 * rng(),
    truth: 100,
  },
}

/** Draw n values with replacement from xs. */
export function resample(xs: readonly number[], rng: Rng): number[] {
  const out = new Array<number>(xs.length)
  for (let i = 0; i < xs.length; i++) out[i] = xs[Math.floor(rng() * xs.length)]
  return out
}

/** B bootstrap replicates of a statistic: recompute it on B resamples of the one sample you have. */
export function bootstrap(xs: readonly number[], stat: (xs: readonly number[]) => number, B: number, rng: Rng): number[] {
  return Array.from({ length: B }, () => stat(resample(xs, rng)))
}

/** Percentile interval: the middle `level` share of the replicates. */
export function percentileInterval(reps: readonly number[], level: number): [number, number] {
  const a = (1 - level) / 2
  return [quantile(reps, a), quantile(reps, 1 - a)]
}

/** Share of k fresh studies whose percentile interval contains the truth. */
export function bootstrapCoverage(stat: StatName, n: number, level: number, k: number, B: number, rng: Rng): number {
  const s = STATS[stat]
  let hits = 0
  for (let i = 0; i < k; i++) {
    const xs = Array.from({ length: n }, () => s.sample(rng))
    const [lo, hi] = percentileInterval(bootstrap(xs, s.of, B, rng), level)
    if (lo <= s.truth && s.truth <= hi) hits++
  }
  return hits / k
}
