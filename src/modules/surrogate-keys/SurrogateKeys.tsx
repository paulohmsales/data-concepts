import { useState } from 'react'
import { Choice } from '../../components/Controls.tsx'
import ExplainBack from '../../components/ExplainBack.tsx'
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
      title="Surrogate keys"
      intuition={
        <>
          <p>
            A <b>natural key</b> comes from the business: an email, an order number, a SKU. A{' '}
            <b>surrogate key</b> is one the warehouse makes up, so facts can point at dimension rows with a
            single, uniform, joinable column, even when the natural key is long, composite, or arrives in
            different formats from different systems.
          </p>
          <p>
            The one property that matters is <b>stability</b>: the same entity must get the same key
            every time the model is rebuilt. Otherwise every fact table that stored the old key now
            points at someone else. A key computed from the row’s own natural key (a hash) is stable. A
            key that depends on what else is in the table (row_number, an auto-increment in a rebuilt
            table) is not.
          </p>
        </>
      }
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
          <p className="try">
            Switch to day 2. Ana’s email sorts first, so row_number renumbers everyone: Bruno’s old key 1
            now belongs to Ana. The fact table still says customer_sk = 1 for Bruno’s order, and the dashboard
            silently credits it to Ana. The hash keys don’t care who else exists.
          </p>
        </>
      }
      breakIt={
        <>
          <p className="lede">
            Hashing fixes stability, but a hash of the wrong string is still wrong. Composite keys have
            three classic traps.
          </p>
          <SqlLab db={db} error={error} presets={LAB} />
        </>
      }
      explainBack={
        <ExplainBack
          questions={[
            {
              q: 'Why do warehouses use surrogate keys at all, instead of joining on natural keys?',
              a: 'One uniform join column regardless of how many natural-key parts there are; a key that stays the same when natural keys are reformatted or merged across systems; and, with SCD2, one key per version of an entity (the natural key repeats across versions).',
            },
            {
              q: 'Why is row_number() a dangerous surrogate key?',
              a: 'It depends on the whole table’s contents and ordering at build time. A new or deleted row shifts the numbers, so facts loaded earlier now reference different entities. Nothing errors; the attribution is just wrong.',
            },
            {
              q: 'What are the pitfalls of md5(col_a || col_b)?',
              a: 'Boundary collisions (“ab”+“c” = “a”+“bc”), NULLs making the key NULL (or collapsing with concat_ws), and type/format differences changing the hash. Cast, coalesce NULLs to a marker, join with a separator, and normalise formats first.',
            },
            {
              q: 'Hash collisions in md5: should you worry?',
              a: 'Not from random chance at warehouse scale (128 bits: you’d need ~10¹⁹ keys for a realistic collision chance). Worry about the input string collisions above, and keep a uniqueness test on the key.',
            },
          ]}
        />
      }
    />
  )
}
