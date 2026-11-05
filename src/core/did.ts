import { normal, type Rng } from './random.ts'

/**
 * Difference-in-differences. Weekly orders per city for a treated group (gets a new delivery fee
 * policy at week START) and a control group, over 40 weeks. Both share a growth trend and a holiday
 * spike (weeks 24–26); the treated group starts at a different level and may have its own extra
 * trend (a parallel-trends violation).
 */
export const WEEKS = 40
export const START = 20
const HOLIDAY = [24, 25, 26]

export interface DidParams {
  effect: number
  levelGap: number
  /** extra weekly growth in the treated group only (0 = parallel trends) */
  extraTrend: number
  noise: number
  seed: number
}

export interface Week {
  week: number
  treated: number
  control: number
}

export function simulateDid(p: DidParams, rng: Rng): Week[] {
  return Array.from({ length: WEEKS }, (_, w) => {
    const common = 100 + 1.0 * w + (HOLIDAY.includes(w) ? 25 : 0)
    return {
      week: w,
      control: common + p.noise * normal(rng),
      treated: common + p.levelGap + p.extraTrend * w + (w >= START ? p.effect : 0) + p.noise * normal(rng),
    }
  })
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

export interface Estimates {
  beforeAfter: number
  postGap: number
  did: number
}

export function estimates(ws: Week[]): Estimates {
  const pre = ws.filter((w) => w.week < START)
  const post = ws.filter((w) => w.week >= START)
  const tPre = mean(pre.map((w) => w.treated))
  const tPost = mean(post.map((w) => w.treated))
  const cPre = mean(pre.map((w) => w.control))
  const cPost = mean(post.map((w) => w.control))
  return { beforeAfter: tPost - tPre, postGap: tPost - cPost, did: tPost - tPre - (cPost - cPre) }
}

/** Event study: treated − control each week, relative to the average gap before treatment. */
export function eventStudy(ws: Week[]): { rel: number; gap: number }[] {
  const base = mean(ws.filter((w) => w.week < START).map((w) => w.treated - w.control))
  return ws.map((w) => ({ rel: w.week - START, gap: w.treated - w.control - base }))
}

/** Slope of the treated − control gap before treatment (a pre-trend test statistic). */
export function preTrend(ws: Week[]): number {
  const pre = ws.filter((w) => w.week < START)
  const xs = pre.map((w) => w.week)
  const ys = pre.map((w) => w.treated - w.control)
  const mx = mean(xs)
  const my = mean(ys)
  return xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / xs.reduce((a, x) => a + (x - mx) ** 2, 0)
}
