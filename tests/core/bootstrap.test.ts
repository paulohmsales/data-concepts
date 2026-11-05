import { describe, expect, it } from 'vitest'
import { bootstrap, bootstrapCoverage, percentileInterval, resample, STATS } from '../../src/core/bootstrap.ts'
import { mulberry32 } from '../../src/core/random.ts'
import { mean, sd } from '../../src/core/stats.ts'

describe('bootstrap', () => {
  it('a resample has the same size and only original values', () => {
    const xs = [1, 2, 3, 4, 5]
    const r = resample(xs, mulberry32(1))
    expect(r).toHaveLength(5)
    for (const x of r) expect(xs).toContain(x)
  })

  it('bootstrap SE of the mean ≈ s/√n (the formula it replaces)', () => {
    const rng = mulberry32(2)
    const xs = Array.from({ length: 80 }, () => STATS.mean.sample(rng))
    const reps = bootstrap(xs, mean, 4000, rng)
    const formula = sd(xs) / Math.sqrt(xs.length) * Math.sqrt((xs.length - 1) / xs.length)
    expect(sd(reps) / formula).toBeGreaterThan(0.94)
    expect(sd(reps) / formula).toBeLessThan(1.06)
  })

  it('percentile interval of a known set', () => {
    const reps = Array.from({ length: 101 }, (_, i) => i)
    const [lo, hi] = percentileInterval(reps, 0.9)
    expect(lo).toBeCloseTo(5, 10)
    expect(hi).toBeCloseTo(95, 10)
  })

  it('median of incomes at n = 60: coverage near the promised 90%', () => {
    const c = bootstrapCoverage('median', 60, 0.9, 400, 400, mulberry32(3))
    expect(c).toBeGreaterThan(0.85)
    expect(c).toBeLessThan(0.95)
  })

  it('breaks for the maximum: the interval can never reach the true max', () => {
    expect(bootstrapCoverage('max', 50, 0.9, 200, 200, mulberry32(4))).toBe(0)
  })

  it('breaks at tiny n: mean of skewed incomes at n = 5 under-covers', () => {
    expect(bootstrapCoverage('mean', 5, 0.9, 1000, 300, mulberry32(5))).toBeLessThan(0.82)
  })
})
