import type { ReactNode } from 'react'
import styles from './Stat.module.css'

export function Stat({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className={styles.stat}>
      <div className={styles.label}>{label}</div>
      <div className={styles.value}>{value}</div>
      {note && <div className={styles.note}>{note}</div>}
    </div>
  )
}

export function StatRow({ children }: { children: ReactNode }) {
  return <div className={styles.row}>{children}</div>
}
