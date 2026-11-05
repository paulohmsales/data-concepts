import { Interview } from '../../components/content.tsx'

export default function InterviewQs() {
  return (
    <Interview
      items={[
        {
          level: 'junior',
          q: 'When would you choose a full reload over an incremental load?',
          answer: <p>When the table is small enough that reloading is cheap and fast enough for the freshness required: it’s simpler, idempotent, and handles deletes and late data automatically. Incremental pays off when the table is large relative to its daily change, at the cost of more logic (watermarks, merges, deletes, backfills).</p>,
          listenFor: ['Cost vs change volume', 'Simplicity and idempotency of full reload', 'Deletes and late data as incremental’s weak spots'],
        },
        {
          level: 'mid',
          q: 'Design incremental loading from an Oracle table that has no CDC and no change-tracking columns.',
          answer: (
            <>
              <p>Clarify first: table size, change rate, required freshness, and whether we may change the source.</p>
              <ul>
                <li>If a full extract is affordable: extract daily (consistently, e.g. Flashback AS OF a timestamp), hash rows, diff against yesterday’s hashes by primary key → inserts, updates, deletes; MERGE only the changes.</li>
                <li>If not: look for proxies (ORA_ROWSCN with ROWDEPENDENCIES, an ever-increasing id for append-only tables), or ask the source team for a change column or triggers.</li>
                <li>Long term: log-based CDC (LogMiner, GoldenGate, DMS) into a stream, which also gives deletes and low latency.</li>
              </ul>
            </>
          ),
          listenFor: ['Asks about size, change rate and freshness', 'Hash diff by key incl. deletes', 'Consistent extract', 'Names log-based CDC as the end state'],
          followUps: [{ q: 'The full extract takes 3 hours and locks the table. Now what?', a: 'Extract from a replica or standby; split by key ranges in parallel; use Flashback for consistency without locks; or push for CDC.' }],
        },
        {
          level: 'mid',
          q: 'How would you implement SCD Type 2 for a five-million-row table with a full daily extract?',
          answer: <p>Hash the tracked columns per key; join today’s extract to current dimension rows; close versions whose hash changed or whose key disappeared (valid_to = load date); insert new versions for new and changed keys with valid_from = load date. Do it in one transaction or a MERGE, keyed on the load date so a rerun is idempotent. Index or cluster on (id, is_current). In dbt: a check-strategy snapshot with invalidate_hard_deletes.</p>,
          listenFor: ['Row hash, not column-by-column', 'Compare to current rows only', 'Deletes handled', 'Idempotent rerun by load date', 'Half-open validity intervals'],
        },
        {
          level: 'mid',
          q: 'Your incremental job wrote its rows, then crashed before saving the watermark. It retries. What happens?',
          answer: <p>It re-reads the same batch from the old watermark. If the write is an append, the rows are duplicated; if it is a MERGE by key (or delete-and-insert of the batch’s keys), the retry is harmless. That’s why the watermark is committed after the data and the write must be idempotent.</p>,
          listenFor: ['Re-read from old watermark', 'Append duplicates, merge doesn’t', 'Order: data then state'],
        },
        {
          level: 'senior',
          q: 'Rows arrive with updated_at older than your watermark (replica lag, mobile sync). How do you design for it?',
          answer: <p>Extract with a lookback window (watermark − N) and rely on an idempotent MERGE to absorb the overlap; size N from the observed lateness distribution; prefer an ingestion/commit timestamp set by the database over a business timestamp; monitor rows arriving behind the watermark; and run periodic reconciliation against the source for whatever falls outside N.</p>,
          listenFor: ['Lookback + MERGE', 'Sizing from data', 'Commit time vs business time', 'Reconciliation as the backstop'],
        },
        {
          level: 'staff',
          q: 'The finance team says last month’s revenue changed after it was reported. How do you make historical reporting reproducible?',
          answer: <p>Decide which questions need “as it was known then” versus “as it is now”, and keep both. Keep raw extracts immutable and dated (bronze); build SCD2 or snapshot tables for the entities that change; make every model reproducible for a given as-of date; and for closed periods, publish frozen snapshots (or table time travel/versions) that reports point to, with restatements as explicit, audited events rather than silent recalculation.</p>,
          listenFor: ['Distinguishes as-known vs as-is', 'Immutable raw layer', 'Frozen period snapshots', 'Restatement as a process'],
        },
      ]}
    />
  )
}
