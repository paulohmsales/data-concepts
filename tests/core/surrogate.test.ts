import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '../../src/core/db.ts'
import { attributionSql, KEY_QUERIES as Q, SURROGATE_SETUP } from '../../src/core/surrogate.ts'
import { nodeDb } from '../helpers/nodeDb.ts'

let db: Db
beforeAll(async () => {
  db = await nodeDb()
  for (const sql of SURROGATE_SETUP) await db.run(sql)
})

type Attr = { true_customer: string; dashboard_says: string | null }
const wrong = (rows: Attr[]) => rows.filter((r) => r.true_customer !== r.dashboard_says).length

describe('surrogate keys', () => {
  it('day 1: both strategies attribute every order correctly', async () => {
    expect(wrong(await db.all<Attr>(attributionSql('rownum', 'day1')))).toBe(0)
    expect(wrong(await db.all<Attr>(attributionSql('hash', 'day1')))).toBe(0)
  })

  it('day 2: row_number keys shift and every order moves to another customer', async () => {
    const rows = await db.all<Attr>(attributionSql('rownum', 'day2'))
    expect(wrong(rows)).toBe(4)
    expect(rows[0].dashboard_says).toBe('ana@shop.io')
  })

  it('day 2: hash keys are unaffected', async () => {
    expect(wrong(await db.all<Attr>(attributionSql('hash', 'day2')))).toBe(0)
  })

  it('concatenation without a separator collides; a separator fixes it', async () => {
    const bad = await db.all<{ product_sk: string }>(Q.concat)
    expect(new Set(bad.map((r) => r.product_sk)).size).toBe(1)
    const good = await db.all<{ product_sk: string }>(Q.separator)
    expect(new Set(good.map((r) => r.product_sk)).size).toBe(2)
  })

  it('NULL parts: || gives NULL keys, concat_ws collides, the dbt pattern is unique', async () => {
    const nul = await db.all<{ product_sk: string | null }>(Q.nullConcat)
    expect(nul.every((r) => r.product_sk === null)).toBe(true)
    const ws = await db.all<{ product_sk: string }>(Q.nullConcatWs)
    expect(new Set(ws.map((r) => r.product_sk)).size).toBe(1)
    const dbt = await db.all<{ product_sk: string }>(Q.dbtStyle)
    expect(new Set(dbt.map((r) => r.product_sk)).size).toBe(4)
  })

  it('types matter: 7 and "007" hash differently', async () => {
    const [r] = await db.all<{ same_key: boolean }>(Q.types)
    expect(r.same_key).toBe(false)
  })
})
