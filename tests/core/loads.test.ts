import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../../src/core/db.ts'
import {
  createSchema,
  deleteCustomer,
  diffAgainstSource,
  fullReload,
  incrementalLoad,
  insertCustomer,
  readSnapshots,
  readSource,
  readTarget,
  snapshot,
  snapshotAsOf,
  sourceAsOf,
  updatePlan,
  type IncrementalOptions,
} from '../../src/core/loads.ts'
import { nodeDb } from '../helpers/nodeDb.ts'

const CORRECT: IncrementalOptions = { write: 'merge', watermark: 'maxLoaded' }

let db: Db
beforeEach(async () => {
  db = await nodeDb()
  await createSchema(db)
  await insertCustomer(db, { id: 1, name: 'Ana', plan: 'free' }, 1)
  await insertCustomer(db, { id: 2, name: 'Bruno', plan: 'pro' }, 1)
  await insertCustomer(db, { id: 3, name: 'Carla', plan: 'free' }, 1)
})

const statuses = async (table: 'target_full' | 'target_incr') =>
  Object.fromEntries((await diffAgainstSource(db, table)).map((d) => [d.id, d.status]))

const plain = (rows: { id: number; name: string; plan: string }[]) =>
  rows.map(({ id, name, plan }) => ({ id, name, plan }))

describe('full reload', () => {
  it('matches the source after inserts, updates and deletes, and is idempotent', async () => {
    await fullReload(db, 2)
    await updatePlan(db, 1, 'pro', 3)
    await deleteCustomer(db, 2, 3)
    await insertCustomer(db, { id: 4, name: 'Davi', plan: 'enterprise' }, 3)
    await fullReload(db, 4)
    await fullReload(db, 5)
    expect(plain(await readTarget(db, 'target_full'))).toEqual(plain(await readSource(db)))
    expect(Object.values(await statuses('target_full')).every((s) => s === 'ok')).toBe(true)
  })
})

describe('incremental load (merge + max(updated_at) watermark)', () => {
  it('picks up inserts and updates, and only extracts what changed', async () => {
    const first = await incrementalLoad(db, 2, CORRECT)
    expect(first.extracted).toBe(3)
    await updatePlan(db, 3, 'pro', 4)
    await insertCustomer(db, { id: 4, name: 'Davi', plan: 'free' }, 4)
    const second = await incrementalLoad(db, 5, CORRECT)
    expect(second.extracted).toBe(2)
    expect(plain(await readTarget(db, 'target_incr'))).toEqual(plain(await readSource(db)))
  })

  it('misses a hard delete: the row lives on as a ghost', async () => {
    await incrementalLoad(db, 2, CORRECT)
    await deleteCustomer(db, 2, 4)
    await incrementalLoad(db, 5, CORRECT)
    expect((await statuses('target_incr'))[2]).toBe('ghost')
  })

  it('misses a late-arriving row whose updated_at is older than the watermark', async () => {
    await updatePlan(db, 1, 'pro', 5)
    const r = await incrementalLoad(db, 6, CORRECT) // watermark → 5
    expect(r.newWatermark).toBe(5)
    await insertCustomer(db, { id: 9, name: 'Late', plan: 'free' }, 8, 3) // visible at 8, stamped 3
    await incrementalLoad(db, 9, CORRECT)
    expect((await statuses('target_incr'))[9]).toBe('missing')
    // a full reload has no watermark to fall behind
    await fullReload(db, 10)
    expect((await statuses('target_full'))[9]).toBe('ok')
  })

  it('is idempotent: a crash before saving the watermark, then a retry, leaves no duplicates', async () => {
    const crashed = await incrementalLoad(db, 2, { ...CORRECT, crashBeforeWatermark: true })
    expect(crashed.crashed).toBe(true)
    await incrementalLoad(db, 4, CORRECT) // retry re-extracts the same rows
    expect(Object.values(await statuses('target_incr'))).toEqual(['ok', 'ok', 'ok'])
  })
})

describe('incremental load, broken variants', () => {
  it('append + retry after a crash duplicates every row', async () => {
    await incrementalLoad(db, 2, { write: 'append', watermark: 'maxLoaded', crashBeforeWatermark: true })
    await incrementalLoad(db, 4, { write: 'append', watermark: 'maxLoaded' })
    expect(Object.values(await statuses('target_incr'))).toEqual(['duplicate', 'duplicate', 'duplicate'])
  })

  it('watermark = job end time loses a change made while the job ran', async () => {
    const midRun = (tick: number) => updatePlan(db, 1, 'enterprise', tick)
    await incrementalLoad(db, 2, { write: 'merge', watermark: 'jobEnd', duringRun: midRun })
    await incrementalLoad(db, 5, { write: 'merge', watermark: 'jobEnd' })
    expect((await statuses('target_incr'))[1]).toBe('stale')
  })

  it('watermark = max(updated_at) catches that change on the next run', async () => {
    const midRun = (tick: number) => updatePlan(db, 1, 'enterprise', tick)
    await incrementalLoad(db, 2, { ...CORRECT, duringRun: midRun })
    expect((await statuses('target_incr'))[1]).toBe('stale') // not yet...
    await incrementalLoad(db, 5, CORRECT)
    expect((await statuses('target_incr'))[1]).toBe('ok') // ...caught on the next run
  })
})

describe('SCD2 snapshot', () => {
  it('records a version per change and closes deleted keys', async () => {
    await snapshot(db, 2)
    await updatePlan(db, 1, 'pro', 3)
    await deleteCustomer(db, 3, 3)
    const r = await snapshot(db, 4)
    expect(r).toEqual({ opened: 1, closed: 2 })

    const ana = (await readSnapshots(db)).filter((s) => s.id === 1)
    expect(ana.map((s) => [s.plan, s.valid_from, s.valid_to])).toEqual([
      ['free', 2, 4],
      ['pro', 4, null],
    ])
    const carla = (await readSnapshots(db)).filter((s) => s.id === 3)
    expect(carla.map((s) => s.valid_to)).toEqual([4])
  })

  it('is idempotent: rerunning with no change adds nothing', async () => {
    await snapshot(db, 2)
    const before = await readSnapshots(db)
    expect(await snapshot(db, 3)).toEqual({ opened: 0, closed: 0 })
    expect(await readSnapshots(db)).toEqual(before)
  })

  it('answers "what did we know at T" correctly at every snapshot time', async () => {
    await snapshot(db, 2)
    await updatePlan(db, 2, 'free', 3)
    await snapshot(db, 4)
    await deleteCustomer(db, 1, 5)
    await insertCustomer(db, { id: 4, name: 'Davi', plan: 'pro' }, 5)
    await snapshot(db, 6)
    for (const t of [2, 4, 6]) {
      expect(plain(await snapshotAsOf(db, t))).toEqual(plain(await sourceAsOf(db, t)))
    }
  })

  it('loses a change that is undone between two snapshots', async () => {
    await snapshot(db, 2)
    await updatePlan(db, 1, 'enterprise', 3) // trial upgrade...
    await updatePlan(db, 1, 'free', 4) // ...cancelled before the next snapshot
    await snapshot(db, 5)
    expect((await readSnapshots(db)).filter((s) => s.id === 1)).toHaveLength(1)
    expect((await sourceAsOf(db, 3)).find((c) => c.id === 1)?.plan).toBe('enterprise')
    expect((await snapshotAsOf(db, 3)).find((c) => c.id === 1)?.plan).toBe('free')
  })
})
