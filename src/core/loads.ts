/**
 * Module 2: snapshots and incremental loads.
 *
 * A small `source` table (an app's customers) is copied into a warehouse three ways:
 *   - full reload        → target_full
 *   - incremental load   → target_incr   (by an updated_at watermark)
 *   - SCD2 snapshot      → snap_customers (valid_from / valid_to history)
 *
 * Time is a logical clock (integer ticks), so the timelines stay readable.
 */
import { lit, type Db } from './db.ts'

export interface Customer {
  id: number
  name: string
  plan: string
  updated_at: number
}

export interface SnapRow extends Customer {
  valid_from: number
  valid_to: number | null
}

const COLS = 'id, name, plan, updated_at'

const TABLES = ['source', 'source_log', 'target_full', 'target_incr', 'snap_customers', 'etl_state', 'batch']

/** Drop everything, so the sandbox can start over on the same connection. */
export async function dropSchema(db: Db): Promise<void> {
  for (const t of TABLES) await db.run(`DROP TABLE IF EXISTS ${t}`)
}

export async function createSchema(db: Db): Promise<void> {
  for (const sql of [
    // The operational database we copy from.
    `CREATE TABLE source (id INTEGER PRIMARY KEY, name VARCHAR, plan VARCHAR, updated_at INTEGER)`,
    // Ground truth: every change as it became visible in the source (for "what was true at T").
    `CREATE TABLE source_log (seen_at INTEGER, op VARCHAR, id INTEGER, name VARCHAR, plan VARCHAR, updated_at INTEGER)`,
    // Warehouse targets. No primary keys: a buggy job is allowed to create duplicates.
    `CREATE TABLE target_full (id INTEGER, name VARCHAR, plan VARCHAR, updated_at INTEGER, loaded_at INTEGER)`,
    `CREATE TABLE target_incr (id INTEGER, name VARCHAR, plan VARCHAR, updated_at INTEGER, loaded_at INTEGER)`,
    `CREATE TABLE snap_customers (id INTEGER, name VARCHAR, plan VARCHAR, updated_at INTEGER, valid_from INTEGER, valid_to INTEGER)`,
    // Job bookkeeping: the incremental watermark and when each job last finished.
    `CREATE TABLE etl_state (job VARCHAR PRIMARY KEY, watermark INTEGER, last_run INTEGER)`,
  ]) {
    await db.run(sql)
  }
}

// ---------------------------------------------------------------------------------------------
// Source mutations (what the app does to its own database)
// ---------------------------------------------------------------------------------------------

/**
 * Insert a customer. `updatedAt` defaults to `now`; pass an earlier tick for a late-arriving row
 * (e.g. a replica that lagged, or a mobile client syncing old edits): it shows up now, but its
 * updated_at says it changed in the past.
 */
export async function insertCustomer(
  db: Db,
  c: { id: number; name: string; plan: string },
  now: number,
  updatedAt = now,
): Promise<void> {
  await db.run(`INSERT INTO source VALUES (${c.id}, ${lit(c.name)}, ${lit(c.plan)}, ${updatedAt})`)
  await db.run(
    `INSERT INTO source_log VALUES (${now}, 'insert', ${c.id}, ${lit(c.name)}, ${lit(c.plan)}, ${updatedAt})`,
  )
}

export async function updatePlan(db: Db, id: number, plan: string, now: number): Promise<void> {
  await db.run(`UPDATE source SET plan = ${lit(plan)}, updated_at = ${now} WHERE id = ${id}`)
  await db.run(
    `INSERT INTO source_log SELECT ${now}, 'update', id, name, plan, updated_at FROM source WHERE id = ${id}`,
  )
}

/** A hard delete: the row is simply gone. Nothing with an updated_at is left to notice. */
export async function deleteCustomer(db: Db, id: number, now: number): Promise<void> {
  await db.run(
    `INSERT INTO source_log SELECT ${now}, 'delete', id, name, plan, updated_at FROM source WHERE id = ${id}`,
  )
  await db.run(`DELETE FROM source WHERE id = ${id}`)
}

// ---------------------------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------------------------

