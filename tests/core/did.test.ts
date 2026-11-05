import { describe, expect, it } from 'vitest'
import { estimates, preTrend, simulateDid, type DidParams } from '../../src/core/did.ts'
import { mulberry32 } from '../../src/core/random.ts'

const base: DidParams = { effect: -8, levelGap: 15, extraTrend: 0, noise: 3, seed: 1 }
const run = (p: Partial<DidParams>, seed: number) => simulateDid({ ...base, ...p, seed }, mulberry32(seed))

describe.each([1, 2, 3])('difference-in-differences (seed %i)', (seed) => {
  it('naive comparisons get even the sign wrong', () => {
    const e = estimates(run({}, seed))
    expect(e.beforeAfter).toBeGreaterThan(0)
    expect(e.postGap).toBeGreaterThan(0)
  })
  it('DiD recovers the effect when trends are parallel', () => {
    expect(Math.abs(estimates(run({}, seed)).did - base.effect)).toBeLessThan(3)
  })
  it('a pre-existing trend biases DiD, and the pre-trend shows it', () => {
    const ws = run({ extraTrend: 0.5 }, seed)
    expect(estimates(ws).did).toBeGreaterThan(0)
    expect(preTrend(ws)).toBeGreaterThan(0.3)
  })
})
