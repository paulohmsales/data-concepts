/**
 * Shared statistics plumbing: descriptive stats and the t and chi-square distributions.
 * The modules teach what these numbers mean; this file just computes them accurately.
 */

export const sum = (xs: readonly number[]) => {
  let s = 0
  for (const x of xs) s += x
  return s
}

export const mean = (xs: readonly number[]) => sum(xs) / xs.length

/** Sample variance (n − 1 in the denominator). */
export function variance(xs: readonly number[]): number {
  const m = mean(xs)
  let s = 0
  for (const x of xs) s += (x - m) ** 2
  return s / (xs.length - 1)
}

export const sd = (xs: readonly number[]) => Math.sqrt(variance(xs))

/** Quantile with linear interpolation between order statistics (R's type 7, numpy's default). */
export function quantile(xs: readonly number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b)
  const h = (s.length - 1) * p
  const lo = Math.floor(h)
  const hi = Math.ceil(h)
  return s[lo] + (h - lo) * (s[hi] - s[lo])
}

export const median = (xs: readonly number[]) => quantile(xs, 0.5)

export function covariance(xs: readonly number[], ys: readonly number[]): number {
  const mx = mean(xs)
  const my = mean(ys)
  let s = 0
  for (let i = 0; i < xs.length; i++) s += (xs[i] - mx) * (ys[i] - my)
  return s / (xs.length - 1)
}

export const correlation = (xs: readonly number[], ys: readonly number[]) =>
  covariance(xs, ys) / (sd(xs) * sd(ys))

/** Ordinary least squares line y = intercept + slope·x. */
export function linearFit(xs: readonly number[], ys: readonly number[]) {
  const slope = covariance(xs, ys) / variance(xs)
  return { slope, intercept: mean(ys) - slope * mean(xs) }
}

// ---------------------------------------------------------------------------------------------
// Special functions
// ---------------------------------------------------------------------------------------------

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
]

/** ln Γ(x), Lanczos approximation (≈ 15 significant digits). */
export function logGamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x)
  x -= 1
  let a = LANCZOS[0]
  const t = x + 7.5
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i)
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a)
}

const FPMIN = 1e-300

/** Continued fraction for the incomplete beta (modified Lentz). */
function betaCf(a: number, b: number, x: number): number {
  const qab = a + b
  const qap = a + 1
  const qam = a - 1
  let c = 1
  let d = 1 - (qab * x) / qap
  if (Math.abs(d) < FPMIN) d = FPMIN
  d = 1 / d
  let h = d
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2))
    d = 1 + aa * d
    if (Math.abs(d) < FPMIN) d = FPMIN
    c = 1 + aa / c
    if (Math.abs(c) < FPMIN) c = FPMIN
    d = 1 / d
    h *= d * c
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2))
    d = 1 + aa * d
    if (Math.abs(d) < FPMIN) d = FPMIN
    c = 1 + aa / c
    if (Math.abs(c) < FPMIN) c = FPMIN
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 3e-14) break
  }
  return h
}

/** Regularized incomplete beta I_x(a, b). */
export function betaInc(x: number, a: number, b: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const front = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  )
  return x < (a + 1) / (a + b + 2)
    ? (front * betaCf(a, b, x)) / a
    : 1 - (front * betaCf(b, a, 1 - x)) / b
}

/** Regularized lower incomplete gamma P(a, x). */
export function gammaInc(a: number, x: number): number {
  if (x <= 0) return 0
  const lnFront = -x + a * Math.log(x) - logGamma(a)
  if (x < a + 1) {
    // series
    let term = 1 / a
    let s = term
    for (let n = 1; n < 500; n++) {
      term *= x / (a + n)
      s += term
      if (Math.abs(term) < Math.abs(s) * 1e-15) break
    }
    return s * Math.exp(lnFront)
  }
  // continued fraction for Q, then P = 1 − Q
  let b = x + 1 - a
  let c = 1 / FPMIN
  let d = 1 / b
  let h = d
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a)
    b += 2
    d = an * d + b
    if (Math.abs(d) < FPMIN) d = FPMIN
    c = b + an / c
    if (Math.abs(c) < FPMIN) c = FPMIN
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 1e-15) break
  }
  return 1 - Math.exp(lnFront) * h
}

// ---------------------------------------------------------------------------------------------
// Distributions
// ---------------------------------------------------------------------------------------------

/** Student's t CDF with `df` degrees of freedom. */
export function tCdf(t: number, df: number): number {
  const tail = 0.5 * betaInc(df / (df + t * t), df / 2, 0.5)
  return t > 0 ? 1 - tail : tail
}

/** Inverse of tCdf, by bisection (60 halvings: far below display precision). */
export function tQuantile(p: number, df: number): number {
  if (p <= 0) return -Infinity
  if (p >= 1) return Infinity
  let hi = 1
  while (tCdf(hi, df) < Math.max(p, 1 - p)) hi *= 2
  let lo = -hi
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2
    if (tCdf(mid, df) < p) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/** Upper tail P(X ≥ x) of a chi-square with k degrees of freedom. */
export const chiSquareSf = (x: number, k: number) => (x <= 0 ? 1 : 1 - gammaInc(k / 2, x / 2))

/** Normal density. */
export const normalPdf = (x: number, mu = 0, sigma = 1) =>
  Math.exp(-0.5 * ((x - mu) / sigma) ** 2) / (sigma * Math.sqrt(2 * Math.PI))

/** Sample skewness (third standardised moment, no small-sample correction). */
export function skewness(xs: readonly number[]): number {
  const m = mean(xs)
  let m2 = 0
  let m3 = 0
  for (const x of xs) {
    const d = x - m
    m2 += d * d
    m3 += d * d * d
  }
  m2 /= xs.length
  m3 /= xs.length
  return m2 === 0 ? 0 : m3 / m2 ** 1.5
}

export interface Bin {
  x0: number
  x1: number
  count: number
  /** count / (total · width): comparable with a probability density. */
  density: number
}

/** Fixed-width histogram over [lo, hi]; values outside are not counted (see `outside`). */
export function histogram(xs: readonly number[], lo: number, hi: number, bins: number) {
  const width = (hi - lo) / bins
  const counts = new Array<number>(bins).fill(0)
  let outside = 0
  for (const x of xs) {
    if (x < lo || x > hi) {
      outside++
      continue
    }
    counts[Math.min(bins - 1, Math.floor((x - lo) / width))]++
  }
  const out: Bin[] = counts.map((count, i) => ({
    x0: lo + i * width,
    x1: lo + (i + 1) * width,
    count,
    density: count / (xs.length * width),
  }))
  return { bins: out, outside, width }
}
