import * as Plot from '@observablehq/plot'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Choice, ResetButton, Toggle } from '../../components/Controls.tsx'
import DataTable from '../../components/DataTable.tsx'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import PlotFigure from '../../components/PlotFigure.tsx'
import SqlLab, { type Preset } from '../../components/SqlLab.tsx'
import Status from '../../components/Status.tsx'
import type { VizTheme } from '../../components/vizTheme.ts'
import { deterministic, evaluate, frameInWords, SALES, SALES_SETUP, usesFrame, WINDOW_QUERIES as Q, windowSql, type Fn, type Frame, type WindowSpec } from '../../core/windows.ts'
import { useDuckSchema } from '../../lib/useDuckSchema.ts'
import styles from '../common.module.css'

const DEFAULTS: WindowSpec = { fn: 'sum', partition: true, order: 'day_amount', frame: 'rows_unbounded' }

const FN_OPTIONS: { value: Fn; label: string }[] = [
  { value: 'row_number', label: 'row_number' },
  { value: 'rank', label: 'rank' },
  { value: 'dense_rank', label: 'dense_rank' },
  { value: 'lag', label: 'lag' },
  { value: 'sum', label: 'sum' },
  { value: 'avg', label: 'avg' },
  { value: 'first_value', label: 'first_value' },
  { value: 'last_value', label: 'last_value' },
]

const SCENARIOS: { label: string; spec: WindowSpec; select: number; note: string }[] = [
  {
    label: 'Running total with ties',
    spec: { fn: 'sum', partition: true, order: 'day', frame: 'default' },
    select: 1,
    note: 'Store A has two sales on day 2. With ORDER BY day and the default (RANGE) frame, they are peers, so both rows get 35, the total through the whole of day 2. A “running total” that jumps by two rows at once. Fix: an explicit ROWS frame and a tie-breaking sort key.',
  },
  {
    label: 'last_value surprise',
    spec: { fn: 'last_value', partition: true, order: 'day_amount', frame: 'default' },
    select: 0,
    note: 'You wanted each store’s last sale, but you get the current row’s own amount: the default frame stops at the current row, so the “last” row of the frame is the current one. Fix: ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING.',
  },
  {
    label: 'Forgot PARTITION BY',
    spec: { fn: 'sum', partition: false, order: 'day_amount', frame: 'rows_unbounded' },
    select: 5,
    note: 'Without PARTITION BY, the window is the whole table: store B’s running total starts with store A’s sales already in it, and the rows interleave by day. Click any B row: its frame reaches into A.',
  },
  {
    label: 'row_number on a tie',
    spec: { fn: 'row_number', partition: true, order: 'day', frame: 'default' },
    select: 1,
    note: 'The two day-2 rows tie on the sort key, so SQL may number them 2, 3 or 3, 2, and it can change between runs or engines. Dedup logic built on this (“keep row_number = 1”) is silently random. Always break ties with a unique column.',
  },
]

const LAB: Preset[] = [
  { id: 'whereError', label: 'WHERE on a window', kind: 'bug', sql: Q.whereError, note: 'Windows are computed after WHERE and GROUP BY, so WHERE can’t see them. That is a clear error at least.' },
  { id: 'qualify', label: 'QUALIFY', kind: 'ok', sql: Q.qualify, note: 'QUALIFY filters after windows are computed (DuckDB, Snowflake, BigQuery, Databricks).' },
  { id: 'subquery', label: 'Subquery', kind: 'ok', sql: Q.subquery, note: 'The portable pattern for engines without QUALIFY.' },
  { id: 'dayChange', label: 'LAG over gaps', kind: 'bug', sql: Q.dayChange, note: 'Store B has no day 2, so LAG on day 3 returns day 1: the “daily change” spans two days. Fill missing days first (a date spine) or join on day − 1.' },
  { id: 'share', label: 'Share of total', kind: 'ok', sql: Q.share, note: 'An aggregate with an empty ORDER BY sees the whole partition: per-row shares without a GROUP BY and a join back.' },
]

