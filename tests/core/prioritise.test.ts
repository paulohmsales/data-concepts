import { describe, expect, it } from 'vitest'
import { BACKLOG, plan, type Order } from '../../src/core/prioritise.ts'

const orders: Order[] = ['requested', 'value', 'shortest', 'biggest', 'wsjf']

describe('cost of delay', () => {
  it('one at a time, every order finishes everything at the same week', () => {
    const total = BACKLOG.reduce((a, p) => a + p.weeks, 0)
    for (const o of orders) expect(plan(o).deliveries.at(-1)!.finish).toBeCloseTo(total, 1)
  })
  it('WSJF delivers the most value; biggest-first the least', () => {
    const v = Object.fromEntries(orders.map((o) => [o, plan(o).delivered]))
    expect(Math.max(...Object.values(v))).toBe(v.wsjf)
    expect(Math.min(...Object.values(v))).toBe(v.biggest)
    expect(v.wsjf).toBeGreaterThan(v.requested * 1.5)
  })
  it('working on several things at once delivers less', () => {
    expect(plan('wsjf', 2).delivered).toBeLessThan(plan('wsjf', 1).delivered * 0.85)
    expect(plan('wsjf', 4).delivered).toBeLessThan(plan('wsjf', 1).delivered * 0.5)
  })
  it('even without switching costs, parallel work only delays the first delivery', () => {
    expect(plan('wsjf', 4, 0).delivered).toBeLessThan(plan('wsjf', 1, 0).delivered)
  })
})
