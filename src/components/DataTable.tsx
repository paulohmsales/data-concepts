import type { ReactNode } from 'react'
import styles from './DataTable.module.css'

export interface Column<T> {
  key: string
  label: ReactNode
  render: (row: T) => ReactNode
  align?: 'left' | 'right'
}

/** A plain, compact table. `rowClass` lets a module highlight rows (e.g. the ones a query kept). */
export default function DataTable<T>({
  rows,
  columns,
  rowKey,
  rowClass,
  caption,
}: {
  rows: readonly T[]
  columns: readonly Column<T>[]
  rowKey: (row: T, i: number) => string | number
  rowClass?: (row: T, i: number) => 'hl' | 'dim' | 'bad' | undefined
  caption?: ReactNode
}) {
  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        {caption && <caption>{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.align === 'right' ? styles.right : undefined}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const cls = rowClass?.(r, i)
            return (
              <tr key={rowKey(r, i)} className={cls ? styles[cls] : undefined}>
                {columns.map((c) => (
                  <td key={c.key} className={c.align === 'right' ? styles.right : undefined}>
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
