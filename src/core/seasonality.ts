import { normal, type Rng } from './random.ts'

/**
 * A daily metric = trend + yearly season + weekly pattern + noise (additive).
 * Day 0 is a Monday, 1 January.
 */
export interface SeriesParams {
  days: number
  level: number
  /** Growth per year (absolute units). */
  trendPerYear: number
  /** Amplitude of the yearly cycle, peaking around day 340 (December). */
  yearly: number
  /** Weekend effect (Saturday and Sunday are this much lower). */
  weekend: number
  noise: number
}

export const weekdayEffect = (day: number, weekend: number) => {
  const dow = day % 7 // 0 Monday … 6 Sunday
  // centred so the week sums to zero
  return dow >= 5 ? -weekend * (5 / 7) : weekend * (2 / 7)
}

export const yearlyEffect = (day: number, amp: number) => amp * Math.cos((2 * Math.PI * (day - 340)) / 365)

export interface Point {
  day: number
  value: number
  trend: number
  yearly: number
  weekly: number
}

export function simulateSeries(p: SeriesParams, rng: Rng): Point[] {
  return Array.from({ length: p.days }, (_, day) => {
    const trend = p.level + (p.trendPerYear * day) / 365
    const yearly = yearlyEffect(day, p.yearly)
    const weekly = weekdayEffect(day, p.weekend)
    return { day, value: trend + yearly + weekly + p.noise * normal(rng), trend, yearly, weekly }
  })
}

/** Centred moving average (trailing for even windows: the last `w` days). NaN where incomplete. */
export function movingAverage(xs: readonly number[], w: number, centred = false): number[] {
  const out = new Array<number>(xs.length).fill(NaN)
  let s = 0
  for (let i = 0; i < xs.length; i++) {
    s += xs[i]
    if (i >= w) s -= xs[i - w]
    if (i >= w - 1) {
      const at = centred ? i - Math.floor((w - 1) / 2) : i
      out[at] = s / w
    }
  }
  return out
}

/** Classical estimate of the weekly pattern: mean of (value − 7-day centred MA) per weekday, centred. */
export function weeklyPattern(xs: readonly number[]): number[] {
  const ma = movingAverage(xs, 7, true)
  const sums = new Array<number>(7).fill(0)
  const counts = new Array<number>(7).fill(0)
  xs.forEach((x, i) => {
    if (Number.isNaN(ma[i])) return
    sums[i % 7] += x - ma[i]
    counts[i % 7]++
  })
  const raw = sums.map((s, d) => s / counts[d])
  const m = raw.reduce((a, b) => a + b, 0) / 7
  return raw.map((r) => r - m)
}

/** How much weekly wiggle a trailing w-day average leaves: its range over one week of a pure weekly signal. */
export function weeklyRipple(w: number, weekend: number): number {
  const xs = Array.from({ length: 7 * 20 }, (_, d) => weekdayEffect(d, weekend))
  const ma = movingAverage(xs, w).slice(7 * 10)
  return Math.max(...ma) - Math.min(...ma)
}

/** Sum of values per calendar month (30-day buckets keep the toy calendar simple: 12 × 30 + 5). */
export function monthlyTotals(points: readonly Point[]): { month: number; total: number }[] {
  const out: { month: number; total: number }[] = []
  for (let start = 0; start + 30 <= points.length; ) {
    const year = Math.floor(start / 365)
    const inYear = start - year * 365
    const len = inYear >= 330 ? 365 - inYear : 30 // the last "month" of a year takes the leftovers
    const slice = points.slice(start, start + len)
    if (slice.length < len) break
    out.push({ month: out.length, total: slice.reduce((s, p) => s + p.value, 0) / len })
    start += len
  }
  return out
}
