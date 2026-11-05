import type { Diff } from '../../core/loads.ts'
import StatusBadge from './StatusBadge.tsx'
import styles from './Snapshots.module.css'

interface Props {
  title: string
  rows: { id: number; name: string; plan: string; updated_at: number; loaded_at: number }[]
  diff: Diff[]
  freshness: string
  neverRun: boolean
}

/** A warehouse table, with each key checked against the source. */
export default function TargetTable({ title, rows, diff, freshness, neverRun }: Props) {
  const statusById = new Map(diff.map((d) => [d.id, d.status]))
  // Before the first run everything is "missing"; that's not news, so just say it's empty.
  const missing = neverRun ? [] : diff.filter((d) => d.status === 'missing')
  const problems = neverRun ? 0 : diff.filter((d) => d.status !== 'ok').length

  return (
    <div className={styles.card}>
      <h4>{title}</h4>
      <p className={styles.meta}>
        {freshness}
        {!neverRun && (problems === 0 ? ' · matches the source' : ` · ${problems} key${problems > 1 ? 's' : ''} wrong`)}
      </p>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>id</th>
            <th>name</th>
            <th>plan</th>
            <th>updated_at</th>
            <th>loaded_at</th>
            <th>vs source</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.id}-${i}`}>
              <td>{r.id}</td>
              <td>{r.name}</td>
              <td>{r.plan}</td>
              <td>{r.updated_at}</td>
              <td>{r.loaded_at}</td>
              <td>
                <StatusBadge status={statusById.get(r.id) ?? 'ok'} />
              </td>
            </tr>
          ))}
          {missing.map((d) => (
            <tr key={`missing-${d.id}`} className={styles.missingRow}>
              <td>{d.id}</td>
              <td colSpan={4}>not in this table (source has plan {d.sourcePlan})</td>
              <td>
                <StatusBadge status="missing" />
              </td>
            </tr>
          ))}
          {rows.length === 0 && missing.length === 0 && (
            <tr>
              <td colSpan={6} className={styles.meta}>
                empty: run the job
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
