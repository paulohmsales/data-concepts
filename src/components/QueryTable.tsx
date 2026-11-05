import { useEffect, useState, type ReactNode } from 'react'
import { formatCell, type Db, type Row } from '../core/db.ts'
import DataTable from './DataTable.tsx'

/** Runs one read-only query and shows the rows (for "here is the table" panels). */
export default function QueryTable({
  db,
  sql,
  caption,
  rowClass,
}: {
  db: Db | null
  sql: string
  caption?: ReactNode
  rowClass?: (row: Row) => 'hl' | 'dim' | 'bad' | undefined
}) {
  const [rows, setRows] = useState<Row[] | null>(null)
  useEffect(() => {
    if (!db) return
    const effect = { cancelled: false }
    db.all(sql).then((r) => !effect.cancelled && setRows(r))
    return () => {
      effect.cancelled = true
    }
  }, [db, sql])
  if (!rows) return <p className="lede">Loading…</p>
  const cols = rows.length ? Object.keys(rows[0]) : []
  return (
    <DataTable
      rows={rows}
      rowKey={(_, i) => i}
      rowClass={rowClass}
      caption={caption}
      columns={cols.map((c) => ({ key: c, label: c, render: (r: Row) => formatCell(r[c]), align: typeof rows[0][c] === 'number' ? 'right' : 'left' }))}
    />
  )
}
