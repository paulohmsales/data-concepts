import { normal, type Rng } from './random.ts'

/**
 * Regression to the mean. Each person has a stable skill; each test adds fresh luck.
 * Scores are on a 100 ± 15 scale. Reliability r = share of score variance that is skill, which is
 * also the correlation between two tests.
 */
export interface Person {
  skill: number
  test1: number
  test2: number
}

export const MEAN = 100
export const SD = 15

export function simulatePeople(n: number, reliability: number, rng: Rng): Person[] {
  const skillSd = SD * Math.sqrt(reliability)
  const luckSd = SD * Math.sqrt(1 - reliability)
  return Array.from({ length: n }, () => {
    const skill = MEAN + skillSd * normal(rng)
    return { skill, test1: skill + luckSd * normal(rng), test2: skill + luckSd * normal(rng) }
  })
}

/** Indices of the top or bottom `share` of people by test 1. */
export function selectExtreme(people: readonly Person[], share: number, side: 'top' | 'bottom'): Set<number> {
  const order = people.map((_, i) => i).sort((a, b) => people[a].test1 - people[b].test1)
  const k = Math.max(1, Math.round(people.length * share))
  return new Set(side === 'bottom' ? order.slice(0, k) : order.slice(-k))
}

/** Best guess of test 2 from test 1: shrink toward the mean by the reliability. */
export const expectedRetest = (test1: number, reliability: number) => MEAN + reliability * (test1 - MEAN)

/**
 * The tempting study: take the worst performers, apply an intervention, retest.
 * Half of the selected group (alternating) gets it; the rest is a control. The intervention adds `effect`.
 */
export function interventionStudy(people: readonly Person[], selected: Set<number>, effect: number) {
  const ids = [...selected]
  const treated = ids.filter((_, i) => i % 2 === 0)
  const control = ids.filter((_, i) => i % 2 === 1)
  const change = (g: number[], add: number) =>
    g.reduce((s, i) => s + (people[i].test2 + add - people[i].test1), 0) / g.length
  return {
    treatedChange: change(treated, effect),
    controlChange: change(control, 0),
    nTreated: treated.length,
    nControl: control.length,
  }
}
