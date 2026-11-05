import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '../../src/core/db.ts'
import { deterministic, evaluate, SALES, SALES_SETUP, WINDOW_QUERIES, windowSql, type Fn, type Frame, type Order, type WindowSpec } from '../../src/core/windows.ts'
import { nodeDb } from '../helpers/nodeDb.ts'

let db: Db
beforeAll(async () => {
  db = await nodeDb()
  for (const sql of SALES_SETUP) await db.run(sql)
})

const FNS: Fn[] = ['row_number', 'rank', 'dense_rank', 'lag', 'sum', 'avg', 'first_value', 'last_value']
const ORDERS: Order[] = ['none', 'day', 'day_amount']
const FRAMES: Frame[] = ['default', 'rows_unbounded', 'rows_2', 'whole']

const specs: WindowSpec[] = FNS.flatMap((fn) =>
  [true, false].flatMap((partition) => ORDERS.flatMap((order) => FRAMES.map((frame) => ({ fn, partition, order, frame })))),
).filter((s) => s.order !== 'none' || !['row_number', 'lag', 'rank', 'dense_rank'].includes(s.fn)).filter(deterministic)

describe('window evaluator matches DuckDB', () => {
  it(`covers ${specs.length} deterministic specs`, () => expect(specs.length).toBeGreaterThan(40))

  for (const s of specs) {
    it(`${s.fn} partition=${s.partition} order=${s.order} frame=${s.frame}`, async () => {
      const sql = await db.all<{ store: string; day: number; amount: number; result: number | null }>(windowSql(s))
      const ts = evaluate(SALES, s)
      expect(sql.map((r) => (r.result === null ? null : Number(r.result)))).toEqual(
        ts.map((r) => (r.value === null ? null : expect.closeTo(r.value, 10))),
      )
    })
  }
})

describe('window gotchas', () => {
  it('default frame with ties: both day-2 rows get the same running total', () => {
    const r = evaluate(SALES, { fn: 'sum', partition: true, order: 'day', frame: 'default' }).filter((x) => x.store === 'A' && x.day === 2)
    expect(r.map((x) => x.value)).toEqual([35, 35])
  })

  it('last_value with the default frame returns the current row, not the partition’s last', () => {
    const r = evaluate(SALES, { fn: 'last_value', partition: true, order: 'day_amount', frame: 'default' })
    expect(r[0].value).toBe(10)
    expect(evaluate(SALES, { fn: 'last_value', partition: true, order: 'day_amount', frame: 'whole' })[0].value).toBe(15)
  })

  it('WHERE on a window function is an error; QUALIFY works', async () => {
    await expect(db.all(WINDOW_QUERIES.whereError)).rejects.toThrow()
    const best = await db.all<{ store: string; amount: number }>(WINDOW_QUERIES.qualify)
    expect(best.map((r) => `${r.store}${r.amount}`).sort()).toEqual(['A30', 'B40'])
    expect(await db.all(WINDOW_QUERIES.subquery)).toHaveLength(2)
  })

  it('LAG uses the previous row, not the previous day', async () => {
    const rows = await db.all<{ store: string; day: number; prev_day: number | null }>(WINDOW_QUERIES.dayChange)
    expect(rows.find((r) => r.store === 'B' && r.day === 3)?.prev_day).toBe(1)
  })
})
