import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../src/core/random.ts'
import { expectedRetest, interventionStudy, MEAN, selectExtreme, simulatePeople } from '../../src/core/rtm.ts'
import { correlation, linearFit, mean } from '../../src/core/stats.ts'

describe('regression to the mean', () => {
  const r = 0.6
  const people = simulatePeople(50_000, r, mulberry32(1))
  const t1 = people.map((p) => p.test1)
  const t2 = people.map((p) => p.test2)

  it('test–retest correlation equals the reliability', () => {
    expect(correlation(t1, t2)).toBeCloseTo(r, 2)
  })

  it('slope of test 2 on test 1 is r, not 1', () => {
    expect(linearFit(t1, t2).slope).toBeCloseTo(r, 2)
  })

  it('the top 10% fall back toward the mean by a factor of r', () => {
    const top = [...selectExtreme(people, 0.1, 'top')]
    const g1 = mean(top.map((i) => people[i].test1)) - MEAN
    const g2 = mean(top.map((i) => people[i].test2)) - MEAN
    expect(g2 / g1).toBeCloseTo(r, 1)
    expect(expectedRetest(MEAN + 20, r)).toBeCloseTo(MEAN + 12, 10)
  })

  it('a useless intervention on the bottom 10% "improves" them, and so does the control', () => {
    const bottom = selectExtreme(people, 0.1, 'bottom')
    const s = interventionStudy(people, bottom, 0)
    expect(s.treatedChange).toBeGreaterThan(5)
    expect(Math.abs(s.treatedChange - s.controlChange)).toBeLessThan(1)
  })

  it('a real effect shows up as the gap between treated and control', () => {
    const bottom = selectExtreme(people, 0.1, 'bottom')
    const s = interventionStudy(people, bottom, 4)
    expect(s.treatedChange - s.controlChange).toBeCloseTo(4, 0)
  })
})
