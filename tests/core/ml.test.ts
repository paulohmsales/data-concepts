import { describe, expect, it } from 'vitest'
import { normalCdf } from '../../src/core/abtest.ts'
import { descend, maxStableLr, surface } from '../../src/core/ml/gd.ts'
import { calibration, correctForWeight, fitLogistic, metrics, simulate } from '../../src/core/ml/imbalance.ts'
import { crossValidate, freshAccuracy, makeData, type LeakParams } from '../../src/core/ml/leakage.ts'
import { biasVariance, fitPoly, mse, sampleData } from '../../src/core/ml/poly.ts'
import { auc, cheapestThreshold, confusion, curve, simulateScores } from '../../src/core/ml/roc.ts'
import { mulberry32 } from '../../src/core/random.ts'

describe('polynomial fits and bias–variance', () => {
  it('recovers an exact cubic', () => {
    const data = Array.from({ length: 20 }, (_, i) => {
      const x = -1 + i / 10
      return { x, y: 1 - 2 * x + 0.5 * x ** 3 }
    })
    const m = fitPoly(data, 3)
    expect(m.predict(0.3)).toBeCloseTo(1 - 0.6 + 0.5 * 0.027, 8)
  })

  it('degree n − 1 interpolates the training data (train error ≈ 0)', () => {
    const data = sampleData(10, 0.3, mulberry32(1))
    expect(mse(fitPoly(data, 9), data)).toBeLessThan(1e-6)
  })

  it('bias falls and variance rises with degree', () => {
    const lo = biasVariance(1, 30, 0.3, 200, mulberry32(2))
    const hi = biasVariance(7, 30, 0.3, 200, mulberry32(2))
    expect(hi.bias2).toBeLessThan(lo.bias2)
    expect(hi.variance).toBeGreaterThan(lo.variance * 3)
  })

  it('bias² + variance + noise² ≈ expected test error', () => {
    const rng = mulberry32(3)
    const bv = biasVariance(4, 30, 0.3, 300, rng)
    const test = sampleData(4000, 0.3, mulberry32(4)).filter((d) => d.x >= -0.9 && d.x <= 0.9)
    const avgTest = bv.fits.reduce((s, m) => s + mse(m, test), 0) / bv.fits.length
    expect(avgTest / (bv.bias2 + bv.variance + bv.noise2)).toBeGreaterThan(0.85)
    expect(avgTest / (bv.bias2 + bv.variance + bv.noise2)).toBeLessThan(1.15)
  })
})

describe('leakage', () => {
  const p: LeakParams = { n: 60, p: 1000, informative: 0, signal: 0, targetLeak: false, k: 20, folds: 5 }

  it('selecting features on all the data makes pure noise look predictive', () => {
    const d = makeData(p, mulberry32(5))
    expect(crossValidate(d, p.k, p.folds, 'leaky')).toBeGreaterThan(0.8)
  })

  it('selecting inside each fold gives chance accuracy', () => {
    let acc = 0
    for (let s = 0; s < 10; s++) acc += crossValidate(makeData(p, mulberry32(10 + s)), p.k, p.folds, 'proper')
    expect(acc / 10).toBeGreaterThan(0.38)
    expect(acc / 10).toBeLessThan(0.62)
  })

  it('a feature computed from the label gives near-perfect scores that won’t exist in production', () => {
    const d = makeData({ ...p, targetLeak: true, p: 50 }, mulberry32(6))
    expect(crossValidate(d, 5, 5, 'proper')).toBeGreaterThan(0.9)
  })

  it('with real signal, the proper pipeline still finds it, and fresh data agrees', () => {
    const q = { ...p, n: 200, p: 200, informative: 10, signal: 0.8 }
    const d = makeData(q, mulberry32(7))
    const cv = crossValidate(d, 10, 5, 'proper')
    const fresh = freshAccuracy(d, makeData(q, mulberry32(8)), 10)
    expect(cv).toBeGreaterThan(0.7)
    expect(Math.abs(cv - fresh)).toBeLessThan(0.1)
  })
})