async function recordRun(db: Db, job: string, now: number, watermark: number | null = null) {
  await db.run(
    `INSERT INTO etl_state VALUES (${lit(job)}, ${watermark ?? 'NULL'}, ${now})
     ON CONFLICT (job) DO UPDATE SET watermark = EXCLUDED.watermark, last_run = EXCLUDED.last_run`,
  )
}

/**
 * Full reload: throw the target away and copy everything. Always correct afterwards, simple,
 * and idempotent, but cost grows with the table, not with the change.
 * The transaction makes it atomic: readers never see the empty table in between.
 */
export async function fullReload(db: Db, now: number): Promise<void> {
  await db.run('BEGIN TRANSACTION')
  await db.run('DELETE FROM target_full')
  await db.run(`INSERT INTO target_full SELECT ${COLS}, ${now} FROM source`)
  await db.run('COMMIT')
  await recordRun(db, 'full', now)
}

export interface IncrementalOptions {
  /** merge: replace rows by key (idempotent). append: just INSERT (duplicates on rerun). */
  write: 'merge' | 'append'
  /**
   * maxLoaded: next watermark = max(updated_at) of the rows actually loaded (correct).
   * jobEnd: next watermark = the time the job finished (loses changes made while it ran).
   */
  watermark: 'maxLoaded' | 'jobEnd'
  /** Simulate a crash after writing the rows but before saving the watermark. */
  crashBeforeWatermark?: boolean
  /** Something the source does while the job is running (between extract and finish). */
  duringRun?: (tick: number) => Promise<void>
}

export interface IncrementalResult {
  previousWatermark: number
  extracted: number
  newWatermark: number | null
  crashed: boolean
}

/**
 * Incremental load by watermark: only copy rows with updated_at > last watermark.
 * The job takes two ticks: it extracts at `now` and finishes at `now + 1`.
 */
export async function incrementalLoad(
  db: Db,
  now: number,
  opts: IncrementalOptions,
): Promise<IncrementalResult> {
  const [state] = await db.all<{ watermark: number | null }>(
    `SELECT watermark FROM etl_state WHERE job = 'incremental'`,
  )
  const previousWatermark = state?.watermark ?? -1

  // Extract
  await db.run('DROP TABLE IF EXISTS batch')
  await db.run(
    `CREATE TEMP TABLE batch AS SELECT ${COLS} FROM source WHERE updated_at > ${previousWatermark}`,
  )
  const [{ n: extracted, max_updated: maxUpdated }] = await db.all<{ n: number; max_updated: number | null }>(
    `SELECT count(*) AS n, max(updated_at) AS max_updated FROM batch`,
  )

  const end = now + 1
  if (opts.duringRun) await opts.duringRun(end)

  // Load
  await db.run('BEGIN TRANSACTION')
  if (opts.write === 'merge') {
    await db.run(`DELETE FROM target_incr WHERE id IN (SELECT id FROM batch)`)
  }
  await db.run(`INSERT INTO target_incr SELECT ${COLS}, ${end} FROM batch`)
  await db.run('COMMIT')

  if (opts.crashBeforeWatermark) {
    return { previousWatermark, extracted, newWatermark: null, crashed: true }
  }

  const newWatermark =
    opts.watermark === 'jobEnd' ? end : Math.max(previousWatermark, maxUpdated ?? previousWatermark)
  await recordRun(db, 'incremental', end, newWatermark)
  return { previousWatermark, extracted, newWatermark, crashed: false }
}

/**
 * SCD2 snapshot (dbt "check" strategy on name and plan, with hard deletes invalidated).
 * Compares the source now with the current history rows:
 *   changed → close the old version, open a new one; new → open; deleted → close.
 * History is only as fine-grained as the snapshot schedule: two changes between runs
 * look like one.
 */
