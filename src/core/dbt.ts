/**
 * dbt in practice: a project DAG with node selection, and the cost of materialisation choices.
 */
export interface Model {
  id: string
  deps: string[]
  minutes: number
  col: number
  row: number
  source?: boolean
}

export const DAG: Model[] = [
  { id: 'raw.orders', deps: [], minutes: 0, col: 0, row: 0, source: true },
  { id: 'raw.payments', deps: [], minutes: 0, col: 0, row: 1, source: true },
  { id: 'raw.customers', deps: [], minutes: 0, col: 0, row: 2, source: true },
  { id: 'raw.events', deps: [], minutes: 0, col: 0, row: 3, source: true },
  { id: 'stg_orders', deps: ['raw.orders'], minutes: 1, col: 1, row: 0 },
  { id: 'stg_payments', deps: ['raw.payments'], minutes: 1, col: 1, row: 1 },
  { id: 'stg_customers', deps: ['raw.customers'], minutes: 1, col: 1, row: 2 },
  { id: 'stg_events', deps: ['raw.events'], minutes: 6, col: 1, row: 3 },
  { id: 'int_order_payments', deps: ['stg_orders', 'stg_payments'], minutes: 3, col: 2, row: 0 },
  { id: 'int_sessions', deps: ['stg_events'], minutes: 12, col: 2, row: 3 },
  { id: 'fct_orders', deps: ['int_order_payments', 'stg_customers'], minutes: 4, col: 3, row: 0 },
  { id: 'dim_customers', deps: ['stg_customers', 'int_order_payments'], minutes: 2, col: 3, row: 2 },
  { id: 'fct_sessions', deps: ['int_sessions', 'dim_customers'], minutes: 8, col: 3, row: 3 },
  { id: 'revenue_daily', deps: ['fct_orders'], minutes: 1, col: 4, row: 0 },
  { id: 'marketing_roi', deps: ['fct_orders', 'fct_sessions'], minutes: 3, col: 4, row: 2 },
]

const byId = new Map(DAG.map((m) => [m.id, m]))
const children = (id: string) => DAG.filter((m) => m.deps.includes(id)).map((m) => m.id)

function walk(start: string, next: (id: string) => string[]): Set<string> {
  const seen = new Set<string>()
  const stack = [start]
  while (stack.length) {
    const id = stack.pop()!
    if (seen.has(id)) continue
    seen.add(id)
    stack.push(...next(id))
  }
  return seen
}
export const ancestors = (id: string) => walk(id, (x) => byId.get(x)?.deps ?? [])
export const descendants = (id: string) => walk(id, children)

export type Selector = 'only' | 'down' | 'up' | 'at' | 'all'
export const SELECTOR_SYNTAX: Record<Selector, (m: string) => string> = {
  only: (m) => `dbt build --select ${m}`,
  down: (m) => `dbt build --select ${m}+`,
  up: (m) => `dbt build --select +${m}`,
  at: (m) => `dbt build --select @${m}`,
  all: () => `dbt build`,
}

/** Models (not sources) a selector builds when `changed` was edited. */
export function select(sel: Selector, changed: string): Set<string> {
  let s: Set<string>
  if (sel === 'only') s = new Set([changed])
  else if (sel === 'down') s = descendants(changed)
  else if (sel === 'up') s = ancestors(changed)
  else if (sel === 'at') {
    // @: the model, its descendants, and every ancestor of those descendants
    s = new Set<string>()
    for (const d of descendants(changed)) for (const a of ancestors(d)) s.add(a)
  } else s = new Set(DAG.map((m) => m.id))
  return new Set([...s].filter((id) => !byId.get(id)?.source))
}

export interface SelectionReport {
  built: Set<string>
  minutes: number
  /** Downstream of the change but not rebuilt or tested: breakage would reach production. */
  untested: Set<string>
  /** Rebuilt although nothing they depend on changed. */
  wasted: Set<string>
}

export function report(sel: Selector, changed: string): SelectionReport {
  const built = select(sel, changed)
  const affected = descendants(changed)
  return {
    built,
    minutes: [...built].reduce((a, id) => a + (byId.get(id)?.minutes ?? 0), 0),
    untested: new Set([...affected].filter((id) => !built.has(id))),
    wasted: new Set([...built].filter((id) => !affected.has(id))),
  }
}

/** Serial build time of the whole project, in minutes. */
export const FULL_MINUTES = DAG.reduce((a, m) => a + m.minutes, 0)

/* ---------- materialisation economics ---------- */

export interface MatParams {
  /** size of the model's output, GB */
  sizeGb: number
  /** queries against the model per day */
  readsPerDay: number
  /** builds per day (1 = daily, 24 = hourly) */
  buildsPerDay: number
  /** fraction of the data that is new each day */
  dailyNew: number
  /** days re-processed by each incremental run, to catch late data */
  lookbackDays: number
}

/** Building scans the inputs, assumed ~2× the output (joins, wider sources). */
const INPUT_FACTOR = 2
/** A dashboard query on a stored table scans ~10% of it (column pruning, partition filters). */
const QUERY_FRACTION = 0.1
/** An incremental MERGE also touches ~5% of the target to find matching rows. */
const MERGE_FRACTION = 0.05
/** $ per GB scanned (on-demand pricing in the $5–6.25/TB range). */
export const USD_PER_GB = 0.00625

export type Materialization = 'view' | 'table' | 'incremental'

/** GB scanned per day for each materialisation. */
export function scannedPerDay(m: Materialization, p: MatParams): number {
  const input = p.sizeGb * INPUT_FACTOR
  const read = p.sizeGb * QUERY_FRACTION
  if (m === 'view') return p.readsPerDay * input // every query re-runs the model's SQL
  if (m === 'table') return p.buildsPerDay * input + p.readsPerDay * read
  // each run processes what arrived since the last run, plus the whole lookback window again
  const perRunNew = Math.min(1, p.dailyNew / p.buildsPerDay + p.dailyNew * p.lookbackDays)
  return p.buildsPerDay * (input * perRunNew + p.sizeGb * MERGE_FRACTION) + p.readsPerDay * read
}

export const costPerDay = (m: Materialization, p: MatParams) => scannedPerDay(m, p) * USD_PER_GB
