import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import DataTable from '../components/DataTable.tsx'
import Markdown from '../components/Markdown.tsx'
import { integrationHistory, runQuery, useIntegrations } from '../lib/api.ts'
import type { Integration, Recipe, RunLog, RunResult } from '../lib/content.ts'
import { bytes, useStatus } from '../lib/integrations.ts'
import { StatusPill } from './Integrations.tsx'
import styles from './Pages.module.css'
import s from './Integrations.module.css'

const usd = (v: number) => (v === 0 ? '$0' : v < 0.0001 ? '< $0.0001' : `$${v.toFixed(4)}`)

function Stats({ r }: { r: RunResult }) {
  const st = r.stats
  return (
    <div className={s.stats} aria-live="polite">
      <span>
        <strong>{(r.ms / 1000).toFixed(2)} s</strong> wall time
      </span>
      {!st.dry_run && (
        <span>
          <strong>{r.rows.length.toLocaleString('en-US')}</strong> rows{r.truncated ? ' (truncated)' : ''}
        </span>
      )}
      {r.bytes_scanned != null && (
        <span>
          <strong>{bytes(r.bytes_scanned)}</strong> {st.dry_run ? 'would be processed' : 'scanned'}
        </span>
      )}
      {r.cost_usd != null && (
        <span>
          <strong>{usd(r.cost_usd)}</strong> {st.dry_run ? 'if run' : 'estimated cost'}
        </span>
      )}
      {st.partitions_total != null && (
        <span>
          <strong>
            {String(st.partitions_scanned)} / {String(st.partitions_total)}
          </strong>{' '}
          micro-partitions scanned
        </span>
      )}
      {st.cache_hit === true && <span>✓ served from cache</span>}
      {typeof st.engine_ms === 'number' && <span>{(st.engine_ms / 1000).toFixed(2)} s in the engine</span>}
    </div>
  )
}

