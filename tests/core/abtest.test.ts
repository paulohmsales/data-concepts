import { describe, expect, it } from 'vitest'
import {
  analyticPower,
  everSignificant,
  normalCdf,
  requiredN,
  simulateMany,
  simulatePeeking,
  twoProportionZTest,
  winnersCurse,
  type AbParams,
} from '../../src/core/abtest.ts'
import { mulberry32 } from '../../src/core/random.ts'

const share = (xs: boolean[]) => xs.filter(Boolean).length / xs.length

describe('normalCdf', () => {
  it('matches known values', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 7)
    expect(normalCdf(1.959964)).toBeCloseTo(0.975, 6)
    expect(normalCdf(-1)).toBeCloseTo(0.158655, 5)
  })
})

describe('twoProportionZTest', () => {
  // Reference values computed independently (Python, math.erfc).
  it('matches a hand-computed example', () => {
    const r = twoProportionZTest(200, 1000, 250, 1000, 0.05)
    expect(r.diff).toBeCloseTo(0.05, 10)
    expect(r.se).toBeCloseTo(0.0186748494, 8)
    expect(r.z).toBeCloseTo(2.677397763, 6)
    expect(r.pValue).toBeCloseTo(0.0074196493, 6)
    expect(r.ci[0]).toBeCloseTo(0.0134636217, 6)
    expect(r.ci[1]).toBeCloseTo(0.0865363783, 6)
    expect(r.significant).toBe(true)
  })

  it('is symmetric in the arms', () => {
    const a = twoProportionZTest(200, 1000, 250, 1000)
    const b = twoProportionZTest(250, 1000, 200, 1000)
    expect(b.z).toBeCloseTo(-a.z, 10)
    expect(b.pValue).toBeCloseTo(a.pValue, 10)
  })

  it('returns p = 1 when there is no variance', () => {
    expect(twoProportionZTest(0, 100, 0, 100).pValue).toBe(1)
  })
})

describe('analyticPower / requiredN', () => {
  const p: AbParams = { baseline: 0.1, lift: 0.1, n: 10_000, alpha: 0.05 }

  it('matches a hand-computed example', () => {
    expect(analyticPower(p)).toBeCloseTo(0.6356079, 5)
  })

  it('equals alpha when there is no effect', () => {
    expect(analyticPower({ ...p, lift: 0 })).toBeCloseTo(0.05, 10)
  })

  it('requiredN gives ~80% power (10% → 11% needs ~14.75k per arm)', () => {
    const n = requiredN(p, 0.8)
    expect(n).toBeGreaterThan(14_600)
    expect(n).toBeLessThan(14_900)
    expect(analyticPower({ ...p, n })).toBeCloseTo(0.8, 2)
  })
})

// Acceptance checks from PLAN.md §5.
describe('acceptance: simulation agrees with theory', () => {
  it('with no effect, the false-positive share is 0.05 ± 0.01 over 10,000 sims', () => {
    const params: AbParams = { baseline: 0.1, lift: 0, n: 2_000, alpha: 0.05 }
    const results = simulateMany(params, 10_000, mulberry32(1))
    const fp = share(results.map((r) => r.significant))
    expect(Math.abs(fp - 0.05)).toBeLessThanOrEqual(0.01)
  })

  it('simulated power is within ±2 points of analyticPower', () => {
    for (const params of [
      { baseline: 0.1, lift: 0.1, n: 10_000, alpha: 0.05 },
      { baseline: 0.02, lift: 0.2, n: 20_000, alpha: 0.05 },
      { baseline: 0.3, lift: 0.05, n: 5_000, alpha: 0.01 },
    ]) {
      const results = simulateMany(params, 5_000, mulberry32(2))
      const simulated = share(results.map((r) => r.significant))
      expect(Math.abs(simulated - analyticPower(params))).toBeLessThanOrEqual(0.02)
    }
  })

  it('peeking 20 times with no effect inflates false positives well above 0.05', () => {
    const params: AbParams = { baseline: 0.1, lift: 0, n: 10_000, alpha: 0.05 }
    const rng = mulberry32(3)
    const k = 2_000
    const ever: boolean[] = []
    const atEnd: boolean[] = []
    for (let i = 0; i < k; i++) {
      const path = simulatePeeking(params, 20, rng)
      ever.push(everSignificant(path, params.alpha))
      atEnd.push(path[path.length - 1].pValue < params.alpha)
    }
    expect(share(ever)).toBeGreaterThan(0.15) // theory: ~0.25 for 20 looks
    expect(Math.abs(share(atEnd) - 0.05)).toBeLessThan(0.02) // the honest end-of-test rate
  })

  it('at low power, significant winners overstate the true lift', () => {
    const params: AbParams = { baseline: 0.1, lift: 0.05, n: 2_000, alpha: 0.05 }
    expect(analyticPower(params)).toBeLessThan(0.2)
    const { meanLift, count } = winnersCurse(simulateMany(params, 5_000, mulberry32(4)))
    expect(count).toBeGreaterThan(50)
    expect(meanLift).toBeGreaterThan(2 * params.lift)
  })
})