export async function snapshot(db: Db, now: number): Promise<{ opened: number; closed: number }> {
  const [{ n: before }] = await db.all<{ n: number }>(
    `SELECT count(*) AS n FROM snap_customers WHERE valid_to IS NULL`,
  )
  await db.run('BEGIN TRANSACTION')
  // 1. Close versions whose values changed, and versions whose key vanished from the source.
  await db.run(
    `UPDATE snap_customers AS h SET valid_to = ${now}
     WHERE h.valid_to IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM source s WHERE s.id = h.id AND s.name = h.name AND s.plan = h.plan
       )`,
  )
  const [{ n: stillOpen }] = await db.all<{ n: number }>(
    `SELECT count(*) AS n FROM snap_customers WHERE valid_to IS NULL`,
  )
  // 2. Open a version for every source row that has no current version.
  await db.run(
    `INSERT INTO snap_customers
     SELECT s.id, s.name, s.plan, s.updated_at, ${now}, NULL FROM source s
     WHERE NOT EXISTS (SELECT 1 FROM snap_customers h WHERE h.id = s.id AND h.valid_to IS NULL)`,
  )
  const [{ n: after }] = await db.all<{ n: number }>(
    `SELECT count(*) AS n FROM snap_customers WHERE valid_to IS NULL`,
  )
  await db.run('COMMIT')
  await recordRun(db, 'snapshot', now)
  return { opened: after - stillOpen, closed: before - stillOpen }
}

// ---------------------------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------------------------

export const readSource = (db: Db) =>
  db.all<Customer>(`SELECT ${COLS} FROM source ORDER BY id`)

export const readTarget = (db: Db, table: 'target_full' | 'target_incr') =>
  db.all<Customer & { loaded_at: number }>(`SELECT ${COLS}, loaded_at FROM ${table} ORDER BY id, loaded_at`)

export const readSnapshots = (db: Db) =>
  db.all<SnapRow>(`SELECT ${COLS}, valid_from, valid_to FROM snap_customers ORDER BY id, valid_from`)

/** "What did the dashboard show at time T": the snapshot version valid at T. */
export const snapshotAsOf = (db: Db, t: number) =>
  db.all<Customer>(
    `SELECT ${COLS} FROM snap_customers
     WHERE valid_from <= ${t} AND (valid_to IS NULL OR valid_to > ${t})
     ORDER BY id`,
  )

/** What was really in the source at time T (from the change log). */
export const sourceAsOf = (db: Db, t: number) =>
  db.all<Customer>(
    `SELECT id, name, plan, updated_at FROM (
       SELECT *, row_number() OVER (PARTITION BY id ORDER BY seen_at DESC, op = 'delete' DESC) AS rn
       FROM source_log WHERE seen_at <= ${t}
     ) WHERE rn = 1 AND op <> 'delete'
     ORDER BY id`,
  )

export type RowStatus = 'ok' | 'stale' | 'missing' | 'ghost' | 'duplicate'

export interface Diff {
  id: number
  status: RowStatus
  sourcePlan: string | null
  targetPlan: string | null
  copies: number
}

/**
 * Compare a target with the source, key by key:
 *   missing   in source, not in target          (e.g. a late-arriving row the watermark skipped)
 *   ghost     in target, gone from source       (a hard delete nobody propagated)
 *   duplicate more than one copy of a key       (a non-idempotent rerun)
 *   stale     one copy, but different values    (a change that was never picked up)
 */
export const diffAgainstSource = (db: Db, table: 'target_full' | 'target_incr') =>
  db.all<Diff>(
    `WITH t AS (
       SELECT id, count(*) AS copies, any_value(plan) AS plan, any_value(name) AS name
       FROM ${table} GROUP BY id
     )
     SELECT coalesce(s.id, t.id) AS id,
            CASE WHEN t.id IS NULL THEN 'missing'
                 WHEN s.id IS NULL THEN 'ghost'
                 WHEN t.copies > 1 THEN 'duplicate'
                 WHEN s.plan <> t.plan OR s.name <> t.name THEN 'stale'
                 ELSE 'ok' END AS status,
            s.plan AS sourcePlan, t.plan AS targetPlan, coalesce(t.copies, 0) AS copies
     FROM source s FULL OUTER JOIN t ON s.id = t.id
     ORDER BY id`,
  )

export const readState = (db: Db) =>
  db.all<{ job: string; watermark: number | null; last_run: number }>(
    `SELECT job, watermark, last_run FROM etl_state ORDER BY job`,
  )