function Console({ p, configured, onRan }: { p: Integration; configured: boolean; onRan: () => void }) {
  const [recipe, setRecipe] = useState<Recipe | null>(p.recipes[0] ?? null)
  const [sql, setSql] = useState(p.recipes[0]?.sql.trim() ?? '')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<RunResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const pick = (r: Recipe) => {
    setRecipe(r)
    setSql(r.sql.trim())
    setResult(null)
    setError(null)
  }
  const go = async (dry: boolean) => {
    setBusy(true)
    setError(null)
    try {
      setResult(await runQuery(p.key, sql, dry))
    } catch (e) {
      setResult(null)
      setError((e as Error).message)
    } finally {
      setBusy(false)
      onRan()
    }
  }
  const rows = result?.rows.map((r, i) => Object.fromEntries([['#', i], ...result.columns.map((c, j) => [c, r[j]])])) ?? []

  return (
    <div className={s.layout}>
      <nav className={s.recipes} aria-label="Guided labs">
        <h4>Guided labs</h4>
        {p.recipes.map((r) => (
          <button key={r.id} type="button" className={`${s.recipe} ${recipe?.id === r.id ? s.active : ''}`} onClick={() => pick(r)}>
            {r.title}
          </button>
        ))}
      </nav>
      <div className={s.console}>
        {recipe && (
          <div className={s.brief}>
            <p>
              <strong>{recipe.title}.</strong> {recipe.goal}
            </p>
            <p>
              <strong>Look for:</strong> {recipe.look}
            </p>
            {recipe.why && (
              <details>
                <summary>Why</summary>
                <Markdown md={recipe.why} />
              </details>
            )}
          </div>
        )}
        <textarea className={s.editor} value={sql} onChange={(e) => setSql(e.target.value)} spellCheck={false} aria-label="SQL" />
        <div className={s.actions}>
          <button type="button" className={s.run} disabled={!configured || busy || !sql.trim()} onClick={() => go(false)}>
            {busy ? 'Running…' : 'Run'}
          </button>
          {p.key === 'bigquery' && (
            <button type="button" disabled={!configured || busy || !sql.trim()} onClick={() => go(true)}>
              Estimate (dry run, free)
            </button>
          )}
          {!configured && <small>Set up the connection first (guide below).</small>}
        </div>
        {error && <div className={s.failure}>{error}</div>}
        {result && (
          <>
            <Stats r={result} />
            {result.columns.length > 0 && (
              <DataTable
                rows={rows}
                rowKey={(r) => Number(r['#'])}
                columns={result.columns.map((c) => ({ key: c, label: c, render: (r: Record<string, unknown>) => (r[c] == null ? '∅' : String(r[c])) }))}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}

function History({ p, version }: { p: Integration; version: number }) {
  const [log, setLog] = useState<RunLog[] | null>(null)
  useEffect(() => {
    integrationHistory(p.key).then(setLog, () => setLog([]))
  }, [p.key, version])
  if (!log?.length) return null
  return (
    <section className={s.history}>
      <h3>Your recent queries</h3>
      <DataTable
        rows={log}
        rowKey={(r) => r.started_at}
        rowClass={(r) => (r.status === 'error' ? 'bad' : undefined)}
        columns={[
          { key: 'when', label: 'When', render: (r) => new Date(r.started_at * 1000).toLocaleString() },
          { key: 'sql', label: 'SQL', render: (r) => <div className={s.sqlCell}>{r.sql.length > 220 ? `${r.sql.slice(0, 220)}…` : r.sql}</div> },
          { key: 'ms', label: 'Time', align: 'right', render: (r) => `${(r.ms / 1000).toFixed(1)} s` },
          { key: 'bytes', label: 'Scanned', align: 'right', render: (r) => (r.bytes ? bytes(r.bytes) : '—') },
          { key: 'cost', label: 'Cost', align: 'right', render: (r) => (r.cost_usd ? usd(r.cost_usd) : '—') },
          { key: 'status', label: 'Result', render: (r) => (r.status === 'ok' ? `✓ ${r.rows} rows` : `✗ ${r.error?.slice(0, 80) ?? 'error'}`) },
        ]}
      />
    </section>
  )
}

export default function IntegrationProvider() {
  const { key } = useParams()
  const providers = useIntegrations()
  const p = providers.find((x) => x.key === key)
  const { status, refresh } = useStatus()
  const [version, setVersion] = useState(0)
  if (!p) {
    return (
      <div className={styles.page}>
        <h1>Unknown integration</h1>
        <Link to="/integrations">← All integrations</Link>
      </div>
    )
  }
  const st = status?.[p.key]
  const configured = Boolean(st?.configured)

  const guide = (
    <section className={s.guide}>
      <h2>{configured ? 'Setup (done)' : 'Set it up'}</h2>
      <p className="lede">{p.cost_note}</p>
      <ol>
        {p.setup.map((step) => (
          <li key={step.title}>
            <strong>{step.title}</strong>
            <Markdown md={step.md} />
          </li>
        ))}
      </ol>
      <h4>Config file format</h4>
      <pre>
        <code>{p.config_template}</code>
      </pre>
    </section>
  )

  return (
    <div className={styles.page}>
      <Link to="/integrations">← All integrations</Link>
      <div className={s.head}>
        <h1>{p.name}</h1>
        <StatusPill st={st} />
      </div>
      <p className="lede">{p.summary}</p>
      {st?.configured && (
        <p className={s.usage}>
          Today: {st.today.queries} of {st.limits.daily_queries} queries · {bytes(st.today.bytes)} of {bytes(st.limits.daily_bytes)} scan budget
          {st.today.cost_usd ? ` · ≈ ${usd(st.today.cost_usd)} spent` : ''}
        </p>
      )}
      {!configured && guide}
      <Console
        p={p}
        configured={configured}
        onRan={() => {
          refresh()
          setVersion((v) => v + 1)
        }}
      />
      <History p={p} version={version} />
      {configured && guide}
    </div>
  )
}
