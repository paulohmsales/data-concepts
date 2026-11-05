import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '../../src/core/db.ts'
import { FANOUT_QUERIES as Q, FANOUT_SETUP, TRUE_REVENUE } from '../../src/core/fanout.ts'
import { nodeDb } from '../helpers/nodeDb.ts'

let db: Db
beforeAll(async () => {
  db = await nodeDb()
  for (const sql of FANOUT_SETUP) await db.run(sql)
})

const one = async (sql: string) => (await db.all<Record<string, unknown>>(sql))[0]
const num = (v: unknown) => Number(v)

describe('join fan-out', () => {
  it('at order grain the sum is the true revenue', async () => {
    expect(num((await one(Q.grain)).revenue)).toBe(TRUE_REVENUE)
  })

  it('joining items repeats orders: 7 rows for 4 orders', async () => {
    expect(await db.all(Q.joinRows)).toHaveLength(7)
  })

  it('summing after the join inflates revenue', async () => {
    expect(num((await one(Q.sumAfterJoin)).revenue)).toBe(940)
  })

  it('two one-to-many joins multiply: order 104 appears 3 × 2 = 6 times', async () => {
    const rows = await db.all<{ order_id: number; rows_after_join: number; summed_amount: unknown }>(Q.twoJoins)
    const o104 = rows.find((r) => r.order_id === 104)!
    expect(o104.rows_after_join).toBe(6)
    expect(num(o104.summed_amount)).toBe(1200)
  })

  it('SUM(DISTINCT) undercounts when two orders share an amount', async () => {
    expect(num((await one(Q.sumDistinct)).revenue)).toBe(370)
  })

  it('pre-aggregating to order grain fixes it', async () => {
    expect(num((await one(Q.preAggregateTotal)).revenue)).toBe(TRUE_REVENUE)
    const rows = await db.all<{ amount: unknown; items_total: unknown; paid_total: unknown }>(Q.preAggregate)
    expect(rows).toHaveLength(4)
    for (const r of rows) {
      expect(num(r.items_total)).toBe(num(r.amount))
      expect(num(r.paid_total)).toBe(num(r.amount))
    }
  })

  it('the grain test flags the fanned-out orders', async () => {
    expect((await db.all(Q.grainTest)).length).toBe(2)
  })

  it('WHERE on the right side of a LEFT JOIN drops unmatched rows; ON keeps them', async () => {
    const where = await db.all<{ name: string }>(Q.leftJoinFilter)
    const on = await db.all<{ name: string; orders: number }>(Q.leftJoinOn)
    expect(where.map((r) => r.name)).not.toContain('Davi')
    expect(on.find((r) => r.name === 'Davi')?.orders).toBe(0)
    expect(on).toHaveLength(4)
  })
})
