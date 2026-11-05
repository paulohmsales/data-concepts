import { Callout, Related, Steps, Worked } from '../../components/content.tsx'
import DataTable from '../../components/DataTable.tsx'
import styles from '../common.module.css'

const STRATEGIES = [
  { s: 'Full reload', cost: 'Grows with table size', fresh: 'Hours (batch)', deletes: 'Handled', retry: 'Idempotent', when: 'Small tables (< a few million rows), or as a periodic reconciliation' },
  { s: 'Watermark (updated_at)', cost: 'Grows with change volume', fresh: 'Minutes–hours', deletes: 'Missed', retry: 'Needs MERGE', when: 'Source has a reliable, indexed modification timestamp' },
  { s: 'Snapshot diff (hash compare)', cost: 'Full extract, but only changes written', fresh: 'Hours', deletes: 'Detected (anti-join)', retry: 'Idempotent with MERGE', when: 'No change columns, no CDC; full extract affordable' },
  { s: 'Log-based CDC', cost: 'Grows with change volume', fresh: 'Seconds', deletes: 'Handled (delete events)', retry: 'Needs ordering + dedupe', when: 'You can read the database log (Debezium, GoldenGate, DMS)' },
]

export default function DeepDive() {
  return (
    <>
      <h3>The three questions behind every load design</h3>
      <p>
        Every way of copying a table into a warehouse is an answer to three questions. <b>How do I find what
        changed?</b> (everything, a timestamp, a diff, the database log.) <b>How do I write it?</b> (replace,
        append, merge by key.) <b>What do I remember between runs?</b> (nothing, a watermark, a log offset.) The
        failures in the lab are all mismatches between those answers and how the source really behaves.
      </p>
      <DataTable
        rows={STRATEGIES}
        rowKey={(r) => r.s}
        columns={[
          { key: 's', label: 'Strategy', render: (r) => <b>{r.s}</b> },
          { key: 'c', label: 'Cost per run', render: (r) => r.cost },
          { key: 'f', label: 'Freshness', render: (r) => r.fresh },
          { key: 'd', label: 'Hard deletes', render: (r) => r.deletes },
          { key: 'r', label: 'Retry-safe', render: (r) => r.retry },
          { key: 'w', label: 'Use when', render: (r) => r.when },
        ]}
      />

      <h3>A watermark load done properly</h3>
      <Steps
        items={[
          { title: 'Read the last committed watermark', body: 'From a state table, not from the target (the target may contain a half-finished run).' },
          { title: 'Extract with a lookback', body: <>Select rows with updated_at &gt; watermark − lookback (e.g. 1 hour). The overlap covers late commits, clock skew between app servers, and transactions that committed after your previous extract but carry an older timestamp.</> },
          { title: 'Write idempotently', body: 'MERGE (or delete-then-insert) by primary key, so re-reading the overlap or retrying a failed run changes nothing.' },
          { title: 'Advance the watermark to max(updated_at) actually loaded', body: 'Never to “now” or to the job’s end time: rows that changed while the job ran would fall behind the watermark and be skipped forever (the mid-run scenario).' },
          { title: 'Commit the watermark last', body: 'After the data is committed. A crash in between then means re-reading a little, never skipping.' },
        ]}
      />
      <pre className={styles.sql}>{`MERGE INTO dim_customer t
USING (
  SELECT * FROM src_customer
  WHERE updated_at > :watermark - INTERVAL '1 hour'
  QUALIFY row_number() OVER (PARTITION BY id ORDER BY updated_at DESC) = 1  -- one row per key
) s
ON t.id = s.id
WHEN MATCHED AND s.updated_at >= t.updated_at THEN UPDATE SET name = s.name, plan = s.plan, updated_at = s.updated_at
WHEN NOT MATCHED THEN INSERT (id, name, plan, updated_at) VALUES (s.id, s.name, s.plan, s.updated_at);`}</pre>
      <Callout kind="warn" title="Two subtle bugs">
        <p>
          <b>Duplicates in the batch:</b> if the extract contains two versions of the same key, most MERGE
          implementations fail (“multiple source rows matched”), so deduplicate first. <b>Out-of-order
          versions:</b> the <code>s.updated_at &gt;= t.updated_at</code> guard stops a late, older version
          from overwriting a newer one.
        </p>
      </Callout>

      <h3>No CDC and no change column: diff the snapshots</h3>
      <p>
        A classic interview question: an Oracle table has no updated_at and you can’t read the log. Take a full
        extract, hash each row, and compare with yesterday’s hashes by primary key. New keys are inserts,
        changed hashes are updates, missing keys are deletes. You still pay for a full extract, but you only
        <em> write</em> the changes, and you get deletes for free.
      </p>
      <pre className={styles.sql}>{`WITH today AS (
  SELECT id, md5(concat_ws('|', coalesce(name, '∅'), coalesce(plan, '∅'))) AS row_hash, *
  FROM extract_today
)
SELECT coalesce(t.id, y.id) AS id,
       CASE WHEN y.id IS NULL THEN 'insert'
            WHEN t.id IS NULL THEN 'delete'
            WHEN t.row_hash <> y.row_hash THEN 'update' END AS change
FROM today t
FULL OUTER JOIN state_hashes y ON t.id = y.id
WHERE y.id IS NULL OR t.id IS NULL OR t.row_hash <> y.row_hash;`}</pre>
      <p>
        Other options to raise in that interview: Oracle’s <code>ORA_ROWSCN</code> pseudo-column (block-level unless
        the table was created with ROWDEPENDENCIES), Flashback Query (<code>AS OF TIMESTAMP</code>) for a consistent
        extract, adding triggers or a change column (if you’re allowed to touch the source), and log-based tools
        (LogMiner, GoldenGate, AWS DMS) as the long-term fix.
      </p>

      <h3>SCD type 2 on a 5-million-row full daily extract</h3>
      <p>Another common question. The shape of a good answer:</p>
      <Steps
        items={[
          { title: 'Hash the tracked columns', body: 'One row_hash per key over the columns whose history matters (not over audit columns like loaded_at, or every row changes daily).' },
          { title: 'Compare only with current rows', body: 'Join today’s extract to the dimension where is_current (or valid_to IS NULL). 5M × 5M on a hash is cheap; avoid comparing every column.' },
          { title: 'Close changed and deleted versions', body: 'Set valid_to = load date (and is_current = false) for keys whose hash changed or that vanished.' },
          { title: 'Open new versions', body: 'Insert a row with valid_from = load date, valid_to = NULL for new keys and changed keys.' },
          { title: 'Do it atomically and idempotently', body: 'One transaction (or MERGE with a union of “close” and “insert” rows). Rerunning the same day must produce the same table, so key the run on the load date rather than now().' },
        ]}
      />
      <pre className={styles.sql}>{`MERGE INTO dim_customer d
USING (
  -- changed or new keys appear twice: once to close the old version, once to insert the new one
  SELECT s.id AS merge_key, s.* FROM stg s
  UNION ALL
  SELECT NULL AS merge_key, s.* FROM stg s
  JOIN dim_customer d ON d.id = s.id AND d.is_current AND d.row_hash <> s.row_hash
) s
ON d.id = s.merge_key AND d.is_current
WHEN MATCHED AND d.row_hash <> s.row_hash THEN
  UPDATE SET is_current = false, valid_to = :load_date
WHEN NOT MATCHED THEN
  INSERT (id, name, plan, row_hash, valid_from, valid_to, is_current)
  VALUES (s.id, s.name, s.plan, s.row_hash, :load_date, NULL, true);`}</pre>
      <p>
        Deletes need a separate step (keys in the dimension’s current rows but not in today’s extract). In dbt this
        whole pattern is a <b>snapshot</b>: <code>strategy='check'</code> with <code>check_cols</code> compares values
        like this lab does; <code>strategy='timestamp'</code> trusts an updated_at; <code>invalidate_hard_deletes</code>
        closes vanished keys.
      </p>
      <Worked title="as-of queries on half-open intervals">
        <p>
          Use valid_from ≤ t &lt; valid_to (NULL meaning “still valid”). Half-open intervals tile time with no gaps and
          no overlaps, so every key has exactly one version at any t. Closed intervals (≤ on both ends) give two
          versions at the boundary instant, and that silently duplicates rows in joins.
        </p>
      </Worked>

      <h3>What changes in production</h3>
      <ul>
        <li><b>Backfills:</b> parameterise every job by the logical date it processes, so a rerun for last Tuesday is the same code with a different date.</li>
        <li><b>Reconciliation:</b> even a good incremental pipeline drifts (manual fixes, missed deletes). A weekly key-and-count comparison against the source catches it; a periodic full reload resets it.</li>
        <li><b>Monitoring:</b> rows extracted per run, watermark lag (now − watermark), duplicate keys in the target, and freshness SLAs. An extract of 0 rows is more often a broken query than a quiet day.</li>
        <li><b>Snapshot cadence is your history’s resolution:</b> daily snapshots can’t answer “what was true at 3 pm”. If that matters, you need CDC or an audit log.</li>
      </ul>
      <Callout kind="prod" title="Rule of thumb">
        Start with a full reload. Move to incremental only when it costs too much, and keep the full reload as your
        repair tool. Most incremental bugs are discovered by comparing against one.
      </Callout>
      <Related slugs={['retries-idempotency', 'late-data', 'surrogate-keys', 'window-functions', 'partitioning']} />
    </>
  )
}
