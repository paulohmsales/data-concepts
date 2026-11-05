import { normal, type Rng } from '../random.ts'
import { solve } from './linalg.ts'

/** The true function the models try to learn, on x ∈ [−1, 1]. */
export const truth = (x: number) => Math.sin(Math.PI * x)

export interface Sample {
  x: number
  y: number
}

export const sampleData = (n: number, noise: number, rng: Rng): Sample[] =>
  Array.from({ length: n }, () => {
    const x = 2 * rng() - 1
    return { x, y: truth(x) + noise * normal(rng) }
  })

/** Legendre polynomials P0..Pd at x (well conditioned on [−1, 1], unlike raw powers). */
function legendre(x: number, d: number): number[] {
  const p = [1, x]
  for (let k = 1; k < d; k++) p.push(((2 * k + 1) * x * p[k] - k * p[k - 1]) / (k + 1))
  return p.slice(0, d + 1)
}

export interface PolyModel {
  degree: number
  coef: number[]
  predict: (x: number) => number
}

/** Least squares polynomial fit of the given degree, with optional ridge penalty λ. */
export function fitPoly(data: readonly Sample[], degree: number, lambda = 0): PolyModel {
  const d = degree
  const AtA = Array.from({ length: d + 1 }, () => new Array<number>(d + 1).fill(0))
  const Aty = new Array<number>(d + 1).fill(0)
  for (const { x, y } of data) {
    const phi = legendre(x, d)
    for (let i = 0; i <= d; i++) {
      Aty[i] += phi[i] * y
      for (let j = 0; j <= d; j++) AtA[i][j] += phi[i] * phi[j]
    }
  }
  // tiny jitter keeps over-parameterised fits (degree ≥ n) solvable
  for (let i = 0; i <= d; i++) AtA[i][i] += lambda + 1e-10
  const coef = solve(AtA, Aty)
  return {
    degree,
    coef,
    predict: (x) => legendre(x, d).reduce((s, p, i) => s + p * coef[i], 0),
  }
}

export const mse = (m: PolyModel, data: readonly Sample[]) =>
  data.reduce((s, { x, y }) => s + (m.predict(x) - y) ** 2, 0) / data.length

/**
 * Bias–variance decomposition at a grid of x: fit `reps` models on fresh training sets.
 * Expected test error = bias² + variance + noise².
 */
export function biasVariance(degree: number, n: number, noise: number, reps: number, rng: Rng, lambda = 0) {
  // evaluate inside the data range: right at ±1 high-degree fits extrapolate wildly
  const grid = Array.from({ length: 37 }, (_, i) => -0.9 + i / 20)
  const preds = grid.map(() => [] as number[])
  const fits: PolyModel[] = []
  for (let r = 0; r < reps; r++) {
    const m = fitPoly(sampleData(n, noise, rng), degree, lambda)
    fits.push(m)
    grid.forEach((x, i) => preds[i].push(m.predict(x)))
  }
  let bias2 = 0
  let variance = 0
  grid.forEach((x, i) => {
    const mean = preds[i].reduce((a, b) => a + b, 0) / reps
    const v = preds[i].reduce((s, p) => s + (p - mean) ** 2, 0) / (reps - 1)
    // the average of `reps` fits is itself noisy (variance v / reps); remove that from bias²
    bias2 += Math.max(0, (mean - truth(x)) ** 2 - v / reps)
    variance += v
  })
  return { bias2: bias2 / grid.length, variance: variance / grid.length, noise2: noise * noise, fits, grid }
}
