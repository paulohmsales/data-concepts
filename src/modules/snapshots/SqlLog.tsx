import type { LogEntry } from './sandbox.ts'
import styles from './Snapshots.module.css'

export default function SqlLog({ log }: { log: LogEntry[] }) {
  return (
    <div className={styles.card}>
      <h4>Action log (newest first)</h4>
      <ul className={styles.log}>
        {log.map((e, i) => (
          <li key={log.length - i}>
            <span className={styles.tick}>tick {e.tick}</span> {e.label}
            <details>
              <summary>SQL ({e.sql.length} statements)</summary>
              <pre>{e.sql.join(';\n') + ';'}</pre>
            </details>
          </li>
        ))}
      </ul>
    </div>
  )
}
