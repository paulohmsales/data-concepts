import { binomial, type Rng } from './random.ts'

/**
 * Weekly signup cohorts. A user active in week 0 (signup) is active at age k ≥ 1 with probability
 *   floor + (1 − floor) · exp(−k / decay)
 * i.e. a fast early drop that flattens out at `floor` (the users who stick).
 */
export interface CohortParams {
  weeks: number
  /** Signups in week 0, growing by `growth` per week (marketing ramps up). */
  firstCohort: number
  growth: number
  floor: number
  decay: number
  /** Break it: from this cohort on, the long-run floor drops to `worseFloor` (product got worse). */
  worseFrom: number | null
  worseFloor: number
}

export const retentionCurve = (k: number, floor: number, decay: number) =>
  k === 0 ? 1 : floor + (1 - floor) * Math.exp(-k / decay)

export interface Cohort {
  cohort: number
  size: number
  /** active[k] = users active at age k; only ages the cohort has reached (cohort + k < weeks). */
  active: number[]
}

export function simulateCohorts(p: CohortParams, rng: Rng): Cohort[] {
  return Array.from({ length: p.weeks }, (_, c) => {
    const size = Math.round(p.firstCohort * p.growth ** c)
    const floor = p.worseFrom !== null && c >= p.worseFrom ? p.worseFloor : p.floor
    const ages = p.weeks - c
    const active = Array.from({ length: ages }, (_, k) => (k === 0 ? size : binomial(size, retentionCurve(k, floor, p.decay), rng)))
    return { cohort: c, size, active }
  })
}

/** The "active users" chart: everyone active in each calendar week, all cohorts stacked. */
export function activeByWeek(cohorts: readonly Cohort[], weeks: number): number[] {
  const out = new Array<number>(weeks).fill(0)
  for (const c of cohorts) c.active.forEach((a, k) => (out[c.cohort + k] += a))
  return out
}

/**
 * Week-k retention pooled over cohorts.
 * correct: only cohorts old enough to have a week k, weighted by size.
 * naive: active at age k ÷ everyone who ever signed up (young cohorts count as 0, not as unknown).
 */
export function pooledRetention(cohorts: readonly Cohort[], k: number) {
  const mature = cohorts.filter((c) => c.active.length > k)
  const activeK = mature.reduce((s, c) => s + c.active[k], 0)
  const matureSize = mature.reduce((s, c) => s + c.size, 0)
  const allSize = cohorts.reduce((s, c) => s + c.size, 0)
  return { correct: matureSize ? activeK / matureSize : NaN, naive: activeK / allSize }
}
