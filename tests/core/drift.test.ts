import { describe, expect, it } from 'vitest'
import { aucOf, psi, simulateDrift, type DriftParams } from '../../src/core/ml/drift.ts'
import { mulberry32 } from '../../src/core/random.ts'

const base: DriftParams = { covariateShift: 0, conceptDrift: 0, labelDelay: 4, retrainEvery: 0, seed: 1 }
const end = (p: Partial<DriftParams>, seed = 1) => simulateDrift({ ...base, ...p, seed }, mulberry32(seed)).at(-1)!

describe('helpers', () => {
  it('AUC is 1 for perfect ranking and 0.5 for none', () => {
    expect(aucOf([0.1, 0.2, 0.8, 0.9], [0, 0, 1, 1])).toBe(1)
    expect(aucOf([0.5, 0.5, 0.5, 0.5], [0, 1, 0, 1])).toBeCloseTo(0.5, 9)
  })
  it('PSI is ~0 for the training distribution and large for a shifted one', () => {
    const r = mulberry32(3)
    const xs = Array.from({ length: 5000 }, () => Math.sqrt(-2 * Math.log(r())) * Math.cos(2 * Math.PI * r()))
    expect(psi(xs)).toBeLessThan(0.02)
    expect(psi(xs.map((x) => x + 1))).toBeGreaterThan(0.25)
  })
})

describe.each([1, 2])('drift (seed %i)', (seed) => {
  it('covariate shift trips PSI while the model keeps working', () => {
    const w = end({ covariateShift: 1.5 }, seed)
    expect(w.psi).toBeGreaterThan(1)
    expect(w.auc).toBeGreaterThan(0.82)
  })
  it('concept drift is invisible to PSI but destroys accuracy', () => {
    const w = end({ conceptDrift: 1 }, seed)
    expect(w.psi).toBeLessThan(0.05)
    expect(w.auc).toBeLessThan(0.62)
  })
  it('retraining recovers, and fresher labels recover more', () => {
    const fresh = end({ conceptDrift: 1, retrainEvery: 2, labelDelay: 0 }, seed)
    const late = end({ conceptDrift: 1, retrainEvery: 2, labelDelay: 8 }, seed)
    expect(fresh.auc).toBeGreaterThan(0.84)
    expect(late.auc).toBeLessThan(fresh.auc)
    expect(late.auc).toBeGreaterThan(end({ conceptDrift: 1 }, seed).auc + 0.1)
  })
})
