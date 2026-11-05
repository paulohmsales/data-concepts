import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '../../src/core/db.ts'
import { acrossSql, DIM_SETUP, historySql, lateSql, Q1_SOURCE_TOTAL } from '../../src/core/dimensional.ts'
import { nodeDb } from '../helpers/nodeDb.ts'

let db: Db
beforeAll(async () => {
  db = await nodeDb()
  for (const sql of DIM_SETUP) await db.run(sql)
})

type R = { region: string; revenue: number }
const byRegion = async (sql: string) => Object.fromEntries((await db.all<R>(sql)).map((r) => [r.region, Number(r.revenue)]))

describe('slowly changing dimensions', () => {
  it('type 2 at sale time keeps Ana’s Q1 sales in North', async () => {
    expect(await byRegion(historySql('t2'))).toEqual({ North: 240, South: 150, Unknown: 60, TOTAL: Q1_SOURCE_TOTAL })
  })
  it('type 1 (and type 2 current) restate history to South', async () => {
    const t1 = await byRegion(historySql('t1'))
    expect(t1).toEqual({ North: 100, South: 290, Unknown: 60, TOTAL: Q1_SOURCE_TOTAL })
    expect(await byRegion(historySql('t2cur'))).toEqual(t1)
  })
  it('joining type 2 without the date range double counts', async () => {
    expect((await byRegion(historySql('t2bug'))).TOTAL).toBe(590)
  })
})

describe('late-arriving dimension', () => {
  it('inner join silently drops Davi’s sale', async () => {
    expect((await byRegion(lateSql('inner'))).TOTAL).toBe(390)
  })
  it('left join keeps it under a NULL region; unknown member labels it', async () => {
    expect((await byRegion(lateSql('left')))['(null)']).toBe(60)
    expect(await byRegion(lateSql('unknown'))).toEqual({ North: 240, South: 150, Unknown: 60, TOTAL: Q1_SOURCE_TOTAL })
  })
})

describe('drilling across two facts', () => {
  type A = { category: string; sales: number | null; returns: number | null; return_pct: number | null }
  const rows = async (sql: string) => Object.fromEntries((await db.all<A>(sql)).map((r) => [r.category, r]))
  it('joining facts directly fans out', async () => {
    const r = await rows(acrossSql('fanout'))
    expect(Number(r.Footwear.return_pct)).toBe(100)
    expect(Number(r.Apparel.return_pct)).toBe(85.7)
  })
  it('non-conformed categories do not line up', async () => {
    const r = await rows(acrossSql('local'))
    expect(r.Footwear.returns).toBeNull()
    expect(r.Shoes.sales).toBeNull()
  })
  it('drill across a conformed dimension gives the right rates', async () => {
    const r = await rows(acrossSql('conformed'))
    expect(Number(r.Footwear.return_pct)).toBe(38.5)
    expect(Number(r.Apparel.return_pct)).toBe(28.6)
  })
})
