import { normalQuantile } from './abtest.ts'
import { normal, type Rng } from './random.ts'
import { covariance, mean, variance } from './stats.ts'

/**
 * CUPED (Deng et al., 2013): reduce variance with a pre-experiment covariate.
 * y′ = y − θ·(x − mean(x)), θ = cov(x, y) / var(x). Because x was measured before assignment it is
 * independent of the treatment, so y′ has the same expected difference and variance × (1 − ρ²).
 */
export interface CupedParams {
  /** Users per arm. */
  n: number
  /** Correlation between the pre-period metric x and the outcome y. */
  rho: number
  /** True effect on y (in units of y's SD). */
  effect: number
  /**
   * Break it: share of the treatment effect that also shows up in the "covariate", i.e. the covariate
   * was measured during the experiment. 0 = a proper pre-period covariate.
   */
  leak: number
}

export interface Unit {
  treated: boolean
  x: number
  y: number
}

export function simulateUnits(p: CupedParams, rng: Rng): Unit[] {
  const out: Unit[] = []
  const rest = Math.sqrt(1 - p.rho * p.rho)
  for (let i = 0; i < 2 * p.n; i++) {
    const treated = i % 2 === 1
    const z1 = normal(rng)
    const z2 = normal(rng)
    const eff = treated ? p.effect : 0
    out.push({ treated, x: z1 + p.leak * eff, y: p.rho * z1 + rest * z2 + eff })
  }
  return out
}

export interface Estimate {
  diff: number
  se: number
  ci: [number, number]
  significant: boolean
}

function diffInMeans(values: readonly number[], treated: readonly boolean[]): Estimate {
  const t = values.filter((_, i) => treated[i])
  const c = values.filter((_, i) => !treated[i])
  const diff = mean(t) - mean(c)
  const se = Math.sqrt(variance(t) / t.length + variance(c) / c.length)
  const z = normalQuantile(0.975)
  return { diff, se, ci: [diff - z * se, diff + z * se], significant: Math.abs(diff / se) > z }
}

export function analyze(units: readonly Unit[]) {
  const x = units.map((u) => u.x)
  const y = units.map((u) => u.y)
  const treated = units.map((u) => u.treated)
  const theta = covariance(x, y) / variance(x)
  const mx = mean(x)
  const adjusted = y.map((yi, i) => yi - theta * (x[i] - mx))
  const raw = diffInMeans(y, treated)
  const cuped = diffInMeans(adjusted, treated)
  return { theta, raw, cuped, varianceRatio: (cuped.se / raw.se) ** 2 }
}

/** Repeat the experiment; returns the raw and CUPED estimates of each run. */
export function simulateMany(p: CupedParams, runs: number, rng: Rng) {
  return Array.from({ length: runs }, () => analyze(simulateUnits(p, rng)))
}
