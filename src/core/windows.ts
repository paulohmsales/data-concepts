/**
 * Window functions, evaluated step by step so the UI can show *which rows* each result used:
 *   1. PARTITION BY splits rows into groups (or one group without it);
 *   2. ORDER BY sorts each group; rows with equal sort keys are "peers";
 *   3. the frame picks, for the current row, the slice of its partition an aggregate sees.
 * The same spec also renders as SQL; tests check this evaluator against DuckDB.
 */
export interface Sale {
  store: string
  day: number
  amount: number
}

export const SALES: Sale[] = [
  { store: 'A', day: 1, amount: 10 },
  { store: 'A', day: 2, amount: 20 },
  { store: 'A', day: 2, amount: 5 },
  { store: 'A', day: 3, amount: 30 },
  { store: 'A', day: 4, amount: 15 },
  { store: 'B', day: 1, amount: 40 },
  { store: 'B', day: 3, amount: 10 },
  { store: 'B', day: 4, amount: 25 },
  { store: 'B', day: 5, amount: 5 },
]

export const SALES_SETUP = [
  `CREATE OR REPLACE TABLE sales (store VARCHAR, day INTEGER, amount INTEGER)`,
  `INSERT INTO sales VALUES ${SALES.map((s) => `('${s.store}', ${s.day}, ${s.amount})`).join(', ')}`,
] as const

export type Fn = 'row_number' | 'rank' | 'dense_rank' | 'lag' | 'sum' | 'avg' | 'first_value' | 'last_value'
export type Order = 'none' | 'day' | 'day_amount'
export type Frame = 'default' | 'rows_unbounded' | 'rows_2' | 'whole'

export interface WindowSpec {
  fn: Fn
  partition: boolean
  order: Order
  frame: Frame
}

export const RANKING: readonly Fn[] = ['row_number', 'rank', 'dense_rank', 'lag']
export const usesFrame = (fn: Fn) => !RANKING.includes(fn)

const ORDER_SQL: Record<Order, string> = { none: '', day: 'ORDER BY day', day_amount: 'ORDER BY day, amount' }
const FRAME_SQL: Record<Frame, string> = {
  default: '',
  rows_unbounded: 'ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW',
  rows_2: 'ROWS BETWEEN 2 PRECEDING AND CURRENT ROW',
  whole: 'ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING',
}

export function overClause(s: WindowSpec): string {
  const parts = [s.partition ? 'PARTITION BY store' : '', ORDER_SQL[s.order], usesFrame(s.fn) ? FRAME_SQL[s.frame] : '']
  return `OVER (${parts.filter(Boolean).join(' ')})`
}

export function windowSql(s: WindowSpec): string {
  const call = RANKING.includes(s.fn) && s.fn !== 'lag' ? `${s.fn}()` : `${s.fn}(amount)`
  return `SELECT store, day, amount,
       ${call} ${overClause(s)} AS result
FROM sales
ORDER BY store, day, amount`
}

/** What the default frame means, in words (the source of most window bugs). */
export function frameInWords(s: WindowSpec): string {
  if (!usesFrame(s.fn)) return 'Ranking and LAG ignore the frame: they only look at the order.'
  if (s.frame === 'default')
    return s.order === 'none'
      ? 'No ORDER BY, so the default frame is the whole partition.'
      : 'With ORDER BY, the default frame is RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW: everything up to the current row, including all of its peers (rows that tie on the sort key).'
  if (s.frame === 'rows_unbounded') return 'Physical rows from the start of the partition to the current row; ties are split.'
  if (s.frame === 'rows_2') return 'The current row and the two physical rows before it: a 3-row moving window.'
  return 'Every row of the partition, whatever the current row is.'
}

export interface Evaluated extends Sale {
  /** Position in display order (store, day, amount). */
  i: number
  value: number | null
  partition: number[]
  frame: number[]
}

const cmp = (a: Sale, b: Sale, order: Order) => (order === 'none' ? 0 : a.day - b.day || (order === 'day_amount' ? a.amount - b.amount : 0))
const peers = (a: Sale, b: Sale, order: Order) => cmp(a, b, order) === 0

