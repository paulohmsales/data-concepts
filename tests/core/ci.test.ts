import { describe, expect, it } from 'vitest'
import { coverage, meanInterval, simulateIntervals } from '../../src/core/ci.ts'
import { mulberry32 } from '../../src/core/random.ts'
import { tCdf } from '../../src/core/stats.ts'

describe('mean confidence intervals', () => {
  it('t interval matches a hand calculation', () => {
    // x = 1..5: mean 3, s = √2.5, t(0.975, 4) = 2.776445
    const iv = meanInterval([1, 2, 3, 4, 5], 0.95, 't', 3)
    expect(iv.hi - 3).toBeCloseTo(2.776445105 * Math.sqrt(2.5) / Math.sqrt(5), 6)
  })

  it('t interval on normal data covers ≈ 95% even at n = 5', () => {
    const c = coverage(simulateIntervals({ population: 'normal', n: 5, level: 0.95, method: 't' }, 10_000, mulberry32(1)))
    expect(c).toBeGreaterThan(0.94)
    expect(c).toBeLessThan(0.96)
  })

  it('z interval at n = 5 under-covers, as theory says (P(|T₄| < 1.96) ≈ 88%)', () => {
    const c = coverage(simulateIntervals({ population: 'normal', n: 5, level: 0.95, method: 'z' }, 10_000, mulberry32(2)))
    const theory = 2 * tCdf(1.959964, 4) - 1
    expect(theory).toBeCloseTo(0.878, 2)
    expect(Math.abs(c - theory)).toBeLessThan(0.012)
  })

  it('skewed data with small n: even the t interval falls short', () => {
    const c = coverage(simulateIntervals({ population: 'exponential', n: 5, level: 0.95, method: 't' }, 10_000, mulberry32(3)))
    expect(c).toBeLessThan(0.91)
  })

  it('skewed data with large n: the CLT rescues it', () => {
    const c = coverage(simulateIntervals({ population: 'exponential', n: 200, level: 0.95, method: 't' }, 5_000, mulberry32(4)))
    expect(c).toBeGreaterThan(0.935)
  })
})
