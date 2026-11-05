import { describe, expect, it } from 'vitest'
import { kappa, pairedTest, simulateEval, unpairedSe, wilson, type EvalParams } from '../../src/core/ai/evals.ts'
import { mulberry32 } from '../../src/core/random.ts'

const base: EvalParams = { n: 4000, passA: 0.7, passB: 0.7, judgeAccuracy: 0.9, verbosityBias: 0, positionBias: 0, swap: false }
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

describe('statistics for evals', () => {
  it('Wilson interval (reference: 15/20 → [0.531, 0.888])', () => {
    const [lo, hi] = wilson(15, 20)
    expect(lo).toBeCloseTo(0.531, 3)
    expect(hi).toBeCloseTo(0.888, 3)
  })

  it('kappa: perfect agreement 1, chance agreement ≈ 0', () => {
    const x = [true, false, true, false]
    expect(kappa(x, x)).toBe(1)
    expect(kappa([true, true, false, false], [true, false, true, false])).toBeCloseTo(0, 10)
  })

  it('pairing shrinks the standard error when items share difficulty', () => {
    const items = simulateEval(base, mulberry32(1))
    expect(pairedTest(items).se).toBeLessThan(unpairedSe(items) * 0.85)
  })
})

describe('simulated judge', () => {
  it('pass rates match the true ones', () => {
    const items = simulateEval(base, mulberry32(2))
    expect(mean(items.map((i) => (i.a ? 1 : 0)))).toBeCloseTo(0.7, 1)
  })

  it('an accurate, unbiased judge tracks the human pass rate and agrees well', () => {
    const items = simulateEval({ ...base, judgeAccuracy: 0.97 }, mulberry32(3))
    expect(Math.abs(mean(items.map((i) => +i.judgeA)) - mean(items.map((i) => +i.a)))).toBeLessThan(0.05)
    expect(kappa(items.map((i) => i.a), items.map((i) => i.judgeA))).toBeGreaterThan(0.85)
  })

  it('verbosity bias makes B look better when the prompts are equal', () => {
    const items = simulateEval({ ...base, verbosityBias: 0.2 }, mulberry32(4))
    expect(mean(items.map((i) => +i.judgeB)) - mean(items.map((i) => +i.judgeA))).toBeGreaterThan(0.04)
    expect(mean(items.map((i) => i.prefersB))).toBeGreaterThan(0.55)
  })

  it('position bias favours whatever is shown first; swapping cancels it', () => {
    const biased = simulateEval({ ...base, positionBias: 0.2 }, mulberry32(5))
    const swapped = simulateEval({ ...base, positionBias: 0.2, swap: true }, mulberry32(5))
    expect(mean(biased.map((i) => i.prefersB))).toBeLessThan(0.4) // A was always first
    expect(Math.abs(mean(swapped.map((i) => i.prefersB)) - 0.5)).toBeLessThan(0.03)
  })
})
