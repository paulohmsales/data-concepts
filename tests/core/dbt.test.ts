import { describe, expect, it } from 'vitest'
import { costPerDay, FULL_MINUTES, report, select, type MatParams } from '../../src/core/dbt.ts'

describe('node selection', () => {
  it('model+ builds the change and everything downstream', () => {
    const r = report('down', 'stg_customers')
    expect([...r.built].sort()).toEqual(['dim_customers', 'fct_orders', 'fct_sessions', 'marketing_roi', 'revenue_daily', 'stg_customers'])
    expect(r.minutes).toBe(19)
    expect(r.untested.size).toBe(0)
    expect(r.wasted.size).toBe(0)
  })
  it('building only the model leaves its dependants untested', () => {
    expect(report('only', 'stg_customers').untested.size).toBe(5)
    expect(report('up', 'stg_customers').untested.size).toBe(5)
  })
  it('a full build is safe but mostly wasted work', () => {
    const r = report('all', 'stg_customers')
    expect(r.minutes).toBe(FULL_MINUTES)
    expect(FULL_MINUTES).toBe(42)
    expect(r.wasted.size).toBe(5)
  })
  it('@ pulls in other parents of the descendants', () => {
    expect(select('at', 'int_sessions').has('stg_orders')).toBe(true)
    expect(select('down', 'int_sessions').has('stg_orders')).toBe(false)
  })
  it('sources are never built', () => {
    expect([...select('up', 'fct_orders')].some((id) => id.startsWith('raw.'))).toBe(false)
  })
})

describe('materialisation cost', () => {
  const p: MatParams = { sizeGb: 200, readsPerDay: 10, buildsPerDay: 1, dailyNew: 0.01, lookbackDays: 3 }
  it('a busy view re-runs its SQL on every read', () => {
    expect(costPerDay('view', p)).toBeCloseTo(25, 5)
    expect(costPerDay('table', p)).toBeCloseTo(3.75, 5)
    expect(costPerDay('incremental', p)).toBeLessThan(1.5)
  })
  it('rebuilding a table hourly can cost more than a view', () => {
    const hourly = { ...p, buildsPerDay: 24 }
    expect(costPerDay('table', hourly)).toBeGreaterThan(costPerDay('view', hourly))
    expect(costPerDay('incremental', hourly)).toBeLessThan(5)
  })
  it('a rarely read model is cheapest as a view', () => {
    const rare = { ...p, readsPerDay: 0.5 }
    expect(costPerDay('view', rare)).toBeLessThan(costPerDay('table', rare))
  })
})