export default function WindowFunctions() {
  const [spec, setSpec] = useState(DEFAULTS)
  const [selected, setSelected] = useState(3)
  const [scenario, setScenario] = useState<string | null>(null)
  const [req, setReq] = useState<{ id: string; n: number } | null>(null)
  const onPreset = (p: Record<string, unknown>) => {
    const sc = SCENARIOS.find((x) => x.label === p.scenario)
    if (sc) {
      setSpec(sc.spec)
      setSelected(sc.select)
      setScenario(sc.label)
    } else if (p.spec) {
      setSpec({ ...DEFAULTS, ...(p.spec as Partial<WindowSpec>) })
      setSelected(Number(p.select ?? 0))
      setScenario(null)
    }
    if (p.preset) setReq((r) => ({ id: String(p.preset), n: (r?.n ?? 0) + 1 }))
  }
  const { db, error } = useDuckSchema('windows', SALES_SETUP)
  const [duck, setDuck] = useState<(number | null)[] | null>(null)
  const set = <K extends keyof WindowSpec>(k: K) => (v: WindowSpec[K]) => {
    setSpec((s) => ({ ...s, [k]: v }))
    setScenario(null)
  }

  const rows = useMemo(() => evaluate(SALES, spec), [spec])
  const sql = windowSql(spec)
  const cur = rows[selected]
  const det = deterministic(spec) && (spec.order !== 'none' || usesFrame(spec.fn))

  useEffect(() => {
    if (!db) return
    const effect = { cancelled: false }
    db.all<{ result: unknown }>(sql)
      .then((r) => !effect.cancelled && setDuck(r.map((x) => (x.result === null ? null : Number(x.result)))))
      .catch(() => !effect.cancelled && setDuck(null))
    return () => {
      effect.cancelled = true
    }
  }, [db, sql])

  const agree = duck && duck.every((v, i) => (v === null ? rows[i].value === null : rows[i].value !== null && Math.abs(v - rows[i].value!) < 1e-9))
  const fmt = (v: number | null | undefined) => (v === null || v === undefined ? 'NULL' : Number.isInteger(v) ? String(v) : v.toFixed(2))

  const buildLine = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => ({
      width,
      height: 220,
      x: { label: 'row, in display order →', ticks: rows.map((r) => r.i), tickFormat: (i: number) => `${rows[i].store}${rows[i].day}` },
      y: { label: `↑ ${spec.fn}(…)`, grid: true },
      color: { domain: ['A', 'B'], range: [t.series1, t.series2], legend: true },
      marks: [
        Plot.ruleY([0], { stroke: t.axis }),
        Plot.line(rows.filter((r) => r.value !== null), { x: 'i', y: 'value', stroke: 'store', z: 'store', strokeWidth: 2 }),
        Plot.dot(rows.filter((r) => r.value !== null), { x: 'i', y: 'value', fill: 'store', r: (d: { i: number }) => (d.i === selected ? 7 : 4), stroke: t.surface, strokeWidth: 2, tip: true }),
      ],
    }),
    [rows, spec.fn, selected],
  )

  const panel = (
    <>
      <Choice label="Function" value={spec.fn} onChange={set('fn')} options={FN_OPTIONS} />
      <Toggle label="PARTITION BY store" checked={spec.partition} onChange={set('partition')} />
      <Choice
        label="ORDER BY"
        value={spec.order}
        onChange={set('order')}
        options={[
          { value: 'none', label: 'none' },
          { value: 'day', label: 'day' },
          { value: 'day_amount', label: 'day, amount' },
        ]}
      />
      <Choice
        label="Frame"
        value={spec.frame}
        onChange={set('frame')}
        hint={usesFrame(spec.fn) ? undefined : 'ignored by ranking and LAG'}
        options={[
          { value: 'default', label: 'default' },
          { value: 'rows_unbounded', label: 'ROWS unbounded → current' },
          { value: 'rows_2', label: 'ROWS 2 preceding' },
          { value: 'whole', label: 'whole partition' },
        ] satisfies { value: Frame; label: string }[]}
      />
      <ResetButton
        onClick={() => {
          setSpec(DEFAULTS)
          setScenario(null)
        }}
      />
    </>
  )

  const table = (
    <DataTable
      rows={rows}
      rowKey={(r) => r.i}
      onRowClick={(r) => setSelected(r.i)}
      rowClass={(r) => (r.i === selected ? 'cur' : cur.frame.includes(r.i) ? 'hl' : cur.partition.includes(r.i) ? undefined : 'dim')}
      caption="Click a row to make it the current row. Highlighted: its frame. Greyed: outside its partition."
      columns={[
        { key: 'cur', label: '', render: (r) => (r.i === selected ? '▶' : '') },
        { key: 'store', label: 'store', render: (r) => r.store },
        { key: 'day', label: 'day', align: 'right', render: (r) => r.day },
        { key: 'amount', label: 'amount', align: 'right', render: (r) => r.amount },
        { key: 'value', label: 'result', align: 'right', render: (r) => fmt(r.value) },
        { key: 'duck', label: 'DuckDB says', align: 'right', render: (r) => (duck ? fmt(duck[r.i]) : '…') },
      ]}
    />
  )

  return (
    <ModuleLayout
      onPreset={onPreset}
      controls={panel}
      play={
        <>
          <pre className={styles.sql}>{sql}</pre>
          <p className="lede">{frameInWords(spec)}</p>
          {table}
          <p>
            {duck === null ? (
              'DuckDB is starting…'
            ) : agree ? (
              <Status level="good">DuckDB returns the same results</Status>
            ) : det ? (
              <Status level="bad">DuckDB disagrees</Status>
            ) : (
              <Status level="warn">ties: SQL may order peers differently, so DuckDB is allowed to differ here</Status>
            )}
          </p>
          <PlotFigure build={buildLine} label="Window result per row, by store" />
        </>
      }
      breakIt={
        <>
          {scenario ? (
            <>
              <pre className={styles.sql}>{sql}</pre>
              <div className={styles.card}>{SCENARIOS.find((s) => s.label === scenario)!.note}</div>
              {table}
            </>
          ) : (
            <p className="lede">Each experiment above loads a spec into the lab and selects the row to look at; the explanation appears here.</p>
          )}
          <h3>Filtering on windows, and gaps</h3>
          <SqlLab key={req ? `lab-${req.n}` : 'lab'} initial={req?.id} db={db} error={error} presets={LAB} />
        </>
      }
    />
  )
}
