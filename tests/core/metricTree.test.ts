import { describe, expect, it } from 'vitest'
import { apply, BASE, decompose, totals, type Changes } from '../../src/core/metricTree.ts'

const none: Changes = { sessions: {}, conversion: {}, aov: {} }
const run = (c: Partial<Changes>) => decompose(BASE, apply(BASE, { ...none, ...c }))

describe('metric tree', () => {
  it('baseline totals', () => {
    const t = totals(BASE)
    expect(t.sessions).toBe(100_000)
    expect(t.revenue).toBeCloseTo(50_000 * 0.03 * 60 + 30_000 * 0.015 * 55 + 20_000 * 0.05 * 70, 6)
  })
  it('the parts always add up to the total change', () => {
    const d = run({ sessions: { paid: 0.6 }, conversion: { email: -0.3 }, aov: { organic: 0.1 } })
    expect(d.traffic + d.mix + d.rate + d.aov).toBeCloseTo(d.after.revenue - d.before.revenue, 6)
  })
  it('a paid-traffic surge lowers overall conversion through mix alone', () => {
    const d = run({ sessions: { paid: 0.6 } })
    expect(d.after.conversion).toBeLessThan(d.before.conversion)
    expect(d.mix).toBeLessThan(0)
    expect(Math.abs(d.rate)).toBeLessThan(1e-6)
    expect(d.after.revenue).toBeGreaterThan(d.before.revenue)
  })
  it('a real conversion drop shows up as rate', () => {
    const d = run({ conversion: { email: -0.3 } })
    expect(d.rate).toBeLessThan(0)
    expect(Math.abs(d.mix)).toBeLessThan(1e-6)
    expect(Math.abs(d.traffic)).toBeLessThan(1e-6)
  })
})
