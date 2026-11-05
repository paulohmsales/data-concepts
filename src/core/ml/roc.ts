import { normal, type Rng } from '../random.ts'

/** Scores from a classifier: negatives ~ N(0, 1), positives ~ N(separation, 1). */
export interface Scored {
  score: number
  label: 0 | 1
}

export function simulateScores(n: number, prevalence: number, separation: number, rng: Rng): Scored[] {
  return Array.from({ length: n }, () => {
    const label: 0 | 1 = rng() < prevalence ? 1 : 0
    return { label, score: normal(rng) + (label ? separation : 0) }
  })
}

export interface Confusion {
  threshold: number
  tp: number
  fp: number
  tn: number
  fn: number
  tpr: number
  fpr: number
  precision: number
  accuracy: number
  f1: number
}

export function confusion(data: readonly Scored[], threshold: number): Confusion {
  let tp = 0
  let fp = 0
  let tn = 0
  let fn = 0
  for (const d of data) {
    const pred = d.score >= threshold
    if (pred && d.label) tp++
    else if (pred) fp++
    else if (d.label) fn++
    else tn++
  }
  const tpr = tp / Math.max(1, tp + fn)
  const precision = tp + fp ? tp / (tp + fp) : NaN
  return {
    threshold,
    tp,
    fp,
    tn,
    fn,
    tpr,
    fpr: fp / Math.max(1, fp + tn),
    precision,
    accuracy: (tp + tn) / data.length,
    f1: tp ? (2 * tp) / (2 * tp + fp + fn) : 0,
  }
}

/** Every distinct threshold, high to low: the ROC and precision–recall curves. */
export function curve(data: readonly Scored[]): Confusion[] {
  const sorted = [...data].sort((a, b) => b.score - a.score)
  const P = sorted.filter((d) => d.label).length
  const N = sorted.length - P
  let tp = 0
  let fp = 0
  const out: Confusion[] = [{ threshold: Infinity, tp: 0, fp: 0, tn: N, fn: P, tpr: 0, fpr: 0, precision: NaN, accuracy: N / sorted.length, f1: 0 }]
  for (const d of sorted) {
    if (d.label) tp++
    else fp++
    out.push({
      threshold: d.score,
      tp,
      fp,
      tn: N - fp,
      fn: P - tp,
      tpr: tp / P,
      fpr: fp / N,
      precision: tp / (tp + fp),
      accuracy: (tp + N - fp) / sorted.length,
      f1: (2 * tp) / (2 * tp + fp + (P - tp)),
    })
  }
  return out
}

/** Area under the ROC curve (trapezoids). Theory for these normals: Φ(separation / √2). */
export function auc(points: readonly Confusion[]): number {
  let a = 0
  for (let i = 1; i < points.length; i++) a += ((points[i].fpr - points[i - 1].fpr) * (points[i].tpr + points[i - 1].tpr)) / 2
  return a
}

/** Threshold minimising total cost = costFP·FP + costFN·FN. */
export function cheapestThreshold(points: readonly Confusion[], costFP: number, costFN: number): Confusion {
  return points.reduce((best, p) => (costFP * p.fp + costFN * p.fn < costFP * best.fp + costFN * best.fn ? p : best))
}