/** Evaluate the spec over `rows`. Ties keep display order (SQL leaves them arbitrary). */
export function evaluate(rows: readonly Sale[], s: WindowSpec): Evaluated[] {
  const display = [...rows].sort((a, b) => a.store.localeCompare(b.store) || a.day - b.day || a.amount - b.amount)
  const groups = new Map<string, number[]>()
  display.forEach((r, i) => {
    const key = s.partition ? r.store : '*'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(i)
  })
  const out: Evaluated[] = display.map((r, i) => ({ ...r, i, value: null, partition: [], frame: [] }))
  for (const ids of groups.values()) {
    // stable sort inside the partition
    const sorted = [...ids].sort((a, b) => cmp(display[a], display[b], s.order) || a - b)
    sorted.forEach((id, k) => {
      const cur = display[id]
      const firstPeer = sorted.findIndex((j) => peers(display[j], cur, s.order))
      let lastPeer = firstPeer
      while (lastPeer + 1 < sorted.length && peers(display[sorted[lastPeer + 1]], cur, s.order)) lastPeer++
      let lo = 0
      let hi = sorted.length - 1
      if (s.frame === 'default') hi = s.order === 'none' ? sorted.length - 1 : lastPeer
      else if (s.frame === 'rows_unbounded') hi = k
      else if (s.frame === 'rows_2') {
        lo = Math.max(0, k - 2)
        hi = k
      }
      const frame = sorted.slice(lo, hi + 1)
      const vals = frame.map((j) => display[j].amount)
      const distinctBefore = new Set(sorted.slice(0, firstPeer).map((j) => `${display[j].day}|${s.order === 'day_amount' ? display[j].amount : ''}`)).size
      const value: Record<Fn, number | null> = {
        row_number: k + 1,
        rank: firstPeer + 1,
        dense_rank: s.order === 'none' ? 1 : distinctBefore + 1,
        lag: k > 0 ? display[sorted[k - 1]].amount : null,
        sum: vals.reduce((a, b) => a + b, 0),
        avg: vals.reduce((a, b) => a + b, 0) / vals.length,
        first_value: vals[0],
        last_value: vals[vals.length - 1],
      }
      out[id] = { ...cur, i: id, value: value[s.fn], partition: sorted, frame: usesFrame(s.fn) ? frame : [] }
    })
  }
  return out
}

/** True when SQL guarantees a single answer for every row (no ties inside a ROWS frame or a row_number). */
export function deterministic(s: WindowSpec): boolean {
  if (s.order === 'day_amount') return true
  if (s.fn === 'rank' || s.fn === 'dense_rank') return true
  if (s.fn === 'row_number' || s.fn === 'lag') return false
  // which tied row comes first or last is arbitrary
  if (s.fn === 'first_value' || s.fn === 'last_value') return false
  // aggregates: RANGE (default) and whole-partition frames treat ties alike
  return s.frame === 'default' || s.frame === 'whole'
}

export const WINDOW_QUERIES = {
  qualify: `-- best sale per store: filter on a window result with QUALIFY
SELECT store, day, amount
FROM sales
QUALIFY row_number() OVER (PARTITION BY store ORDER BY amount DESC) = 1`,
  whereError: `-- ✗ window functions run after WHERE, so this is an error
SELECT store, day, amount
FROM sales
WHERE row_number() OVER (PARTITION BY store ORDER BY amount DESC) = 1`,
  subquery: `-- ✓ portable version: compute in a subquery, filter outside
SELECT * FROM (
  SELECT *, row_number() OVER (PARTITION BY store ORDER BY amount DESC) AS rn
  FROM sales
) WHERE rn = 1`,
  share: `-- share of each store's total, no GROUP BY needed
SELECT store, day, amount,
       sum(amount) OVER (PARTITION BY store) AS store_total,
       round(amount / sum(amount) OVER (PARTITION BY store), 2) AS share
FROM sales
ORDER BY store, day`,
  dayChange: `-- day-over-day change with LAG (note B has no day 2: LAG takes the previous ROW, not the previous day)
SELECT store, day, amount,
       lag(day) OVER w AS prev_day,
       amount - lag(amount) OVER w AS change
FROM (SELECT store, day, sum(amount) AS amount FROM sales GROUP BY ALL)
WINDOW w AS (PARTITION BY store ORDER BY day)
ORDER BY store, day`,
} as const
