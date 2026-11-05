import { normal, type Rng } from '../random.ts'
import { sigmoid } from './linalg.ts'

/**
 * Drift monitoring. A two-feature logistic model is trained on week-0 data:
 *   x1, x2 ~ N(0, 1),  P(y=1) = σ(2·x1 + 0.5·x2 − 1).
 * Over 26 weeks the distribution of x1 may shift (covariate drift), and the outcome may come to
 * depend less on x1 and more on x2 (concept drift). Labels arrive `labelDelay` weeks late.
 * Optionally the model is refit every `retrainEvery` weeks on the latest 4 weeks of labels.
 */
export const WEEKS = 26
const N = 1500
const B1 = 2
const B2 = 0.5
const B0 = -1

export interface DriftParams {
  /** how far the mean of x1 moves by week 26 (in training SDs) */
  covariateShift: number
  /** 0 = stable; 1 = by week 26 the outcome depends only on x2 */
  conceptDrift: number
  labelDelay: number
  /** 0 = never */
  retrainEvery: number
  seed: number
}

export interface DriftWeek {
  week: number
  psi: number
  auc: number
  /** mean predicted probability minus actual positive rate */
  calibrationGap: number
  /** weights the model uses this week */
  w1: number
  w2: number
  retrained: boolean
}

/** Rank-based AUC (Mann–Whitney U). */
export function aucOf(scores: number[], labels: number[]): number {
  const idx = scores.map((_, i) => i).sort((a, b) => scores[a] - scores[b])
  let rankSum = 0
  let pos = 0
  // tied scores share the average of their ranks
  for (let start = 0; start < idx.length; ) {
    let end = start
    while (end + 1 < idx.length && scores[idx[end + 1]] === scores[idx[start]]) end++
    const rank = (start + end) / 2 + 1
    for (let k = start; k <= end; k++)
      if (labels[idx[k]]) {
        rankSum += rank
        pos++
      }
    start = end + 1
  }
  const neg = labels.length - pos
  if (pos === 0 || neg === 0) return 0.5
  return (rankSum - (pos * (pos + 1)) / 2) / (pos * neg)
}

/** Population stability index of a sample against standard-normal deciles (the training distribution). */
export function psi(xs: number[]): number {
  const edges = [-1.2816, -0.8416, -0.5244, -0.2533, 0, 0.2533, 0.5244, 0.8416, 1.2816]
  const counts = new Array<number>(10).fill(0)
  for (const x of xs) {
    let b = 0
    while (b < 9 && x > edges[b]) b++
    counts[b]++
  }
  return counts.reduce((a, c) => {
    const actual = Math.max(c / xs.length, 1e-4)
    return a + (actual - 0.1) * Math.log(actual / 0.1)
  }, 0)
}

type Model = [number, number, number] // w1, w2, b

/** Logistic regression on (x1, x2) with an intercept, by Newton's method. */
function fit(rows: { x1: number; x2: number; y: number }[]): Model {
  let w: Model = [0, 0, 0]
  for (let it = 0; it < 25; it++) {
    const g = [0, 0, 0]
    const H = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ]
    for (const r of rows) {
      const f = [r.x1, r.x2, 1]
      const p = sigmoid(w[0] * r.x1 + w[1] * r.x2 + w[2])
      const s = p * (1 - p)
      for (let i = 0; i < 3; i++) {
        g[i] += (r.y - p) * f[i]
        for (let j = 0; j < 3; j++) H[i][j] += s * f[i] * f[j] + (i === j ? 1e-6 : 0)
      }
    }
    const step = solve3(H, g)
    if (!step) break
    w = [w[0] + step[0], w[1] + step[1], w[2] + step[2]]
    if (Math.abs(step[0]) + Math.abs(step[1]) + Math.abs(step[2]) < 1e-8) break
  }
  return w
}

function solve3(A: number[][], b: number[]): number[] | null {
  const M = A.map((row, i) => [...row, b[i]])
  for (let c = 0; c < 3; c++) {
    let piv = c
    for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r
    if (Math.abs(M[piv][c]) < 1e-12) return null
    ;[M[c], M[piv]] = [M[piv], M[c]]
    for (let r = 0; r < 3; r++) {
      if (r === c) continue
      const k = M[r][c] / M[c][c]
      for (let j = c; j < 4; j++) M[r][j] -= k * M[c][j]
    }
  }
  return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]]
}

export function simulateDrift(p: DriftParams, rng: Rng): DriftWeek[] {
  const history: { x1: number; x2: number; y: number }[][] = []
  let model: Model = [B1, B2, B0]
  const out: DriftWeek[] = []
  for (let w = 0; w < WEEKS; w++) {
    const f = w / (WEEKS - 1)
    const mu = p.covariateShift * f
    const b1 = B1 * (1 - p.conceptDrift * f)
    const b2 = B2 + (B1 - B2 / 2) * p.conceptDrift * f
    const rows = Array.from({ length: N }, () => {
      const x1 = mu + normal(rng)
      const x2 = normal(rng)
      return { x1, x2, y: rng() < sigmoid(b1 * x1 + b2 * x2 + B0) ? 1 : 0 }
    })
    history.push(rows)
    let retrained = false
    if (p.retrainEvery > 0 && w > 0 && w % p.retrainEvery === 0) {
      const last = w - p.labelDelay // weeks [0, last) have labels
      if (last >= 1) {
        model = fit(history.slice(Math.max(0, last - 4), last).flat())
        retrained = true
      }
    }
    const scores = rows.map((r) => sigmoid(model[0] * r.x1 + model[1] * r.x2 + model[2]))
    const predicted = scores.reduce((a, s) => a + s, 0) / N
    const actual = rows.reduce((a, r) => a + r.y, 0) / N
    out.push({
      week: w,
      psi: psi(rows.map((r) => r.x1)),
      auc: aucOf(
        scores,
        rows.map((r) => r.y),
      ),
      calibrationGap: predicted - actual,
      w1: model[0],
      w2: model[1],
      retrained,
    })
  }
  return out
}
