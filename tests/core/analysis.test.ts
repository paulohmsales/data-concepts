import { describe, expect, it } from 'vitest'
import { activeByWeek, pooledRetention, retentionCurve, simulateCohorts, type CohortParams } from '../../src/core/cohorts.ts'
import { naiveFunnel, orderedFunnel, simulateEvents, type FunnelParams } from '../../src/core/funnels.ts'
import { mulberry32 } from '../../src/core/random.ts'
import { monthlyTotals, movingAverage, simulateSeries, weekdayEffect, weeklyPattern, weeklyRipple } from '../../src/core/seasonality.ts'

describe('cohorts', () => {
  const p: CohortParams = { weeks: 16, firstCohort: 20_000, growth: 1.08, floor: 0.2, decay: 2, worseFrom: null, worseFloor: 0.1 }

  it('cohort retention follows the curve', () => {
    const c = simulateCohorts(p, mulberry32(1))
    expect(c[0].active[4] / c[0].size).toBeCloseTo(retentionCurve(4, 0.2, 2), 2)
  })

  it('naive pooling (young cohorts as zeros) understates retention; correct pooling matches', () => {
    const r = pooledRetention(simulateCohorts(p, mulberry32(2)), 8)
    expect(r.correct).toBeCloseTo(retentionCurve(8, 0.2, 2), 2)
    expect(r.naive).toBeLessThan(r.correct * 0.6)
  })

  it('active users keep growing while new cohorts retain worse', () => {
    const worse = { ...p, worseFrom: 8 }
    const c = simulateCohorts(worse, mulberry32(3))
    const active = activeByWeek(c, p.weeks)
    expect(active[15]).toBeGreaterThan(active[8])
    expect(c[9].active[4] / c[9].size).toBeLessThan(c[2].active[4] / c[2].size - 0.05)
  })
})

describe('funnels', () => {
  const p: FunnelParams = { users: 20_000, rates: [0.4, 0.5, 0.6], meanGapHours: 2, guests: 0, slowBuyers: 0, bots: 0 }

  it('a clean ordered funnel multiplies the step rates', () => {
    const f = orderedFunnel(simulateEvents(p, mulberry32(4)), 1e9)
    expect(f[1] / f[0]).toBeCloseTo(0.4, 1)
    expect(f[3] / f[2]).toBeCloseTo(0.6, 1)
  })

  it('ordered counts never increase down the funnel', () => {
    const f = orderedFunnel(simulateEvents({ ...p, guests: 0.5 }, mulberry32(5)), 24)
    for (let i = 1; i < f.length; i++) expect(f[i]).toBeLessThanOrEqual(f[i - 1])
  })

  it('guests drop out of the strict funnel; the naive count can exceed the step before', () => {
    const ev = simulateEvents({ ...p, rates: [0.3, 0.9, 0.6], guests: 0.7 }, mulberry32(6))
    const naive = naiveFunnel(ev)
    expect(naive[2]).toBeGreaterThan(naive[1])
    expect(naive[2]).toBeGreaterThan(orderedFunnel(ev, 1e9)[2] * 1.5)
  })

  it('a short conversion window cuts slow buyers', () => {
    const ev = simulateEvents({ ...p, slowBuyers: 0.5 }, mulberry32(7))
    expect(orderedFunnel(ev, 6)[3]).toBeLessThan(orderedFunnel(ev, 1e9)[3] * 0.8)
  })

  it('bots dilute the top of the funnel only', () => {
    const clean = orderedFunnel(simulateEvents(p, mulberry32(8)), 1e9)
    const bots = orderedFunnel(simulateEvents({ ...p, bots: 20_000 }, mulberry32(8)), 1e9)
    expect(bots[0]).toBe(clean[0] + 20_000)
    expect(bots.slice(1)).toEqual(clean.slice(1))
  })
})

describe('trend and seasonality', () => {
  const p = { days: 365 * 3, level: 1000, trendPerYear: 120, yearly: 200, weekend: 150, noise: 20 }
  const s = simulateSeries(p, mulberry32(9))
  const xs = s.map((x) => x.value)

  it('recovers the weekly pattern', () => {
    const est = weeklyPattern(xs)
    est.forEach((e, d) => expect(e).toBeCloseTo(weekdayEffect(d, p.weekend), -1))
  })

  it('a 7- or 14-day average removes the weekly wiggle; 10 days does not', () => {
    expect(weeklyRipple(7, 150)).toBeCloseTo(0, 8)
    expect(weeklyRipple(14, 150)).toBeCloseTo(0, 8)
    expect(weeklyRipple(10, 150)).toBeGreaterThan(20)
  })

  it('moving average of a constant is the constant', () => {
    expect(movingAverage([5, 5, 5, 5], 2).slice(1)).toEqual([5, 5, 5])
  })

  it('month-over-month swings with the season; year-over-year stays near the trend', () => {
    const m = monthlyTotals(s)
    expect(m).toHaveLength(36)
    const mom = m.slice(12, 24).map((x, i) => x.total / m[11 + i].total - 1)
    const yoy = m.slice(24, 36).map((x, i) => x.total / m[12 + i].total - 1)
    expect(Math.min(...mom)).toBeLessThan(-0.07)
    expect(Math.max(...mom)).toBeGreaterThan(0.08)
    for (const g of yoy) {
      expect(g).toBeGreaterThan(0.07)
      expect(g).toBeLessThan(0.14)
    }
  })
})
