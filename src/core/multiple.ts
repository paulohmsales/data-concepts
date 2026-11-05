import { normalCdf } from './abtest.ts'
import { normal, type Rng } from './random.ts'

export type Correction = 'none' | 'bonferroni' | 'holm' | 'bh'

/** Adjusted p-values, as R's p.adjust: reject when adjusted p < α. */
export function adjust(p: readonly number[], method: Correction): number[] {
  const m = p.length
  if (method === 'none') return [...p]
  if (method === 'bonferroni') return p.map((x) => Math.min(1, x * m))
  const order = p.map((_, i) => i).sort((a, b) => p[a] - p[b])
  const out = new Array<number>(m)
  if (method === 'holm') {
    // step-down: smallest p × m, next × (m − 1), …, kept monotone
    let running = 0
    order.forEach((idx, rank) => {
      running = Math.max(running, Math.min(1, p[idx] * (m - rank)))
      out[idx] = running
    })
  } else {
    // Benjamini–Hochberg step-up: p × m / rank, monotone from the largest down
    let running = 1
    for (let rank = m - 1; rank >= 0; rank--) {
      const idx = order[rank]
      running = Math.min(running, (p[idx] * m) / (rank + 1))
      out[idx] = Math.min(1, running)
    }
  }
  return out
}

export interface FamilyParams {
  /** Number of tests (metrics, segments, variants…). */
  m: number
  /** How many of them have a real effect. */
  real: number
  /** Real effect size in standard errors (z shift): 2.8 ≈ 80% power at α = 0.05. */
  effectZ: number
  alpha: number
}

export interface TestOutcome {
  real: boolean
  p: number
  adjusted: number
  rejected: boolean
}

/** One family: m two-sided z-tests, the first `real` with a true shift. */
export function simulateFamily(params: FamilyParams, method: Correction, rng: Rng): TestOutcome[] {
  const p = Array.from({ length: params.m }, (_, i) => {
    const z = (i < params.real ? params.effectZ : 0) + normal(rng)
    return 2 * (1 - normalCdf(Math.abs(z)))
  })
  const adj = adjust(p, method)
  return p.map((x, i) => ({ real: i < params.real, p: x, adjusted: adj[i], rejected: adj[i] < params.alpha }))
}

export interface ErrorRates {
  /** P(at least one false positive). */
  fwer: number
  /** E[false discoveries / discoveries] (0 when nothing is discovered). */
  fdr: number
  /** Share of real effects found. */
  power: number
}

export function errorRates(params: FamilyParams, method: Correction, families: number, rng: Rng): ErrorRates {
  let anyFalse = 0
  let fdpSum = 0
  let found = 0
  for (let f = 0; f < families; f++) {
    const fam = simulateFamily(params, method, rng)
    const falsePos = fam.filter((t) => t.rejected && !t.real).length
    const truePos = fam.filter((t) => t.rejected && t.real).length
    if (falsePos > 0) anyFalse++
    if (falsePos + truePos > 0) fdpSum += falsePos / (falsePos + truePos)
    found += truePos
  }
  return {
    fwer: anyFalse / families,
    fdr: fdpSum / families,
    power: params.real ? found / (params.real * families) : NaN,
  }
}

/** Chance of at least one false positive among m independent null tests. */
export const familywise = (m: number, alpha: number) => 1 - (1 - alpha) ** m
