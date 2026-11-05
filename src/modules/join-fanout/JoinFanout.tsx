import * as Plot from '@observablehq/plot'
import { useCallback, useEffect, useState } from 'react'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import PlotFigure from '../../components/PlotFigure.tsx'
import QueryTable from '../../components/QueryTable.tsx'
import SqlLab, { type Preset } from '../../components/SqlLab.tsx'
import type { VizTheme } from '../../components/vizTheme.ts'
import { FANOUT_QUERIES as Q, FANOUT_SETUP, TRUE_REVENUE } from '../../core/fanout.ts'
import { useDuckSchema } from '../../lib/useDuckSchema.ts'
import styles from '../common.module.css'

const PLAY: Preset[] = [
  { id: 'grain', label: 'Order grain', sql: Q.grain, note: 'One row per order: the sum is the real revenue, 420.' },
  { id: 'joinRows', label: 'Join items', sql: Q.joinRows, note: 'Four orders became seven rows. Each order’s amount now appears once per item: orders 101 and 104 repeat.' },
  { id: 'preAggregate', label: 'Aggregate, then join', sql: Q.preAggregate, note: 'Every table is brought to one row per order before joining, so the joins are one-to-one and nothing repeats.' },
  { id: 'grainTest', label: 'Grain test', sql: Q.grainTest, note: 'Any row returned is a key that appears more than once: the result is no longer at order grain.' },
]

const BREAK: Preset[] = [
  { id: 'sumAfterJoin', label: 'Sum after join', kind: 'bug', sql: Q.sumAfterJoin, note: '940 instead of 420. Nothing errors and the count of orders is still 4. Only the total is wrong.' },
  { id: 'twoJoins', label: 'Two one-to-many joins', kind: 'bug', sql: Q.twoJoins, note: 'Items × payments: order 104 (3 lines, 2 payments) appears 6 times, so its amount, its items and its payments are all multiplied.' },
  { id: 'sumDistinct', label: 'SUM(DISTINCT) “fix”', kind: 'bug', sql: Q.sumDistinct, note: '370: distinct removes repeated values, not repeated rows. Orders 102 and 103 both total 50, so one of them is dropped.' },
  { id: 'leftJoinFilter', label: 'WHERE after LEFT JOIN', kind: 'bug', sql: Q.leftJoinFilter, note: 'Davi has no orders, so his order_date is NULL and the WHERE drops him. Your “left” join became an inner join.' },
  { id: 'leftJoinOn', label: 'Condition in ON', kind: 'ok', sql: Q.leftJoinOn, note: 'Filtering inside ON keeps every customer, with 0 orders where nothing matches.' },
]

const REPORTED_SQL = {
  'order grain (truth)': `SELECT sum(amount) AS v FROM orders`,
  '× order_items': `SELECT sum(o.amount) AS v FROM orders o JOIN order_items USING (order_id)`,
  '× items × payments': `SELECT sum(o.amount) AS v FROM orders o JOIN order_items USING (order_id) JOIN payments USING (order_id)`,
  'SUM(DISTINCT)': `SELECT sum(DISTINCT o.amount) AS v FROM orders o JOIN order_items USING (order_id)`,
  'pre-aggregated joins': `WITH i AS (SELECT DISTINCT order_id FROM order_items), p AS (SELECT DISTINCT order_id FROM payments)
    SELECT sum(o.amount) AS v FROM orders o JOIN i USING (order_id) JOIN p USING (order_id)`,
}

export default function JoinFanout() {
  const { db, error } = useDuckSchema('fanout', FANOUT_SETUP)
  const [reported, setReported] = useState<{ query: string; v: number }[]>([])
  // experiments select a preset in one of the two SQL labs; remounting the lab runs it
  const [req, setReq] = useState<{ id: string; n: number } | null>(null)
  const mine = (presets: Preset[]) => !!req && presets.some((p) => p.id === req.id)
  const labKey = (presets: Preset[], name: string) => (mine(presets) ? `${name}-${req!.n}` : name)
  const labInitial = (presets: Preset[]) => (mine(presets) ? req!.id : undefined)

  useEffect(() => {
    if (!db) return
    const effect = { cancelled: false }
    Promise.all(Object.entries(REPORTED_SQL).map(async ([query, sql]) => ({ query, v: Number((await db.all<{ v: unknown }>(sql))[0].v) }))).then(
      (r) => !effect.cancelled && setReported(r),
    )
    return () => {
      effect.cancelled = true
    }
  }, [db])

  const build = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => ({
      width,
      height: 220,
      marginLeft: 150,
      x: { label: 'reported revenue →', grid: true },
      y: { label: null, domain: reported.map((r) => r.query) },
      marks: [
        Plot.barX(reported, { y: 'query', x: 'v', fill: (d: { v: number }) => (d.v === TRUE_REVENUE ? t.series1 : t.series2), rx: 4, tip: true }),
        Plot.text(reported, { y: 'query', x: 'v', text: (d: { v: number }) => (d.v === TRUE_REVENUE ? `${d.v} ✓` : `${d.v} ✗`), dx: 22, fill: t.ink }),
        Plot.ruleX([TRUE_REVENUE], { stroke: t.ink, strokeDasharray: '4 3' }),
        Plot.ruleX([0], { stroke: t.axis }),
      ],
    }),
    [reported],
  )

  return (
    <ModuleLayout
      onPreset={(p) => setReq((r) => ({ id: String(p.preset), n: (r?.n ?? 0) + 1 }))}
      play={
        <>
          <h3>The tables and their grains</h3>
          <div className={styles.grid2}>
            <div className={styles.card}>
              <h4>orders: one row per order</h4>
              <QueryTable db={db} sql="SELECT * FROM orders ORDER BY order_id" />
            </div>
            <div className={styles.card}>
              <h4>order_items: one row per order line</h4>
              <QueryTable db={db} sql="SELECT * FROM order_items ORDER BY order_id, sku" />
            </div>
            <div className={styles.card}>
              <h4>payments: one row per payment</h4>
              <QueryTable db={db} sql="SELECT * FROM payments ORDER BY order_id" />
            </div>
            <div className={styles.card}>
              <h4>customers: one row per customer</h4>
              <QueryTable db={db} sql="SELECT * FROM customers ORDER BY customer_id" />
            </div>
          </div>
          <h3>Same revenue, five answers</h3>
          <p className="lede">SUM(orders.amount) after different joins. Only the order-grain answers are right.</p>
          {reported.length > 0 && <PlotFigure build={build} label="Reported revenue by join strategy" />}
          <h3>Try it in SQL</h3>
          <p className="lede">This is a real DuckDB database running in your browser. Edit any query.</p>
          <SqlLab key={labKey(PLAY, 'play')} initial={labInitial(PLAY)} db={db} error={error} presets={PLAY} />
        </>
      }
      breakIt={
        <>
          <p className="lede">
            Each preset is a bug that ships to production all the time. Run it, read the note, then try
            to fix it yourself before looking at the fixed version.
          </p>
          <SqlLab key={labKey(BREAK, 'break')} initial={labInitial(BREAK)} db={db} error={error} presets={BREAK} />
        </>
      }
    />
  )
}
