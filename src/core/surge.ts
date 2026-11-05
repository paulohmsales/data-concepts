import type { Rng } from './random.ts'

/**
 * Surge pricing on a 16×16 grid of base cells over 120 minutes. Demand per base cell is Poisson
 * (0.5 requests/min); drivers there can serve 0.6/min. A concert lets out at minute 60 and four
 * base cells get 5× demand for 20 minutes. The pricing job estimates the demand rate per cell over
 * a sliding window and turns the demand/capacity ratio into a multiplier.
 */
export const GRID = 16
export const MINUTES = 120
export const BASE_DEMAND = 0.5
export const CAPACITY = 0.6
export const EVENT = { start: 60, end: 80, cells: [6, 7], factor: 5 } as const
const K = 0.5
export const MAX_MULT = 3

export interface SurgeParams {
  /** sliding window, minutes */
  window: number
  /** pricing cell size, in base cells per side (1, 2 or 4) */
  cell: number
}

const isEvent = (x: number, y: number) => (EVENT.cells as readonly number[]).includes(x) && (EVENT.cells as readonly number[]).includes(y)

function poisson(rng: Rng, lambda: number): number {
  const L = Math.exp(-lambda)
  let k = 0
  let p = 1
  do {
    k++
    p *= rng()
  } while (p > L)
  return k - 1
}

/** counts[t][y][x]: requests per base cell per minute. */
export function demand(rng: Rng): number[][][] {
  return Array.from({ length: MINUTES }, (_, t) =>
    Array.from({ length: GRID }, (_, y) =>
      Array.from({ length: GRID }, (_, x) => poisson(rng, BASE_DEMAND * (isEvent(x, y) && t >= EVENT.start && t < EVENT.end ? EVENT.factor : 1))),
    ),
  )
}

export const multiplier = (rate: number, capacity: number) => Math.min(MAX_MULT, Math.max(1, 1 + K * (rate / capacity - 1)))

/** mult[t][cy][cx] for pricing cells of the given size. */
export function surgeGrid(counts: number[][][], p: SurgeParams): number[][][] {
  const n = GRID / p.cell
  const cap = CAPACITY * p.cell * p.cell
  // per-minute totals per pricing cell
  const agg = counts.map((g) =>
    Array.from({ length: n }, (_, cy) =>
      Array.from({ length: n }, (_, cx) => {
        let s = 0
        for (let y = cy * p.cell; y < (cy + 1) * p.cell; y++) for (let x = cx * p.cell; x < (cx + 1) * p.cell; x++) s += g[y][x]
        return s
      }),
    ),
  )
  return agg.map((_, t) =>
    Array.from({ length: n }, (_, cy) =>
      Array.from({ length: n }, (_, cx) => {
        const from = Math.max(0, t - p.window + 1)
        let s = 0
        for (let u = from; u <= t; u++) s += agg[u][cy][cx]
        return multiplier(s / (t - from + 1), cap)
      }),
    ),
  )
}

export interface SurgeStats {
  /** mean multiplier riders at the concert see during minutes 65–80 */
  eventMult: number
  /** minutes after the concert ends until its cell's surge rises to 1.5 (Infinity if never) */
  lag: number
  /** minutes after the crowd has gone (minute 80) until surge drops below 1.25 */
  linger: number
  /** share of calm cell-minutes (away from the event) showing surge ≥ 1.25 */
  falseSurge: number
  /** the concert's pricing cell, for highlighting */
  eventCell: [number, number]
}

export function surgeStats(mult: number[][][], p: SurgeParams): SurgeStats {
  const ex = Math.floor(EVENT.cells[0] / p.cell)
  const series = mult.map((g) => g[ex][ex])
  const during = series.slice(65, 80)
  const eventMult = during.reduce((a, b) => a + b, 0) / during.length
  const firstHigh = series.findIndex((m, t) => t >= EVENT.start && m >= 1.5)
  const lag = firstHigh < 0 ? Infinity : firstHigh - EVENT.start
  let linger = 0
  while (EVENT.end + linger < MINUTES && series[EVENT.end + linger] >= 1.25) linger++
  let calm = 0
  let high = 0
  const n = GRID / p.cell
  for (let t = 20; t < MINUTES; t++)
    for (let cy = 0; cy < n; cy++)
      for (let cx = 0; cx < n; cx++) {
        // skip any pricing cell that contains part of the event
        const touches = (EVENT.cells as readonly number[]).some((v) => Math.floor(v / p.cell) === cy) && (EVENT.cells as readonly number[]).some((v) => Math.floor(v / p.cell) === cx)
        if (touches) continue
        calm++
        if (mult[t][cy][cx] >= 1.25) high++
      }
  return { eventMult, lag, linger, falseSurge: high / calm, eventCell: [ex, ex] }
}
