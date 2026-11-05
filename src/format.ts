import { format } from 'd3'

export const pct = (x: number, digits = 1) =>
  Number.isFinite(x) ? `${(x * 100).toFixed(digits)}%` : '–'
export const signedPct = (x: number, digits = 1) =>
  Number.isFinite(x) ? `${x > 0 ? '+' : ''}${(x * 100).toFixed(digits)}%` : '–'
/** Percentage points, for absolute differences between rates. */
export const pp = (x: number, digits = 2) =>
  Number.isFinite(x) ? `${x > 0 ? '+' : ''}${(x * 100).toFixed(digits)} pp` : '–'
export const int = format(',')
export const compact = format('~s')
/** 3 significant figures, e.g. 57.8k. */
export const approx = format('.3~s')
export const pValue = (p: number) => (p < 0.0001 ? '< 0.0001' : p.toFixed(4))
