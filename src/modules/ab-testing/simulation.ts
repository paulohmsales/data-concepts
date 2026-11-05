import {
  analyticPower,
  everSignificant,
  requiredN,
  simulateMany,
  simulatePeeking,
  type AbParams,
  type PeekPoint,
  type TestResult,
} from '../../core/abtest.ts'
import { mulberry32 } from '../../core/random.ts'

export interface Controls extends AbParams {
  sims: number
  looks: number
  seed: number
}

export interface PeekPath {
  id: number
  points: PeekPoint[]
  crossed: boolean
  significantAtEnd: boolean
}

export interface Simulation {
  params: Controls
  results: TestResult[]
  shareSignificant: number
  power: number
  requiredN: number
  peeks: PeekPath[]
  shareEverCrossed: number
  shareEndSignificant: number
}

export const PEEK_SIMS_MAX = 1000

/** Everything the views need, from one set of controls. Deterministic for a given seed. */
export function runSimulation(c: Controls): Simulation {
  const results = simulateMany(c, c.sims, mulberry32(c.seed))

  // Separate stream for peeking, so changing `looks` doesn't reshuffle the other views.
  const peekRng = mulberry32(c.seed ^ 0x9e3779b9)
  const peeks: PeekPath[] = []
  for (let id = 0; id < Math.min(c.sims, PEEK_SIMS_MAX); id++) {
    const points = simulatePeeking(c, c.looks, peekRng)
    peeks.push({
      id,
      points,
      crossed: everSignificant(points, c.alpha),
      significantAtEnd: points[points.length - 1].pValue < c.alpha,
    })
  }

  const share = (xs: boolean[]) => xs.filter(Boolean).length / xs.length
  return {
    params: c,
    results,
    shareSignificant: share(results.map((r) => r.significant)),
    power: analyticPower(c),
    requiredN: requiredN(c, 0.8),
    peeks,
    shareEverCrossed: share(peeks.map((p) => p.crossed)),
    shareEndSignificant: share(peeks.map((p) => p.significantAtEnd)),
  }
}
