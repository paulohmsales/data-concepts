import { useState } from 'react'
import { Link } from 'react-router'
import { runQuery, useComparisons, useIntegrations } from '../lib/api.ts'
import type { Comparison, IntegrationKey, IntegrationStatus, RunResult } from '../lib/content.ts'
import { bytes } from '../lib/integrations.ts'
import s from './Integrations.module.css'

type Outcome = { state: 'idle' } | { state: 'running' } | { state: 'ok'; r: RunResult } | { state: 'error'; message: string }

const usd = (v: number) => (v === 0 ? '$0' : v < 0.0001 ? '< $0.0001' : `$${v.toFixed(4)}`)

function Row({ name, provider, outcome, configured }: { name: string; provider: IntegrationKey; outcome: Outcome; configured: boolean }) {
  return (
    <tr>
      <th scope="row">{name}</th>
      {!configured ? (
        <td colSpan={5}>
          <Link to={`/integrations/${provider}`}>Connect {name} to run this</Link>
        </td>
      ) : outcome.state === 'idle' ? (
        <td colSpan={5} className={s.muted}>
          —
        </td>
      ) : outcome.state === 'running' ? (
        <td colSpan={5}>Running…</td>
      ) : outcome.state === 'error' ? (
        <td colSpan={5} className={s.cmpError}>
          {outcome.message}
        </td>
      ) : (
        <>
          <td className={s.num}>{(outcome.r.ms / 1000).toFixed(2)} s</td>
          <td className={s.num}>{outcome.r.bytes_scanned != null ? bytes(outcome.r.bytes_scanned) : 'n/a'}</td>
          <td className={s.num}>{outcome.r.cost_usd != null ? usd(outcome.r.cost_usd) : 'compute time'}</td>
          <td className={s.num}>{outcome.r.rows.length}</td>
          <td className={s.firstRow}>{outcome.r.rows[0] ? outcome.r.columns.map((c, i) => `${c} ${String(outcome.r.rows[0][i])}`).join(' · ') : 'no rows'}</td>
        </>
      )}
    </tr>
  )
}

function OneComparison({ c, status, names }: { c: Comparison; status: Record<IntegrationKey, IntegrationStatus> | null; names: Record<string, string> }) {
  const [out, setOut] = useState<Record<string, Outcome>>({})
  const [showSql, setShowSql] = useState(false)
  const ready = c.runs.filter((r) => status?.[r.provider]?.configured)
  const running = Object.values(out).some((o) => o.state === 'running')
  const runAll = () => {
    for (const r of ready) {
      setOut((o) => ({ ...o, [r.provider]: { state: 'running' } }))
      runQuery(r.provider, r.sql).then(
        (res) => setOut((o) => ({ ...o, [r.provider]: { state: 'ok', r: res } })),
        (e: Error) => setOut((o) => ({ ...o, [r.provider]: { state: 'error', message: e.message } })),
      )
    }
  }
  return (
    <section className={s.compare}>
      <h3>{c.title}</h3>
      <p>{c.question}</p>
      <div className={s.actions}>
        <button type="button" className={s.run} disabled={ready.length === 0 || running} onClick={runAll}>
          Run on {ready.length ? ready.map((r) => names[r.provider]).join(' and ') : 'connected engines'}
        </button>
        <button type="button" onClick={() => setShowSql((v) => !v)}>
          {showSql ? 'Hide SQL' : 'Show SQL'}
        </button>
      </div>
      {showSql && (
        <div className={s.sqlPair}>
          {c.runs.map((r) => (
            <div key={r.provider}>
              <small>{names[r.provider]}</small>
              <pre>
                <code>{r.sql.trim()}</code>
              </pre>
            </div>
          ))}
        </div>
      )}
      <table className={s.cmpTable}>
        <thead>
          <tr>
            <th>Engine</th>
            <th className={s.num}>Time</th>
            <th className={s.num}>Scanned</th>
            <th className={s.num}>Cost</th>
            <th className={s.num}>Rows</th>
            <th>First row</th>
          </tr>
        </thead>
        <tbody>
          {c.runs.map((r) => (
            <Row key={r.provider} name={names[r.provider]} provider={r.provider} outcome={out[r.provider] ?? { state: 'idle' }} configured={Boolean(status?.[r.provider]?.configured)} />
          ))}
        </tbody>
      </table>
      <p className={s.muted}>{c.why}</p>
    </section>
  )
}

/** The same question on the same data, run on two engines side by side. */
export default function CompareEngines({ status }: { status: Record<IntegrationKey, IntegrationStatus> | null }) {
  const comparisons = useComparisons()
  const names = Object.fromEntries(useIntegrations().map((p) => [p.key, p.name]))
  return (
    <>
      <h2>Same question, different engines</h2>
      <p className="lede" style={{ maxWidth: '72ch' }}>
        Pairs of engines that share a dataset, running identical questions. A comparison across all four needs the same
        data loaded into each sandbox, which comes with the write labs.
      </p>
      {comparisons.map((c) => (
        <OneComparison key={c.id} c={c} status={status} names={names} />
      ))}
    </>
  )
}
