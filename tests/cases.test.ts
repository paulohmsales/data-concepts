import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { CASE_PRELUDE } from '../src/core/cases.ts'
import type { Db } from '../src/core/db.ts'
import { nodeDb } from './helpers/nodeDb.ts'

interface CaseFile {
  id: string
  setup: string[]
  steps: { title: string; sql: string }[]
}

const dir = join(__dirname, '..', 'content', 'cases')
const cases: CaseFile[] = readdirSync(dir).map((f) => parse(readFileSync(join(dir, f), 'utf8')))
const load = async (c: CaseFile): Promise<Db> => {
  const db = await nodeDb()
  for (const s of [...CASE_PRELUDE, ...c.setup]) await db.run(s)
  return db
}
const byId = (id: string) => cases.find((c) => c.id === id)!

describe('every case', () => {
  it.each(cases.map((c) => [c.id, c] as const))('%s: setup and every step query run', async (_, c) => {
    const db = await load(c)
    for (const st of c.steps) expect((await db.all(st.sql)).length).toBeGreaterThan(0)
  })
})

describe('the findings the cases claim', () => {
  it('monday-revenue: +24% last week, Sunday doubled, 220 split orders, fix matches finance', async () => {
    const c = byId('monday-revenue')
    const db = await load(c)
    const days = await db.all<{ pct_high: number }>(c.steps[0].sql)
    expect(days.at(-1)!.pct_high).toBeGreaterThan(100)
    expect(Math.max(...days.slice(0, -1).map((d) => d.pct_high))).toBeLessThan(14)
    const [w] = await db.all<{ pct: number }>(`SELECT round(100.0*(sum(d.revenue)/sum(f.revenue)-1),1) pct FROM dashboard_daily_revenue d
      JOIN finance_daily_revenue f USING (order_date) WHERE order_date BETWEEN DATE '2026-10-26' AND DATE '2026-11-01'`)
    expect(w.pct).toBeCloseTo(23.9, 1)
    const grain = await db.all<{ rows_per_order: number; orders: number }>(c.steps[1].sql)
    expect(grain.find((g) => g.rows_per_order === 2)!.orders).toBe(220)
    const fixed = await db.all<{ diff: number }>(c.steps[3].sql)
    expect(fixed.every((d) => d.diff === 0)).toBe(true)
  })

  it('experiment-too-good: +5% among exposed, SRM, and worse under intention to treat', async () => {
    const c = byId('experiment-too-good')
    const db = await load(c)
    const exp = await db.all<{ variant: string; conversion_pct: number }>(c.steps[0].sql)
    const e = Object.fromEntries(exp.map((r) => [r.variant, r.conversion_pct]))
    expect(e.treatment).toBeGreaterThan(e.control)
    const [srm] = await db.all<{ chi_square: number }>(c.steps[1].sql)
    expect(srm.chi_square).toBeGreaterThan(40)
    const itt = Object.fromEntries((await db.all<{ variant: string; conversion_pct: number }>(c.steps[3].sql)).map((r) => [r.variant, r.conversion_pct]))
    expect(itt.treatment).toBeLessThan(itt.control * 0.96)
  })

  it('churn-up: KPI rises with the promotion, flat within bands, flat at a fixed mix', async () => {
    const c = byId('churn-up')
    const db = await load(c)
    const kpi = Object.fromEntries((await db.all<{ month: number; churn_pct: number }>(c.steps[0].sql)).map((r) => [r.month, r.churn_pct]))
    expect(kpi[12]).toBeGreaterThan(kpi[11] * 1.15)
    const bands = await db.all<{ before_pct: number; after_pct: number }>(c.steps[1].sql)
    for (const b of bands) if (b.before_pct != null && b.after_pct != null) expect(Math.abs(b.after_pct - b.before_pct)).toBeLessThan(1.5)
    const fixed = await db.all<{ churn_pct_at_month_11_mix: number }>(c.steps[3].sql)
    for (const f of fixed) expect(f.churn_pct_at_month_11_mix).toBeLessThan(5.3)
  })
})
