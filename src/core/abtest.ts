import { errorFunction, probit } from 'simple-statistics'
import { binomial, type Rng } from './random.ts'

/**
 * Standard normal CDF Φ(z). Plumbing, from simple-statistics (D4).
 * (Not its cumulativeStdNormalProbability: that one is a 4-decimal lookup table, which would make
 * the p-value histogram lumpy.)
 */
export function normalCdf(z: number): number {
  return 0.5 * (1 + errorFunction(z / Math.SQRT2))
}

/** Inverse standard normal CDF Φ⁻¹(p). */
export function normalQuantile(p: number): number {
  return probit(p)
}

export interface AbParams {
  /** Conversion rate of A (control), e.g. 0.10. */
  baseline: number
  /** True relative lift of B over A, e.g. 0.05 means pB = pA × 1.05. */
  lift: number
  /** Users per arm. */
  n: number
  /** Significance level, two-sided. */
  alpha: number
}

export interface TestResult {
  convA: number
  convB: number
  nA: number
  nB: number
  rateA: number
  rateB: number
  /** rateB − rateA (absolute). */
  diff: number
  /** (rateB − rateA) / rateA. NaN when rateA = 0. */
  relLift: number
  /** Pooled SE under H0 (used for z and p). */
  se: number
  z: number
  pValue: number
  /** Confidence interval for diff at 1 − alpha, using the unpooled SE. */
  ci: [number, number]
  significant: boolean
}

export const rateB = (p: Pick<AbParams, 'baseline' | 'lift'>) => p.baseline * (1 + p.lift)

/**
 * Two-sided two-proportion z-test.
 *
 * H0: pA = pB. Under H0 both arms share one rate, so we estimate it by pooling, and
 * z = diff / SE_pooled. The CI is about the *actual* difference, so it uses each arm's own
 * variance (unpooled SE) instead.
 */
export function twoProportionZTest(
  convA: number,
  nA: number,
  convB: number,
  nB: number,
  alpha = 0.05,
): TestResult {
  const rateA = convA / nA
  const rateB = convB / nB
  const diff = rateB - rateA

  const pooled = (convA + convB) / (nA + nB)
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / nA + 1 / nB))
  const z = se === 0 ? 0 : diff / se
  const pValue = se === 0 ? 1 : 2 * (1 - normalCdf(Math.abs(z)))

  const seUnpooled = Math.sqrt((rateA * (1 - rateA)) / nA + (rateB * (1 - rateB)) / nB)
  const zCrit = normalQuantile(1 - alpha / 2)
  const ci: [number, number] = [diff - zCrit * seUnpooled, diff + zCrit * seUnpooled]

  return {
    convA,
    convB,
    nA,
    nB,
    rateA,
    rateB,
    diff,
    relLift: rateA === 0 ? NaN : diff / rateA,
    se,
    z,
    pValue,
    ci,
    significant: pValue < alpha,
  }
}

/** One simulated experiment: draw conversions for each arm, then test. */
export function simulateTest(params: AbParams, rng: Rng): TestResult {
  const convA = binomial(params.n, params.baseline, rng)
  const convB = binomial(params.n, rateB(params), rng)
  return twoProportionZTest(convA, params.n, convB, params.n, params.alpha)
}

/** k independent experiments with the same params. */
export function simulateMany(params: AbParams, k: number, rng: Rng): TestResult[] {
  const out: TestResult[] = []
  for (let i = 0; i < k; i++) out.push(simulateTest(params, rng))
  return out
}

/**
 * Analytic power of the pooled two-sided z-test.
 *
 * Reject when |diff| > zα · SE0 (SE0 = pooled SE under H0). Under H1, diff ~ N(d, SE1²), with
 * SE1 the unpooled SE at the true rates. Power = P(diff > zα·SE0) + P(diff < −zα·SE0).
 */
export function analyticPower(params: AbParams): number {
  const pA = params.baseline
  const pB = rateB(params)
  const d = pB - pA
  const pBar = (pA + pB) / 2
  const se0 = Math.sqrt((2 * pBar * (1 - pBar)) / params.n)
  const se1 = Math.sqrt((pA * (1 - pA) + pB * (1 - pB)) / params.n)
  const zA = normalQuantile(1 - params.alpha / 2)
  return normalCdf((d - zA * se0) / se1) + normalCdf((-d - zA * se0) / se1)
}

/**
 * Users per arm needed to reach `power` for this lift (inverts analyticPower, ignoring the
 * tiny far-tail term). Infinity when lift = 0.
 */
export function requiredN(params: Omit<AbParams, 'n'>, power = 0.8): number {
  const pA = params.baseline
  const pB = rateB(params)
  const d = pB - pA
  if (d === 0) return Infinity
  const pBar = (pA + pB) / 2
  const zA = normalQuantile(1 - params.alpha / 2)
  const zB = normalQuantile(power)
  const num = zA * Math.sqrt(2 * pBar * (1 - pBar)) + zB * Math.sqrt(pA * (1 - pA) + pB * (1 - pB))
  return Math.ceil((num * num) / (d * d))
}

export interface PeekPoint {
  /** Users per arm seen so far. */
  n: number
  pValue: number
}

/**
 * One experiment observed `looks` times at equally spaced checkpoints (the last look is at
 * params.n). Each look runs the usual test on the data so far.
 */
export function simulatePeeking(params: AbParams, looks: number, rng: Rng): PeekPoint[] {
  const pB = rateB(params)
  const out: PeekPoint[] = []
  let convA = 0
  let convB = 0
  let seen = 0
  for (let i = 1; i <= looks; i++) {
    const target = Math.round((params.n * i) / looks)
    const batch = target - seen
    convA += binomial(batch, params.baseline, rng)
    convB += binomial(batch, pB, rng)
    seen = target
    out.push({ n: seen, pValue: twoProportionZTest(convA, seen, convB, seen, params.alpha).pValue })
  }
  return out
}

/** True if any look crossed alpha, i.e. what a peeker who stops at the first "win" would report. */
export const everSignificant = (path: PeekPoint[], alpha: number) =>
  path.some((p) => p.pValue < alpha)

/** Average estimated relative lift among significant positive results (the winner's curse). */
export function winnersCurse(results: TestResult[]): { meanLift: number; count: number } {
  const winners = results.filter((r) => r.significant && r.diff > 0 && Number.isFinite(r.relLift))
  const meanLift = winners.reduce((s, r) => s + r.relLift, 0) / winners.length
  return { meanLift: winners.length ? meanLift : NaN, count: winners.length }
}
