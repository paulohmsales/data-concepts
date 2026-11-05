import { Link } from 'react-router'
import { useIntegrations } from '../lib/api.ts'
import type { IntegrationStatus } from '../lib/content.ts'
import { bytes, useStatus } from '../lib/integrations.ts'
import CompareEngines from './CompareEngines.tsx'
import styles from './Pages.module.css'
import s from './Integrations.module.css'

export function StatusPill({ st }: { st?: IntegrationStatus }) {
  if (!st) return <span className={s.pill}>checking…</span>
  if (st.configured) return <span className={`${s.pill} ${s.ok}`}>✓ connected</span>
  return <span className={`${s.pill} ${s.todo}`}>! {st.problem === 'not configured' ? 'setup needed' : st.problem}</span>
}

export default function Integrations() {
  const providers = useIntegrations()
  const { status, error } = useStatus()

  return (
    <div className={styles.page}>
      <h1>Integrations</h1>
      <p className="lede" style={{ maxWidth: '72ch' }}>
        Run real queries on BigQuery, Snowflake, Athena and Databricks from here, with guided labs that
        show the things the modules simulate: bytes scanned, pruning, caches, join plans. The server holds
        the credentials (your browser never sees them) and enforces limits on every query.
      </p>
      {error && <p className={s.error}>Couldn’t load status: {error}</p>}
      <div className={styles.providerGrid}>
        {providers.map((p) => {
          const st = status?.[p.key]
          return (
            <Link key={p.key} to={`/integrations/${p.key}`} className={`${styles.provider} ${s.card}`}>
              <div className={styles.providerHead}>
                <h2>{p.name}</h2>
                <StatusPill st={st} />
              </div>
              <small>{p.vendor}</small>
              <p>{p.summary}</p>
              <h4>Labs</h4>
              <ul>
                {p.recipes.map((r) => (
                  <li key={r.id}>{r.title}</li>
                ))}
              </ul>
              {st?.configured && (
                <p className={s.usage}>
                  Today: {st.today.queries} of {st.limits.daily_queries} queries · {bytes(st.today.bytes)} scanned
                  {st.today.cost_usd ? ` · ≈ $${st.today.cost_usd.toFixed(4)}` : ''}
                </p>
              )}
              <span className={s.open}>{st?.configured ? 'Open the console →' : 'Set it up →'}</span>
            </Link>
          )
        })}
      </div>
      <CompareEngines status={status} />
      <h3>Guard rails</h3>
      <ol className={styles.howList}>
        <li>
          <strong>Least-privilege keys you create.</strong> Each guide sets up a user that can only run
          queries on sample data (and, at most, write to one sandbox), never manage the account.
        </li>
        <li>
          <strong>Provider-side caps.</strong> BigQuery’s maximum bytes billed per query, Snowflake’s
          resource monitor, Athena’s per-query scan limit, Databricks’ auto-stop. They hold even if this
          app misbehaves.
        </li>
        <li>
          <strong>App-side limits.</strong> 200 queries and 20 GB scanned per provider per day, a 60-second
          timeout, 500 rows returned, one statement at a time.
        </li>
        <li>
          <strong>Everything logged.</strong> Each query, its cost and its outcome are recorded, and the
          console shows your history.
        </li>
        <li>
          <strong>Keys stay off the repo and out of chats.</strong> <code>deploy/set-integration.sh</code>{' '}
          sends them straight from your machine to a root-only folder on the server.
        </li>
      </ol>
    </div>
  )
}
