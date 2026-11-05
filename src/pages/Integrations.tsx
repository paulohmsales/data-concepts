import styles from './Pages.module.css'

const PROVIDERS = [
  {
    name: 'BigQuery',
    vendor: 'Google Cloud',
    scope: 'A service account that can only use one sandbox dataset. Every job sets maximum_bytes_billed.',
    labs: ['Bytes billed with and without partition filters', 'Clustering and the bill', 'Loading from GCS', 'MERGE for SCD2'],
  },
  {
    name: 'Snowflake',
    vendor: 'Snowflake',
    scope: 'A role limited to one database; an X-Small warehouse that suspends after 60 s; a resource monitor with a credit quota.',
    labs: ['Micro-partition pruning', 'Time travel and zero-copy clones', 'Stages and COPY INTO', 'Streams and tasks (CDC)'],
  },
  {
    name: 'AWS',
    vendor: 'Amazon Web Services',
    scope: 'An IAM user limited to one S3 bucket, one Athena workgroup with a bytes-scanned limit, and one Glue database.',
    labs: ['Parquet vs CSV on S3 (Athena bytes scanned)', 'Hive partitions and projection', 'External tables over S3', 'Small-file problem, measured'],
  },
  {
    name: 'Databricks',
    vendor: 'Databricks Free Edition',
    scope: 'A SQL warehouse reached through the Statement Execution API; a single catalog and schema.',
    labs: ['Delta MERGE and time travel', 'OPTIMIZE and Z-order', 'Broadcast vs shuffle joins (query profile)', 'Auto Loader vs streaming'],
  },
]

export default function Integrations() {
  return (
    <div className={styles.page}>
      <h1>Integrations</h1>
      <p className="lede" style={{ maxWidth: '72ch' }}>
        Labs that run on the real services. A small lab API on the server holds the credentials (the
        browser never sees them), runs each lab’s statements in a sandbox, and enforces timeouts, row
        limits and a daily budget per provider. Every statement is logged.
      </p>
      <div className={styles.providerGrid}>
        {PROVIDERS.map((p) => (
          <section key={p.name} className={styles.provider}>
            <div className={styles.providerHead}>
              <h2>{p.name}</h2>
              <span className={styles.status}>! setup needed</span>
            </div>
            <small>{p.vendor}</small>
            <p>{p.scope}</p>
            <h4>Labs</h4>
            <ul>
              {p.labs.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <h3>How it works</h3>
      <ol className={styles.howList}>
        <li>You create a least-privilege key for each provider (step-by-step guides come with the lab API).</li>
        <li>The keys go onto the server as Docker secrets. Nothing is stored in the repo or the browser.</li>
        <li>Each lab sends a named action (not arbitrary credentials) to the API, which runs it against the sandbox and returns results plus cost metrics (bytes scanned, credits, time).</li>
        <li>Caps stop runaway cost: bytes-billed limits, warehouse auto-suspend, resource monitors, a per-day budget and a kill switch.</li>
      </ol>
    </div>
  )
}
