import { describe, expect, it } from 'vitest'
import { DEFAULTS, simulate } from '../../src/core/buildBuy.ts'

describe('build vs buy', () => {
  it('by default buying wins: value starts months earlier', () => {
    const r = simulate(DEFAULTS)
    expect(r.buyNet).toBeGreaterThan(r.buildNet * 2)
    expect(r.crossover).toBeNull()
  })
  it('an expensive licence makes building win, but only after about two years', () => {
    const r = simulate({ ...DEFAULTS, licencePerMonth: 25_000 })
    expect(r.buildNet).toBeGreaterThan(r.buyNet)
    expect(r.crossover).toBeGreaterThan(18)
  })
  it('overruns, maintenance and opportunity cost each sink the build case', () => {
    expect(simulate({ ...DEFAULTS, buildMonths: 12 }).buildNet).toBeLessThan(0)
    expect(simulate({ ...DEFAULTS, maintFte: 2.5 }).buildNet).toBeLessThan(0)
    expect(simulate({ ...DEFAULTS, opportunity: 30_000 }).buildNet).toBeLessThan(-500_000)
  })
})
