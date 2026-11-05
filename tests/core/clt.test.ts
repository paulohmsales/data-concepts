import { describe, expect, it } from 'vitest'
import { DISTS, draw, predicted, sampleMeans } from '../../src/core/clt.ts'
import { mulberry32 } from '../../src/core/random.ts'
import { mean, quantile, sd, skewness } from '../../src/core/stats.ts'

const iqr = (xs: number[]) => quantile(xs, 0.75) - quantile(xs, 0.25)

describe('distributions match their stated moments', () => {
  for (const d of Object.values(DISTS).filter((d) => Number.isFinite(d.mu))) {
    it(d.name, () => {
      const xs = draw(d, 200_000, mulberry32(1))
      expect(mean(xs)).toBeCloseTo(d.mu, 1)
      expect(sd(xs) / d.sigma).toBeCloseTo(1, 1)
    })
  }
})

describe('central limit theorem', () => {
  for (const name of ['uniform', 'exponential', 'lognormal'] as const) {
    it(`${name}: mean of means ≈ μ and spread ≈ σ/√n`, () => {
      const d = DISTS[name]
      const n = 40
      const means = sampleMeans(d, n, 5000, mulberry32(2))
      const p = predicted(d, n)
      expect(Math.abs(mean(means) - p.mean)).toBeLessThan((4 * p.se) / Math.sqrt(5000))
      expect(sd(means) / p.se).toBeGreaterThan(0.95)
      expect(sd(means) / p.se).toBeLessThan(1.05)
    })
  }

  it('skewness of the mean fades like skew/√n (exponential, n = 25 → 0.4)', () => {
    const means = sampleMeans(DISTS.exponential, 25, 20_000, mulberry32(3))
    expect(skewness(means)).toBeCloseTo(predicted(DISTS.exponential, 25).skew, 1)
  })

  it('Cauchy breaks it: averaging 100 draws is no tighter than one draw', () => {
    const one = draw(DISTS.cauchy, 20_000, mulberry32(4))
    const avg = sampleMeans(DISTS.cauchy, 100, 20_000, mulberry32(5))
    // both are Cauchy(5, 1): IQR = 2
    expect(iqr(one)).toBeCloseTo(2, 0)
    expect(iqr(avg) / iqr(one)).toBeGreaterThan(0.85)
    expect(iqr(avg) / iqr(one)).toBeLessThan(1.15)
  })
})
