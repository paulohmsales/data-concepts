import type { Customer } from '../../core/loads.ts'
import styles from './Snapshots.module.css'

/** The snapshot's answer for time T next to the truth (from the source change log). */
export default function AsOfTable({ truth, snap, asOf }: { truth: Customer[]; snap: Customer[]; asOf: number }) {
  const ids = [...new Set([...truth, ...snap].map((c) => c.id))].sort((a, b) => a - b)
  const t = new Map(truth.map((c) => [c.id, c]))
  const s = new Map(snap.map((c) => [c.id, c]))
  const wrong = ids.filter((id) => t.get(id)?.plan !== s.get(id)?.plan).length

  return (
    <>
      <h4>What did we know at T = {asOf}?</h4>
      <p className={styles.meta}>
        <code>
          SELECT * FROM snap_customers WHERE valid_from &lt;= {asOf} AND (valid_to IS NULL OR valid_to &gt; {asOf})
        </code>
        <br />
        {ids.length === 0
          ? 'nothing existed yet'
          : wrong === 0
            ? 'the snapshot agrees with what was really true'
            : `${wrong} key${wrong > 1 ? 's' : ''} differ from what was really true`}
      </p>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>id</th>
            <th>really true at T</th>
            <th>snapshot says</th>
          </tr>
        </thead>
        <tbody>
          {ids.map((id) => {
            const a = t.get(id)
            const b = s.get(id)
            const differs = a?.plan !== b?.plan
            return (
              <tr key={id} className={differs ? styles.differs : undefined}>
                <td>{id}</td>
                <td>{a ? `${a.name}: ${a.plan}` : '(not there)'}</td>
                <td>
                  {b ? `${b.name}: ${b.plan}` : '(not there)'}
                  {differs && <span className={styles.flag}> ≠</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </>
  )
}
