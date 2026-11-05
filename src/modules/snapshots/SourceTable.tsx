import { useState } from 'react'
import type { Customer } from '../../core/loads.ts'
import { PLANS, type Sandbox } from './sandbox.ts'
import styles from './Snapshots.module.css'

interface Props {
  rows: Customer[]
  busy: boolean
  run: (a: (s: Sandbox) => Promise<void>) => void
}

export default function SourceTable({ rows, busy, run }: Props) {
  const [name, setName] = useState('')
  const [plan, setPlan] = useState<string>('free')
  const [late, setLate] = useState(false)

  return (
    <div className={styles.card}>
      <h4>Source (the app’s database): edit me</h4>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>id</th>
            <th>name</th>
            <th>plan</th>
            <th>updated_at</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.id}</td>
              <td>{r.name}</td>
              <td>
                <select
                  value={r.plan}
                  disabled={busy}
                  aria-label={`Plan for ${r.name}`}
                  onChange={(e) => run((s) => s.update(r.id, e.target.value))}
                >
                  {PLANS.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </td>
              <td>{r.updated_at}</td>
              <td>
                <button type="button" disabled={busy} onClick={() => run((s) => s.remove(r.id))}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        className={styles.addRow}
        onSubmit={(e) => {
          e.preventDefault()
          const n = name.trim() || 'New customer'
          run((s) => s.insert(n, plan, late ? 4 : 0))
          setName('')
        }}
      >
        <input placeholder="name" value={name} onChange={(e) => setName(e.target.value)} aria-label="New customer name" />
        <select value={plan} onChange={(e) => setPlan(e.target.value)} aria-label="New customer plan">
          {PLANS.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <label title="The row shows up now, but its updated_at is 4 ticks in the past (a lagging replica, an offline client syncing)">
          <input type="checkbox" checked={late} onChange={(e) => setLate(e.target.checked)} /> late-arriving
        </label>
        <button type="submit" disabled={busy}>
          Insert
        </button>
      </form>
    </div>
  )
}
