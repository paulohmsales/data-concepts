import { useEffect, useState, type ReactNode } from 'react'
import { formatCell, type Db, type Row } from '../core/db.ts'
import DataTable from './DataTable.tsx'
import styles from './SqlLab.module.css'

export interface Preset {
  id: string
  label: string
  sql: string
  /** Shown under the result: what to notice. */
  note?: ReactNode
  /** Bug presets get a ✗ marker so the failure is never colour-only. */
  kind?: 'ok' | 'bug'
}

interface Result {
  rows: Row[]
  ms: number
}

/** Preset queries plus an editable SQL box, run against the module's DuckDB schema. */
export default function SqlLab({
  db,
  error: bootError,
  presets,
  initial,
  rowClass,
}: {
  db: Db | null
  error: string | null
  presets: readonly Preset[]
  initial?: string
  rowClass?: (row: Row) => 'hl' | 'dim' | 'bad' | undefined
}) {
  const first = presets.find((p) => p.id === initial) ?? presets[0]
  const [active, setActive] = useState<Preset | null>(first)
  const [sql, setSql] = useState(first.sql)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  const run = async (text: string) => {
    if (!db) return
    setRunning(true)
    const t0 = performance.now()
    try {
      const rows = await db.all(text)
      setResult({ rows, ms: performance.now() - t0 })
      setError(null)
    } catch (e) {
      setError(String(e).replace(/^Error: /, ''))
      setResult(null)
    } finally {
      setRunning(false)
    }
  }

  // run the first preset once the database is ready
  useEffect(() => {
    if (!db) return
    const effect = { cancelled: false }
    db.all(first.sql)
      .then((rows) => !effect.cancelled && setResult({ rows, ms: 0 }))
      .catch((e) => !effect.cancelled && setError(String(e)))
    return () => {
      effect.cancelled = true
    }
  }, [db, first.sql])

  const pick = (p: Preset) => {
    setActive(p)
    setSql(p.sql)
    void run(p.sql)
  }

  const columns = result?.rows.length ? Object.keys(result.rows[0]) : []

  return (
    <div className={styles.lab}>
      <div className={styles.presets}>
        {presets.map((p) => (
          <button key={p.id} type="button" className={p.id === active?.id ? styles.active : undefined} onClick={() => pick(p)} disabled={!db}>
            {p.kind === 'bug' ? '✗ ' : ''}
            {p.label}
          </button>
        ))}
      </div>
      <textarea
        className={styles.editor}
        value={sql}
        spellCheck={false}
        rows={Math.min(14, Math.max(4, sql.split('\n').length + 1))}
        onChange={(e) => {
          setSql(e.target.value)
          setActive(null)
        }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void run(sql)
        }}
        aria-label="SQL query"
      />
      <div className={styles.bar}>
        <button type="button" onClick={() => run(sql)} disabled={!db || running}>
          {running ? 'Running…' : 'Run'}
        </button>
        <small>
          {!db && !bootError ? 'Starting DuckDB in your browser…' : 'Ctrl/⌘ + Enter runs. Edit freely; the presets restore the examples.'}
        </small>
      </div>
      {(bootError || error) && <pre className={styles.error}>{bootError ?? error}</pre>}
      {result && (
        <>
          <DataTable
            rows={result.rows}
            rowKey={(_, i) => i}
            rowClass={rowClass}
            columns={columns.map((c) => ({ key: c, label: c, render: (r: Row) => (r[c] === null || r[c] === undefined ? <span className={styles.null}>NULL</span> : formatCell(r[c])), align: typeof result.rows[0][c] === 'number' ? 'right' : 'left' }))}
            caption={`${result.rows.length} row${result.rows.length === 1 ? '' : 's'}`}
          />
          {active?.note && <div className={active.kind === 'bug' ? styles.noteBug : styles.note}>{active.note}</div>}
        </>
      )}
    </div>
  )
}
