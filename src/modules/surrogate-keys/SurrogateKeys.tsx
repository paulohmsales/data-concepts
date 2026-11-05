import { useState } from 'react'
import { Choice } from '../../components/Controls.tsx'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import QueryTable from '../../components/QueryTable.tsx'
import SqlLab, { type Preset } from '../../components/SqlLab.tsx'
import { attributionSql, dimSql, KEY_QUERIES as Q, SURROGATE_SETUP, type Day, type Strategy } from '../../core/surrogate.ts'
import { useDuckSchema } from '../../lib/useDuckSchema.ts'
import styles from '../common.module.css'

const STRATEGIES: { s: Strategy; title: string; how: string }[] = [
  { s: 'rownum', title: 'row_number() key', how: 'row_number() OVER (ORDER BY email)' },
  { s: 'hash', title: 'Hash key', how: 'md5(email)' },
]

const LAB: Preset[] = [
  { id: 'concat', label: 'Concat collision', kind: 'bug', sql: Q.concat, note: 'Two different products, one key. Joins will merge their facts, and a uniqueness test on product_sk is the only thing that would catch it.' },
  { id: 'separator', label: 'With a separator', kind: 'ok', sql: Q.separator, note: 'concat_ws inserts “|” between parts, so the boundaries are kept. (Pick a separator that can’t appear in the data.)' },
  { id: 'nullConcat', label: 'NULL with ||', kind: 'bug', sql: Q.nullConcat, note: 'In SQL, anything || NULL is NULL, so both rows get a NULL key. A NULL key can’t be joined to anything.' },
  { id: 'nullConcatWs', label: 'NULL with concat_ws', kind: 'bug', sql: Q.nullConcatWs, note: 'concat_ws drops NULLs: (acme, x1, NULL) and (acme, NULL, x1) both become “acme|x1”. One key for two products.' },
  { id: 'dbtStyle', label: 'dbt-style key', kind: 'ok', sql: Q.dbtStyle, note: 'Cast every part to text, replace NULL with a marker, then join with a separator: four products, four keys.' },
  { id: 'types', label: '7 vs "007"', kind: 'bug', sql: Q.types, note: 'Hashes compare bytes. If two sources format the natural key differently, the “same” customer gets two keys. Normalise (cast, trim, lower-case) before hashing.' },
]

export default function SurrogateKeys() {
  const { db, error } = useDuckSchema('surrogate', SURROGATE_SETUP)
  const [day, setDay] = useState<Day>('day1')
  const [req, setReq] = useState<{ id: string; n: number } | null>(null)
  const onPreset = (p: Record<string, unknown>) => {
    if (p.day) setDay(p.day as Day)
    if (p.preset) setReq((r) => ({ id: String(p.preset), n: (r?.n ?? 0) + 1 }))
  }

  const attribution = (s: Strategy) => (
    <QueryTable
      db={db}
      sql={attributionSql(s, day)}
      caption="Facts loaded on day 1, joined to this day’s dimension"
      rowClass={(r) => (r.true_customer === r.dashboard_says ? undefined : 'bad')}
    />
  )

  return (
    <ModuleLayout
      onPreset={onPreset}
      play={
        <>
          <Choice
            label="Which build of the customer dimension?"
            value={day}
            onChange={setDay}
            options={[
              { value: 'day1', label: 'Day 1: Bruno, Carla, Davi' },
              { value: 'day2', label: 'Day 2: Ana signs up, dimension rebuilt' },
            ]}
          />
          <div className={styles.grid2} style={{ marginTop: '1rem' }}>
            {STRATEGIES.map(({ s, title, how }) => (
              <div key={s} className={styles.card}>
                <h4>{title}</h4>
                <code>{how}</code>
                <QueryTable db={db} sql={dimSql(s, day)} caption={`dim_customers as built on ${day.replace('day', 'day ')}`} />
                {attribution(s)}
              </div>
            ))}
          </div>
        </>
      }
      breakIt={
        <>
          <p className="lede">
            Hashing fixes stability, but a hash of the wrong string is still wrong. Composite keys have
            three classic traps.
          </p>
          <SqlLab key={req ? `lab-${req.n}` : 'lab'} initial={req?.id} db={db} error={error} presets={LAB} />
        </>
      }
    />
  )
}
