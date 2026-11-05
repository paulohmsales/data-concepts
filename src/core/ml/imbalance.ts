import { normal, type Rng } from '../random.ts'
import { sigmoid, solve } from './linalg.ts'

/** One feature: negatives ~ N(0, 1), positives ~ N(separation, 1); positives are rare. */
export interface Point {
  x: number
  y: 0 | 1
}

export function simulate(n: number, prevalence: number, separation: number, rng: Rng): Point[] {
  return Array.from({ length: n }, () => {
    const y: 0 | 1 = rng() < prevalence ? 1 : 0
    return { y, x: normal(rng) + (y ? separation : 0) }
  })
}

export interface Logistic {
  a: number
  b: number
  prob: (x: number) => number
}

/**
 * Logistic regression p = σ(a + b·x) by Newton's method, with a weight per class
 * (positiveWeight = 1 is the ordinary fit; > 1 is "class weighting", same effect as oversampling).
 */
export function fitLogistic(data: readonly Point[], positiveWeight = 1): Logistic {
  let a = 0
  let b = 0
  for (let it = 0; it < 30; it++) {
    let g0 = 0
    let g1 = 0
    let h00 = 1e-9
    let h01 = 0
    let h11 = 1e-9
    for (const { x, y } of data) {
      const w = y ? positiveWeight : 1
      const p = sigmoid(a + b * x)
      g0 += w * (y - p)
      g1 += w * (y - p) * x
      const s = w * p * (1 - p)
      h00 += s
      h01 += s * x
      h11 += s * x * x
    }
    const [da, db] = solve([[h00, h01], [h01, h11]], [g0, g1])
    a += da
    b += db
    if (Math.abs(da) + Math.abs(db) < 1e-10) break
  }
  return { a, b, prob: (x) => sigmoid(a + b * x) }
}

/** Undo class weighting: weighting positives by w multiplies the odds by w. */
export const correctForWeight = (p: number, w: number) => p / (p + (1 - p) * w)

export function metrics(data: readonly Point[], predict: (x: number) => boolean) {
  let tp = 0
  let fp = 0
  let fn = 0
  let tn = 0
  for (const d of data) {
    const pr = predict(d.x)
    if (pr && d.y) tp++
    else if (pr) fp++
    else if (d.y) fn++
    else tn++
  }
  return {
    accuracy: (tp + tn) / data.length,
    recall: tp / Math.max(1, tp + fn),
    precision: tp + fp ? tp / (tp + fp) : NaN,
    tp,
    fp,
    fn,
    tn,
  }
}

/** Reliability: mean predicted probability vs observed positive rate, in probability bins. */
export function calibration(data: readonly Point[], prob: (x: number) => number, bins = 10) {
  const sums = Array.from({ length: bins }, () => ({ p: 0, y: 0, n: 0 }))
  for (const d of data) {
    const p = prob(d.x)
    const b = Math.min(bins - 1, Math.floor(p * bins))
    sums[b].p += p
    sums[b].y += d.y
    sums[b].n++
  }
  return sums.filter((s) => s.n >= 20).map((s) => ({ predicted: s.p / s.n, observed: s.y / s.n, n: s.n }))
}
