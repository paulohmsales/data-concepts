import type { RowStatus } from '../../core/loads.ts'
import styles from './Snapshots.module.css'

// Status colors are reserved for state and always paired with an icon and a label.
const META: Record<RowStatus, { icon: string; label: string; className: string }> = {
  ok: { icon: '✓', label: 'ok', className: styles.good },
  stale: { icon: '↻', label: 'stale', className: styles.warning },
  missing: { icon: '∅', label: 'missing', className: styles.serious },
  ghost: { icon: '×', label: 'ghost', className: styles.critical },
  duplicate: { icon: '⧉', label: 'duplicate', className: styles.critical },
}

export default function StatusBadge({ status }: { status: RowStatus }) {
  const m = META[status]
  return (
    <span className={styles.badge}>
      <span className={`${styles.dot} ${m.className}`} aria-hidden>
        {m.icon}
      </span>
      {m.label}
    </span>
  )
}
