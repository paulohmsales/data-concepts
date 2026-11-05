import { describe, expect, it } from 'vitest'
import { analyze, simulateMany, simulateUnits } from '../../src/core/cuped.ts'
import { adjust, errorRates, familywise } from '../../src/core/multiple.ts'
import { mulberry32 } from '../../src/core/random.ts'
import { simulateLeak, srmTest } from '../../src/core/srm.ts'
import { mean } from '../../src/core/stats.ts'

describe('multiple comparisons', () => {
  const p = [0.01, 0.02, 0.03, 0.04, 0.05]
  const close = (a: number[], b: number[]) => a.forEach((x, i) => expect(x).toBeCloseTo(b[i], 12))
  it('matches R p.adjust', () => {
    close(adjust(p, 'bonferroni'), [0.05, 0.1, 0.15, 0.2, 0.25])
    close(adjust(p, 'holm'), [0.05, 0.08, 0.09, 0.09, 0.09])
    close(adjust(p, 'bh'), [0.05, 0.05, 0.05, 0.05, 0.05])
    // order of the input doesn't matter
    close(adjust([0.04, 0.01, 0.05, 0.03, 0.02], 'holm'), [0.09, 0.05, 0.09, 0.09, 0.08])
  })

  it('no correction: P(any false positive) = 1 − (1 − α)^m', () => {
    const r = errorRates({ m: 20, real: 0, effectZ: 0, alpha: 0.05 }, 'none', 4000, mulberry32(1))
    expect(r.fwer).toBeCloseTo(familywise(20, 0.05), 1)
    expect(familywise(20, 0.05)).toBeCloseTo(0.6415, 4)
  })

  it('Bonferroni and Holm hold the family-wise rate at α', () => {
    for (const m of ['bonferroni', 'holm'] as const) {
      const r = errorRates({ m: 20, real: 5, effectZ: 3, alpha: 0.05 }, m, 4000, mulberry32(2))
      expect(r.fwer).toBeLessThan(0.06)
    }
  })

  it('BH holds the false discovery rate at α and keeps more power than Bonferroni', () => {
    const params = { m: 50, real: 10, effectZ: 3, alpha: 0.05 }
    const bh = errorRates(params, 'bh', 3000, mulberry32(3))
    const bonf = errorRates(params, 'bonferroni', 3000, mulberry32(3))
    expect(bh.fdr).toBeLessThan(0.05)
    expect(bh.power).toBeGreaterThan(bonf.power + 0.1)
  })
})

describe('sample ratio mismatch', () => {
  it('chi-square on arm sizes (hand-checked)', () => {
    const r = srmTest([5050, 4950], [0.5, 0.5])
    expect(r.chi2).toBeCloseTo(1, 12)
    expect(r.p).toBeCloseTo(0.3173, 4)
    expect(srmTest([50_250, 49_750], [0.5, 0.5]).p).toBeCloseTo(0.1138, 4)
  })

  it('a leak of low-intent B users makes a useless B "win", and SRM catches it', () => {
    const r = simulateLeak({ n: 100_000, baseline: 0.1, lift: 0, leak: 0.1 }, mulberry32(4))
    expect(r.ab.significant).toBe(true)
    expect(r.ab.diff).toBeGreaterThan(0)
    expect(r.srm.p).toBeLessThan(1e-6)
  })

  it('without a leak, SRM p-values are uniform: flags ~1% at p < 0.01', () => {
    const rng = mulberry32(5)
    let flagged = 0
    for (let i = 0; i < 4000; i++) if (simulateLeak({ n: 10_000, baseline: 0.1, lift: 0, leak: 0 }, rng).srm.p < 0.01) flagged++
    expect(flagged / 4000).toBeGreaterThan(0.005)
    expect(flagged / 4000).toBeLessThan(0.016)
  })
})

describe('CUPED', () => {
  it('variance shrinks by 1 − ρ²', () => {
    const r = analyze(simulateUnits({ n: 20_000, rho: 0.7, effect: 0.05, leak: 0 }, mulberry32(6)))
    expect(r.varianceRatio).toBeCloseTo(1 - 0.49, 1)
    expect(r.theta).toBeCloseTo(0.7, 1)
  })

  it('stays unbiased with a pre-period covariate', () => {
    const runs = simulateMany({ n: 1000, rho: 0.7, effect: 0.1, leak: 0 }, 400, mulberry32(7))
    expect(mean(runs.map((r) => r.cuped.diff))).toBeCloseTo(0.1, 2)
  })

  it('a covariate affected by the treatment absorbs part of the effect', () => {
    const runs = simulateMany({ n: 1000, rho: 0.7, effect: 0.1, leak: 1 }, 400, mulberry32(8))
    expect(mean(runs.map((r) => r.raw.diff))).toBeCloseTo(0.1, 2)
    expect(mean(runs.map((r) => r.cuped.diff))).toBeLessThan(0.06)
  })
})
