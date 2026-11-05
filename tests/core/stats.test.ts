import { describe, expect, it } from 'vitest'
import { chiSquareSf, correlation, linearFit, logGamma, mean, quantile, sd, tCdf, tQuantile, variance } from '../../src/core/stats.ts'

describe('descriptive stats', () => {
  const xs = [2, 4, 4, 4, 5, 5, 7, 9]
  it('mean, sample variance, sd', () => {
    expect(mean(xs)).toBe(5)
    expect(variance(xs)).toBeCloseTo(32 / 7, 12)
    expect(sd(xs)).toBeCloseTo(Math.sqrt(32 / 7), 12)
  })
  it('type-7 quantiles (numpy default)', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5)
    expect(quantile([1, 2, 3, 4], 0.25)).toBe(1.75)
    expect(quantile([10], 0.9)).toBe(10)
  })
  it('correlation and least squares', () => {
    expect(correlation([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 12)
    expect(linearFit([0, 1, 2], [1, 3, 5])).toEqual({ slope: 2, intercept: 1 })
  })
})

describe('special functions and distributions (reference values from scipy)', () => {
  it('logGamma', () => {
    expect(logGamma(5)).toBeCloseTo(Math.log(24), 12)
    expect(logGamma(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 12)
  })
  it('t quantiles', () => {
    expect(tQuantile(0.975, 1)).toBeCloseTo(12.7062047362, 8)
    expect(tQuantile(0.975, 5)).toBeCloseTo(2.5705818356, 8)
    expect(tQuantile(0.975, 30)).toBeCloseTo(2.0422724563, 8)
    expect(tQuantile(0.05, 10)).toBeCloseTo(-1.8124611228, 8)
    expect(tCdf(0, 7)).toBeCloseTo(0.5, 12)
  })
  it('chi-square upper tail', () => {
    expect(chiSquareSf(3.841458820694124, 1)).toBeCloseTo(0.05, 10)
    expect(chiSquareSf(11.070497693516351, 5)).toBeCloseTo(0.05, 10)
    expect(chiSquareSf(1, 2)).toBeCloseTo(Math.exp(-0.5), 12)
  })
})
