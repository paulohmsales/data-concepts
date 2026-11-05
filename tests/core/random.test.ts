import { describe, expect, it } from 'vitest'
import { binomial, mulberry32 } from '../../src/core/random.ts'

describe('mulberry32', () => {
  it('is reproducible for the same seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    for (let i = 0; i < 100; i++) expect(a()).toBe(b())
  })

  it('differs across seeds', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)())
  })

  it('stays in [0, 1) with mean near 0.5', () => {
    const rng = mulberry32(7)
    const n = 100_000
    let sum = 0
    let min = Infinity
    let max = -Infinity
    for (let i = 0; i < n; i++) {
      const x = rng()
      sum += x
      if (x < min) min = x
      if (x > max) max = x
    }
    expect(min).toBeGreaterThanOrEqual(0)
    expect(max).toBeLessThan(1)
    // SE of the mean of U(0,1) is sqrt(1/12/n) ≈ 0.0009; allow ~5 SE.
    expect(Math.abs(sum / n - 0.5)).toBeLessThan(0.005)
  })
})

describe('binomial', () => {
  const check = (n: number, p: number) => {
    const rng = mulberry32(123)
    const k = 20_000
    let sum = 0
    let sumSq = 0
    for (let i = 0; i < k; i++) {
      const x = binomial(n, p, rng)
      sum += x
      sumSq += x * x
    }
    const mean = sum / k
    const variance = sumSq / k - mean * mean
    const trueVar = n * p * (1 - p)
    // mean within ~5 SE; variance within 5%
    expect(Math.abs(mean - n * p)).toBeLessThan(5 * Math.sqrt(trueVar / k))
    expect(Math.abs(variance / trueVar - 1)).toBeLessThan(0.05)
  }

  it('matches mean and variance (exact path, small mean)', () => check(1000, 0.02))
  it('matches mean and variance (exact path, p > 0.5)', () => check(200, 0.9))
  it('matches mean and variance (exact path, large mean)', () => check(10_000, 0.1))
  it('matches mean and variance (exact path, tiny p)', () => check(100_000, 0.00002))
  it('matches mean and variance (normal path)', () => check(100_000, 0.3))

  it('matches exact probabilities for a small case', () => {
    // Binomial(10, 0.3): P(0..10) computed by the formula
    const n = 10
    const p = 0.3
    const choose = (k: number): number => (k === 0 ? 1 : (choose(k - 1) * (n - k + 1)) / k)
    const exact = Array.from({ length: n + 1 }, (_, k) => choose(k) * p ** k * (1 - p) ** (n - k))
    const rng = mulberry32(9)
    const draws = 200_000
    const counts = new Array(n + 1).fill(0)
    for (let i = 0; i < draws; i++) counts[binomial(n, p, rng)]++
    for (let k = 0; k <= n; k++) {
      const se = Math.sqrt((exact[k] * (1 - exact[k])) / draws)
      expect(Math.abs(counts[k] / draws - exact[k])).toBeLessThan(5 * se + 1e-6)
    }
  })

  it('handles edge cases', () => {
    const rng = mulberry32(1)
    expect(binomial(0, 0.5, rng)).toBe(0)
    expect(binomial(50, 0, rng)).toBe(0)
    expect(binomial(50, 1, rng)).toBe(50)
  })
})
