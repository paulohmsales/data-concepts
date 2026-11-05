import { useState } from 'react'
import { Choice } from '../../components/Controls.tsx'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import QueryTable from '../../components/QueryTable.tsx'
import type { Row } from '../../core/db.ts'
import { acrossSql, DIM_SETUP, historyCore, historySql, lateSql, Q1_SOURCE_TOTAL, type Across, type History, type Late } from '../../core/dimensional.ts'
import { useDuckSchema } from '../../lib/useDuckSchema.ts'
import ScdTimeline from '../../visuals/ae/ScdTimeline.tsx'
import styles from '../common.module.css'

interface Controls {
  history: History
  late: Late
  across: Across
}
const DEFAULTS: Controls = { history: 't2', late: 'inner', across: 'fanout' }

const HISTORY: { value: History; label: string }[] = [
  { value: 't1', label: 'Type 1 (overwrite)' },
  { value: 't2', label: 'Type 2, as of sale' },
  { value: 't2cur', label: 'Type 2, current row' },
  { value: 't2bug', label: 'Type 2, no date filter' },
]
const LATE: { value: Late; label: string }[] = [
  { value: 'inner', label: 'Inner join' },
  { value: 'left', label: 'Left join' },
  { value: 'unknown', label: 'Unknown member (−1)' },
]
const ACROSS: { value: Across; label: string }[] = [
  { value: 'fanout', label: 'Join the two facts' },
  { value: 'local', label: 'Each system’s categories' },
  { value: 'conformed', label: 'Conformed dim_product' },
]

/** The TOTAL row reconciles (or doesn't) with the source's Q1 revenue. */
const totalCheck = (r: Row) => (r.region === 'TOTAL' ? (Number(r.revenue) === Q1_SOURCE_TOTAL ? 'hl' : 'bad') : r.region === '(null)' ? 'bad' : undefined)
const rateCheck = (r: Row) => (r.sales == null || r.returns == null || Number(r.return_pct) > 80 ? 'bad' : undefined)

export default function DimensionalModeling() {
  const { db } = useDuckSchema('dimensional', DIM_SETUP)
  const [c, setC] = useState(DEFAULTS)
  const set = <K extends keyof Controls>(k: K) => (v: Controls[K]) => setC((s) => ({ ...s, [k]: v }))

  return (
    <ModuleLayout
      onPreset={(p) => setC({ ...DEFAULTS, ...(p as Partial<Controls>) })}
      play={
        <>
          <div className={styles.card}>
            <h4>1 · History: Ana moved from North to South on 1 April</h4>
            <Choice label="How does a sale find its customer’s region?" value={c.history} onChange={set('history')} options={HISTORY} />
            <ScdTimeline props={{}} state={{ mode: c.history === 't2cur' ? 't1' : c.history }} />
            <div className={styles.grid2}>
              <pre className={styles.sql}>{historyCore(c.history)}</pre>
              <QueryTable db={db} sql={historySql(c.history)} caption={`Q1 revenue by region (source total: ${Q1_SOURCE_TOTAL})`} rowClass={totalCheck} />
            </div>
          </div>
          <div className={styles.card} style={{ marginTop: '1rem' }}>
            <h4>2 · A late-arriving customer: Davi bought in March but isn’t in dim_customer yet</h4>
            <Choice label="How are facts joined to the dimension?" value={c.late} onChange={set('late')} options={LATE} />
            <QueryTable db={db} sql={lateSql(c.late)} caption={`Q1 revenue by region (source total: ${Q1_SOURCE_TOTAL})`} rowClass={totalCheck} />
          </div>
          <div className={styles.card} style={{ marginTop: '1rem' }}>
            <h4>3 · Two facts, one question: return rate by category</h4>
            <Choice label="How are sales and returns combined?" value={c.across} onChange={set('across')} options={ACROSS} />
            <div className={styles.grid2}>
              <pre className={styles.sql}>{acrossSql(c.across)}</pre>
              <QueryTable db={db} sql={acrossSql(c.across)} caption="All sales and returns, Jan–Jun (true rates: Footwear 38.5%, Apparel 28.6%)" rowClass={rateCheck} />
            </div>
          </div>
        </>
      }
    />
  )
}
