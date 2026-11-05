import { normal, type Rng } from '../random.ts'

/**
 * Leakage: information from the test data (or from the label itself) reaching the model.
 * Data: n rows, p features of pure noise, a random binary label; optionally a few real signal
 * features and a "leaky" feature computed from the label.
 */
export interface LeakParams {
  n: number
  p: number
  /** Number of features that truly carry signal (mean shift `signal` between classes). */
  informative: number
  signal: number
  /** Add a feature derived from the label (e.g. "refund issued" when predicting fraud). */
  targetLeak: boolean
  /** Features kept by the selection step. */
  k: number
  folds: number
}

export interface Dataset {
  X: number[][]
  y: number[]
}

export function makeData(p: LeakParams, rng: Rng): Dataset {
  const y = Array.from({ length: p.n }, (_, i) => i % 2)
  const X = y.map((label) => {
    const row = Array.from({ length: p.p }, (_, j) => normal(rng) + (j < p.informative && label ? p.signal : 0))
    // e.g. refund amount when predicting fraud: big, and only there because of the label
    if (p.targetLeak) row.push(3 * label + 0.5 * normal(rng))
    return row
  })
  return { X, y }
}

/** |point-biserial correlation| of each feature with the label, on the given rows. */
function scores(d: Dataset, rows: readonly number[]): number[] {
  const m = d.X[0].length
  const out = new Array<number>(m).fill(0)
  for (let j = 0; j < m; j++) {
    let s0 = 0
    let s1 = 0
    let n0 = 0
    let n1 = 0
    let ss = 0
    for (const i of rows) {
      const v = d.X[i][j]
      ss += v * v
      if (d.y[i]) {
        s1 += v
        n1++
      } else {
        s0 += v
        n0++
      }
    }
    const mean = (s0 + s1) / rows.length
    const sd = Math.sqrt(ss / rows.length - mean * mean) || 1
    out[j] = Math.abs(s1 / n1 - s0 / n0) / sd
  }
  return out
}

const topK = (s: number[], k: number) => s.map((v, j) => [v, j] as const).sort((a, b) => b[0] - a[0]).slice(0, k).map(([, j]) => j)

/** Nearest-centroid classifier on the chosen features. */
function centroidAccuracy(d: Dataset, train: readonly number[], test: readonly number[], feats: readonly number[]): number {
  const c = [0, 1].map((cls) => {
    const rows = train.filter((i) => d.y[i] === cls)
    return feats.map((j) => rows.reduce((s, i) => s + d.X[i][j], 0) / rows.length)
  })
  let correct = 0
  for (const i of test) {
    const dist = c.map((cen) => feats.reduce((s, j, f) => s + (d.X[i][j] - cen[f]) ** 2, 0))
    if ((dist[1] < dist[0] ? 1 : 0) === d.y[i]) correct++
  }
  return correct / test.length
}

/**
 * k-fold cross-validated accuracy.
 * leaky: pick the top-k features using ALL rows, then cross-validate (the selection saw the test folds).
 * proper: inside each fold, pick features using only that fold's training rows.
 */
export function crossValidate(d: Dataset, k: number, folds: number, mode: 'leaky' | 'proper'): number {
  const n = d.y.length
  const all = Array.from({ length: n }, (_, i) => i)
  const globalFeats = topK(scores(d, all), k)
  let acc = 0
  for (let f = 0; f < folds; f++) {
    const test = all.filter((i) => i % folds === f)
    const train = all.filter((i) => i % folds !== f)
    const feats = mode === 'leaky' ? globalFeats : topK(scores(d, train), k)
    acc += centroidAccuracy(d, train, test, feats)
  }
  return acc / folds
}

/** Accuracy on genuinely new data from the same process (what production will see). */
export function freshAccuracy(train: Dataset, fresh: Dataset, k: number): number {
  const all = train.y.map((_, i) => i)
  const feats = topK(scores(train, all), k)
  const merged: Dataset = { X: [...train.X, ...fresh.X], y: [...train.y, ...fresh.y] }
  const test = fresh.y.map((_, i) => train.y.length + i)
  return centroidAccuracy(merged, all, test, feats)
}
