import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../src/core/random.ts'
import { replicate, type SwitchParams } from '../../src/core/switchback.ts'

const base: SwitchParams = { capacity: 1.1, lift: 0.2, days: 14, blockSlots: 2, noise: 0.1 }
const run = (p: Partial<SwitchParams>) => replicate({ ...base, ...p }, 200, mulberry32(1))

describe('interference in a marketplace', () => {
  it('with scarce supply, a user-level A/B reports the demand lift, not the market effect', () => {
    const r = run({})
    expect(r.userAB.mean).toBeCloseTo(0.2, 6)
    expect(r.truth).toBeLessThan(0.12)
  })
  it('switchbacks are unbiased for the market effect', () => {
    for (const capacity of [0.8, 1.1, 3]) {
      const r = run({ capacity })
      expect(Math.abs(r.switchback.mean - r.truth)).toBeLessThan(0.015)
    }
  })
  it('with plenty of supply there is no interference', () => {
    const r = run({ capacity: 3 })
    expect(Math.abs(r.truth - 0.2)).toBeLessThan(0.005)
  })
  it('more days narrow the switchback estimate', () => {
    expect(run({ days: 28 }).switchback.sd).toBeLessThan(run({ days: 7 }).switchback.sd)
  })
})
