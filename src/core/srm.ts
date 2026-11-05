import { twoProportionZTest } from './abtest.ts'
import { binomial, type Rng } from './random.ts'
import { chiSquareSf } from './stats.ts'

/** Chi-square goodness-of-fit test of observed arm sizes against the planned split. */
export function srmTest(counts: readonly number[], shares: readonly number[]) {
  const total = counts.reduce((s, x) => s + x, 0)
  let chi2 = 0
  counts.forEach((o, i) => {
    const e = total * shares[i]
    chi2 += (o - e) ** 2 / e
  })
  return { chi2, p: chiSquareSf(chi2, counts.length - 1) }
}

export interface LeakParams {
  /** Users randomised in total (a fair coin assigns each to A or B). */
  n: number
  baseline: number
  /** True relative lift of B (0 = B does nothing). */
  lift: number
  /**
   * Share of B's low-intent users who are never logged: e.g. B's page is slower, impatient visitors
   * leave before the tracking event fires. Those visitors would rarely have converted anyway.
   */
  leak: number
}

/**
 * Half the users are low intent (convert at baseline × 0.1), half high intent (× 1.9), so the
 * average is the baseline. B loses `leak` of its low-intent users from the logs.
 */
export function simulateLeak(p: LeakParams, rng: Rng) {
  const lowRate = p.baseline * 0.1
  const highRate = p.baseline * 1.9
  const lift = 1 + p.lift
  const assignedA = binomial(p.n, 0.5, rng)
  const assignedB = p.n - assignedA
  const lowA = binomial(assignedA, 0.5, rng)
  const lowB = binomial(assignedB, 0.5, rng)
  const highB = assignedB - lowB
  const loggedLowB = lowB - binomial(lowB, p.leak, rng)
  const nA = assignedA
  const nB = loggedLowB + highB
  const convA = binomial(lowA, lowRate, rng) + binomial(assignedA - lowA, highRate, rng)
  const convB = binomial(loggedLowB, lowRate * lift, rng) + binomial(highB, highRate * lift, rng)
  const ab = twoProportionZTest(convA, nA, convB, nB)
  return { nA, nB, convA, convB, ab, srm: srmTest([nA, nB], [0.5, 0.5]) }
}
