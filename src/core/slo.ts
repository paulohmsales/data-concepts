import { normal, type Rng } from './random.ts'

/**
 * A daily data product (the 08:00 dashboard) over a 90-day quarter. Each day the pipeline finishes
 * at 06:00 + noise (sd 20 min). Upstream data is late on 1% of days (+1–4 h), and each deploy has a
 * 3% chance of breaking the next run (+2–6 h until someone fixes it). The SLI is "ready by the
 * deadline"; the SLO says on what share of days. The error budget is the misses the SLO allows.
 */
export const DAYS = 90
const BASE_FINISH = 6 * 60 // minutes after midnight
const NOISE_SD = 20
const UPSTREAM_LATE = 0.01
const DEPLOY_BREAK = 0.03

export interface SloParams {
  /** minutes after midnight */
  deadline: number
  /** e.g. 0.95 */
  target: number
  deploysPerWeek: number
  /** stop deploying once the budget is spent (resumes next quarter) */
  freeze: boolean
  seed: number
}

export interface SloDay {
  day: number
  finish: number
  cause: 'normal' | 'upstream' | 'deploy'
  deploys: number
  miss: boolean
  /** remaining budget after this day, in days (can go negative) */
  budgetLeft: number
  frozen: boolean
}

export interface SloResult {
  days: SloDay[]
  budget: number
  misses: number
  achieved: number
  met: boolean
  deploysShipped: number
  frozenDays: number
}

export function simulateSlo(p: SloParams, rng: Rng): SloResult {
  const budget = (1 - p.target) * DAYS
  const days: SloDay[] = []
  let left = budget
  let misses = 0
  let shipped = 0
  let frozenDays = 0
  for (let d = 0; d < DAYS; d++) {
    const frozen = p.freeze && left < 0.999 && misses > 0 // no budget for another miss
    if (frozen) frozenDays++
    // deploys yesterday (Poisson-ish via Bernoulli per slot)
    let deploys = 0
    if (!frozen) for (let i = 0; i < 10; i++) if (rng() < p.deploysPerWeek / 7 / 10) deploys++
    shipped += deploys
    let finish = BASE_FINISH + NOISE_SD * normal(rng)
    let cause: SloDay['cause'] = 'normal'
    let broke = false
    for (let i = 0; i < deploys; i++) if (rng() < DEPLOY_BREAK) broke = true
    if (broke) {
      finish += 120 + rng() * 240
      cause = 'deploy'
    } else if (rng() < UPSTREAM_LATE) {
      finish += 60 + rng() * 180
      cause = 'upstream'
    }
    const miss = finish > p.deadline
    if (miss) {
      misses++
      left -= 1
    }
    days.push({ day: d, finish, cause, deploys, miss, budgetLeft: left, frozen })
  }
  const achieved = 1 - misses / DAYS
  return { days, budget, misses, achieved, met: misses <= budget + 1e-9, deploysShipped: shipped, frozenDays }
}

/** Expected share of days that miss the deadline (for the target-vs-deadline curve). */
export function expectedMissRate(deadline: number, deploysPerWeek: number): number {
  const z = (deadline - BASE_FINISH) / NOISE_SD
  const pNoise = 1 - phi(z)
  const pDeploy = 1 - (1 - DEPLOY_BREAK) ** (deploysPerWeek / 7)
  // incidents push the finish 2–6 h (deploy) or 1–4 h (upstream) late: count them as misses when
  // the deadline is within that range of the normal finish
  const late = (lo: number, hi: number) => Math.min(1, Math.max(0, (BASE_FINISH + hi - deadline) / (hi - lo)))
  return 1 - (1 - pNoise) * (1 - pDeploy * late(120, 360)) * (1 - UPSTREAM_LATE * late(60, 240))
}

function phi(z: number): number {
  // standard normal CDF (Abramowitz–Stegun)
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const d = 0.3989423 * Math.exp((-z * z) / 2)
  const q = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return z > 0 ? 1 - q : q
}

export const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`
