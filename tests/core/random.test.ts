import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../src/core/random.ts'

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
