import { describe, expect, it } from 'vitest'
import { KIDNEY_STONES, reverses, summarize, tableFrom } from '../../src/core/simpson.ts'

describe("Simpson's paradox", () => {
  it('kidney stones: A wins both strata, loses pooled (published numbers)', () => {
    const s = summarize(KIDNEY_STONES)
    expect(s.A.easy).toBeCloseTo(0.931, 3)
    expect(s.B.easy).toBeCloseTo(0.867, 3)
    expect(s.A.hard).toBeCloseTo(0.730, 3)
    expect(s.B.hard).toBeCloseTo(0.6875, 4)
    expect(s.A.overall).toBeCloseTo(0.78, 3)
    expect(s.B.overall).toBeCloseTo(0.826, 3)
    expect(reverses(KIDNEY_STONES)).toBe(true)
  })

  it('standardising to a common mix restores A as the winner', () => {
    const s = summarize(KIDNEY_STONES)
    expect(s.adjustedA).toBeGreaterThan(s.adjustedB)
  })

  it('pooled rate is the mix-weighted average of the strata rates', () => {
    const s = summarize(KIDNEY_STONES)
    expect(s.A.overall).toBeCloseTo((1 - s.A.hardShare) * s.A.easy + s.A.hardShare * s.A.hard, 12)
  })

  it('no reversal when both arms have the same mix', () => {
    const t = tableFrom({ A: { easy: 0.93, hard: 0.73 }, B: { easy: 0.87, hard: 0.69 } }, { A: 0.5, B: 0.5 }, 10_000)
    expect(reverses(t)).toBe(false)
  })
})