describe('gradient descent', () => {
  it('converges on the bowl below the stability limit, diverges above it', () => {
    const s = surface('bowl', 10)
    const ok = descend(s, [-2, 4], 0.95 * maxStableLr(10), 500)
    expect(ok.diverged).toBe(false)
    expect(ok.path.at(-1)!.w1).toBeCloseTo(3, 3)
    expect(descend(s, [-2, 4], 1.05 * maxStableLr(10), 500).diverged).toBe(true)
  })

  it('ill-conditioning slows convergence', () => {
    const fast = descend(surface('bowl', 1), [-2, 4], 0.9, 2000)
    const slow = descend(surface('bowl', 50), [-2, 4], 0.9 * maxStableLr(50), 2000)
    expect(slow.convergedAt).toBeGreaterThan(fast.convergedAt * 10)
  })

  it('momentum speeds up the narrow valley', () => {
    const s = surface('bowl', 50)
    const plain = descend(s, [-2, 4], 0.03, 3000)
    const heavy = descend(s, [-2, 4], 0.03, 3000, 0.8)
    expect(heavy.convergedAt).toBeLessThan(plain.convergedAt / 2)
  })

  it('non-convex: the start decides which valley you end in', () => {
    const s = surface('valleys', 1)
    expect(descend(s, [1.5, 1], 0.05, 1000).path.at(-1)!.w1).toBeGreaterThan(0.5)
    expect(descend(s, [-1.5, 1], 0.05, 1000).path.at(-1)!.w1).toBeLessThan(-0.5)
  })
})

describe('ROC and thresholds', () => {
  const data = simulateScores(20_000, 0.3, 1.5, mulberry32(9))

  it('AUC matches Φ(d/√2)', () => {
    expect(auc(curve(data))).toBeCloseTo(normalCdf(1.5 / Math.SQRT2), 2)
  })

  it('precision depends on prevalence; TPR and FPR do not', () => {
    const rare = simulateScores(20_000, 0.02, 1.5, mulberry32(10))
    const a = confusion(data, 1)
    const b = confusion(rare, 1)
    expect(Math.abs(a.tpr - b.tpr)).toBeLessThan(0.03)
    expect(Math.abs(a.fpr - b.fpr)).toBeLessThan(0.02)
    expect(b.precision).toBeLessThan(a.precision / 2)
  })

  it('expensive misses push the cheapest threshold down', () => {
    const pts = curve(data)
    expect(cheapestThreshold(pts, 1, 10).threshold).toBeLessThan(cheapestThreshold(pts, 10, 1).threshold)
  })
})

describe('class imbalance', () => {
  const data = simulate(20_000, 0.02, 2, mulberry32(11))

  it('predicting "never" is 98% accurate and useless', () => {
    const m = metrics(data, () => false)
    expect(m.accuracy).toBeCloseTo(0.98, 2)
    expect(m.recall).toBe(0)
  })

  it('a plain logistic model at 0.5 misses most positives but is calibrated', () => {
    const lr = fitLogistic(data)
    expect(metrics(data, (x) => lr.prob(x) >= 0.5).recall).toBeLessThan(0.3)
    const meanP = data.reduce((s, d) => s + lr.prob(d.x), 0) / data.length
    expect(meanP).toBeCloseTo(0.02, 2)
  })

  it('class weights raise recall but inflate probabilities; the correction undoes it', () => {
    const w = 0.98 / 0.02
    const weighted = fitLogistic(data, w)
    expect(metrics(data, (x) => weighted.prob(x) >= 0.5).recall).toBeGreaterThan(0.7)
    const meanP = data.reduce((s, d) => s + weighted.prob(d.x), 0) / data.length
    expect(meanP).toBeGreaterThan(0.2)
    const fixed = data.reduce((s, d) => s + correctForWeight(weighted.prob(d.x), w), 0) / data.length
    expect(fixed).toBeCloseTo(0.02, 2)
  })

  it('calibration bins of the plain model sit near the diagonal', () => {
    const lr = fitLogistic(data)
    for (const b of calibration(data, lr.prob).filter((b) => b.n >= 200)) expect(Math.abs(b.predicted - b.observed)).toBeLessThan(0.08)
  })
})
