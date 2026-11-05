import * as Plot from '@observablehq/plot'
import { useCallback, useEffect, useState } from 'react'
import ExplainBack from '../../components/ExplainBack.tsx'
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
      title="Grain and join fan-out"
      intuition={
        <>
          <p>
            Every table has a <b>grain</b>: what one row means. One row per order, per order line, per
            payment, per customer-day. Write it down for every model, because almost every wrong number in
            analytics comes from mixing grains without noticing.
          </p>
          <p>
            When you join an order (one row) to its items (many rows), the order is copied once per
            item. That is correct, since the join has to put the order next to each item. But the
            order-level numbers on those copies are now repeated, so summing them counts each order
            several times. That is <b>fan-out</b>. Two one-to-many joins on the same key multiply:
            3 items × 2 payments = 6 copies.
          </p>
          <p>
            Nothing errors. The query runs, the row count looks plausible, and the total is simply too
            big. The fix is to bring each table to the grain you want <em>before</em> joining, and to test
            the grain (a unique key test) on every model.
          </p>
        </>
      }
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
          <SqlLab db={db} error={error} presets={PLAY} />
        </>
      }
      breakIt={
        <>
          <p className="lede">
            Each preset is a bug that ships to production all the time. Run it, read the note, then try
            to fix it yourself before looking at the fixed version.
          </p>
          <SqlLab db={db} error={error} presets={BREAK} />
        </>
      }
      explainBack={
        <ExplainBack
          questions={[
            {
              q: 'What is the grain of a table, and why write it down?',
              a: 'What one row represents (one order, one order line, one user per day). Every measure is only safely additive at its own grain; knowing it tells you which joins will repeat rows and which aggregations are valid.',
            },
            {
              q: 'Why does joining orders to order items inflate total revenue?',
              a: 'The join emits one row per (order, item) pair, so each order’s amount appears once per item. Summing amount over those rows counts each order as many times as it has lines.',
            },
            {
              q: 'Why is SUM(DISTINCT amount) not a fix?',
              a: 'DISTINCT removes duplicate values, not duplicate rows: two different orders with the same amount collapse into one, so you undercount. You need to deduplicate by key (aggregate to order grain), not by value.',
            },
            {
              q: 'You need revenue, item count and amount paid per customer. How do you structure the query?',
              a: 'Aggregate each fact table to a common grain first (order or customer) in separate CTEs, then join those one-to-one on the key. Add a uniqueness test on the key at each step.',
            },
            {
              q: 'Why does a WHERE condition on the right table turn a LEFT JOIN into an inner join?',
              a: 'Unmatched rows have NULLs in the right table’s columns, and any comparison with NULL is not true, so WHERE removes them. Put the condition in the ON clause (or allow IS NULL) to keep unmatched left rows.',
            },
          ]}
        />
      }
    />
  )
}
