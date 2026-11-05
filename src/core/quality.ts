import { normal, type Rng } from './random.ts'

/**
 * Volume monitoring. 90 days of daily row counts (day 0 is a Monday) with weekly seasonality, slow
 * growth and noise, plus four injected incidents. Three detectors decide which days to alert on.
 */
export const DAYS = 90
const WEEKDAY = [1.0, 1.04, 1.0, 1.02, 1.08, 0.6, 0.55]
const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export const INCIDENTS = [
  { day: 38, factor: 0.6, label: 'partial load (40% missing)', short: 'partial' },
  { day: 57, factor: 2, label: 'duplicate load (2×)', short: 'duplicate' },
  { day: 72, factor: 0.85, label: 'subtle drop (15% missing)', short: '−15%' },
  { day: 82, factor: 0.6, label: 'weekend partial load', short: 'weekend partial' },
] as const

export interface Day {
  day: number
  weekday: string
  count: number
  incident: string | null
  short: string | null
}

export function dailyCounts(rng: Rng, noise = 0.03): Day[] {
  return Array.from({ length: DAYS }, (_, d) => {
    const inc = INCIDENTS.find((i) => i.day === d)
    const base = 10_000 * (1 + 0.002 * d) * WEEKDAY[d % 7] * (1 + noise * normal(rng))
    return { day: d, weekday: WEEKDAY_NAMES[d % 7], count: Math.round(base * (inc?.factor ?? 1)), incident: inc?.label ?? null, short: inc?.short ?? null }
  })
}

/** A hand-set upper bound: about twice a normal weekday. */
export const STATIC_CEILING = 20_000

export type Detector ='static' | 'zscore' | 'seasonal'

export interface DetectorParams {
  /** static: alert when the count is below this many rows (or above STATIC_CEILING). */
  floor: number
  /** zscore: alert when |z| against the trailing 28 days exceeds k. */
  k: number
  /** seasonal: alert when the count is off by more than this fraction from the median of the last 4 same weekdays. */
  tolerance: number
}

export interface Check {
  day: number
  expectedLow: number | null
  expectedHigh: number | null
  alert: boolean
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Evaluate one detector on every day that has enough history (28 days). */
export function detect(days: Day[], det: Detector, p: DetectorParams): Check[] {
  return days.map((d) => {
    if (d.day < 28) return { day: d.day, expectedLow: null, expectedHigh: null, alert: false }
    let low: number
    let high: number
    if (det === 'static') {
      low = p.floor
      high = STATIC_CEILING
    } else if (det === 'zscore') {
      const w = days.slice(d.day - 28, d.day).map((x) => x.count)
      const mean = w.reduce((a, b) => a + b, 0) / w.length
      const sd = Math.sqrt(w.reduce((a, b) => a + (b - mean) ** 2, 0) / (w.length - 1))
      low = mean - p.k * sd
      high = mean + p.k * sd
    } else {
      const same = [7, 14, 21, 28].map((lag) => days[d.day - lag].count)
      const m = median(same)
      low = m * (1 - p.tolerance)
      high = m * (1 + p.tolerance)
    }
    return { day: d.day, expectedLow: low, expectedHigh: high, alert: d.count < low || d.count > high }
  })
}

export interface Score {
  caught: number
  missed: string[]
  falseAlarms: number
}

export function score(days: Day[], checks: Check[]): Score {
  let caught = 0
  let falseAlarms = 0
  const missed: string[] = []
  for (const c of checks) {
    if (c.day < 28) continue
    const inc = days[c.day].incident
    if (inc && c.alert) caught++
    else if (inc) missed.push(inc)
    else if (c.alert) falseAlarms++
  }
  return { caught, missed, falseAlarms }
}
