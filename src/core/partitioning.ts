/**
 * Partition pruning, small files and skew, on a model of a table stored as files with
 * per-partition stats (how Hive/Iceberg/Delta tables and Parquet work).
 *
 * Table: one event per user per day-ish: 90 days × `rowsPerDay` rows, `users` distinct users.
 */
export type Scheme = 'none' | 'day' | 'month' | 'user'
export type QueryName = 'last7' | 'oneUser' | 'marchFn' | 'march' | 'all'

export interface TableModel {
  days: number
  rowsPerDay: number
  users: number
  /** Bytes per row. */
  rowBytes: number
  /** Target file size: partitions bigger than this are split into several files. */
  targetFileBytes: number
}

export const DEFAULT_TABLE: TableModel = {
  days: 90,
  rowsPerDay: 2_000_000,
  users: 50_000,
  rowBytes: 100,
  targetFileBytes: 256 * 2 ** 20,
}

export interface Partition {
  key: string
  /** Inclusive day range covered (0-based; day 59..89 is the last 31 days). */
  dayMin: number
  dayMax: number
  /** User range (for user partitions), else all users. */
  user?: number
  bytes: number
  files: number
}

const MONTH_STARTS = [0, 31, 59, 90] // Jan, Feb, Mar of a 90-day table

export function partitions(t: TableModel, scheme: Scheme): Partition[] {
  const total = t.days * t.rowsPerDay * t.rowBytes
  const files = (bytes: number) => Math.max(1, Math.ceil(bytes / t.targetFileBytes))
  if (scheme === 'none') return [{ key: 'all', dayMin: 0, dayMax: t.days - 1, bytes: total, files: files(total) }]
  if (scheme === 'day')
    return Array.from({ length: t.days }, (_, d) => {
      const bytes = t.rowsPerDay * t.rowBytes
      return { key: `day=${d + 1}`, dayMin: d, dayMax: d, bytes, files: files(bytes) }
    })
  if (scheme === 'month')
    return [0, 1, 2].map((m) => {
      const days = MONTH_STARTS[m + 1] - MONTH_STARTS[m]
      const bytes = days * t.rowsPerDay * t.rowBytes
      return { key: ['month=jan', 'month=feb', 'month=mar'][m], dayMin: MONTH_STARTS[m], dayMax: MONTH_STARTS[m + 1] - 1, bytes, files: files(bytes) }
    })
  // one partition per user: every user's rows across all days. Tiny files, and lots of them.
  const per = total / t.users
  return Array.from({ length: t.users }, (_, u) => ({ key: `user=${u}`, dayMin: 0, dayMax: t.days - 1, user: u, bytes: per, files: 1 }))
}

export interface QueryDef {
  label: string
  sql: string
  /** Can the engine decide from partition values alone whether a partition is needed? */
  prune: (p: Partition) => boolean
  /** Share of the rows inside a scanned partition that the query needs (for "useful bytes"). */
  needed: (p: Partition, t: TableModel) => number
}

const overlap = (p: Partition, lo: number, hi: number) => Math.max(0, Math.min(p.dayMax, hi) - Math.max(p.dayMin, lo) + 1) / (p.dayMax - p.dayMin + 1)

export const QUERIES: Record<QueryName, QueryDef> = {
  last7: {
    label: 'Last 7 days',
    sql: `WHERE event_date >= DATE '2026-03-25'`,
    prune: (p) => p.dayMax >= 83,
    needed: (p) => overlap(p, 83, 89),
  },
  oneUser: {
    label: 'One user’s history',
    sql: `WHERE user_id = 4242`,
    prune: (p) => p.user === undefined || p.user === 4242,
    needed: (p, t) => (p.user === 4242 ? 1 : p.user === undefined ? 1 / t.users : 0),
  },
  march: {
    label: 'March, by range',
    sql: `WHERE event_date BETWEEN DATE '2026-03-01' AND DATE '2026-03-31'`,
    prune: (p) => p.dayMax >= 59,
    needed: (p) => overlap(p, 59, 89),
  },
  marchFn: {
    label: 'March, via a function',
    sql: `WHERE strftime(event_date, '%Y-%m') = '2026-03'`,
    // a function wrapped around the partition column: many engines can't map it back to partitions
    prune: () => true,
    needed: (p) => overlap(p, 59, 89),
  },
  all: {
    label: 'Count everything',
    sql: `-- no WHERE`,
    prune: () => true,
    needed: () => 1,
  },
}

export interface Cost {
  partitionsScanned: number
  partitionsTotal: number
  filesScanned: number
  bytesScanned: number
  bytesNeeded: number
  /** Seconds: per-file overhead (open, read footer, schedule) + bytes / throughput. */
  seconds: number
}

export const FILE_OVERHEAD_S = 0.02
export const THROUGHPUT_BPS = 500 * 2 ** 20

export function queryCost(t: TableModel, scheme: Scheme, q: QueryName): Cost {
  const parts = partitions(t, scheme)
  const def = QUERIES[q]
  let partitionsScanned = 0
  let filesScanned = 0
  let bytesScanned = 0
  let bytesNeeded = 0
  for (const p of parts) {
    if (!def.prune(p)) continue
    partitionsScanned++
    filesScanned += p.files
    bytesScanned += p.bytes
    bytesNeeded += p.bytes * def.needed(p, t)
  }
  return {
    partitionsScanned,
    partitionsTotal: parts.length,
    filesScanned,
    bytesScanned,
    bytesNeeded,
    seconds: filesScanned * FILE_OVERHEAD_S + bytesScanned / THROUGHPUT_BPS,
  }
}

/**
 * Skew: rows are hash-partitioned by customer to `workers`; one hot customer has `hotShare` of all
 * rows. With salting, the hot key is split over `salt` sub-keys.
 */
export function workerLoads(workers: number, hotShare: number, salt: number): number[] {
  const loads = new Array<number>(workers).fill((1 - hotShare) / workers)
  // the hot key lands on worker 0; salting spreads it over `salt` consecutive workers
  const spread = Math.max(1, Math.min(salt, workers))
  for (let i = 0; i < spread; i++) loads[i % workers] += hotShare / spread
  return loads
}
