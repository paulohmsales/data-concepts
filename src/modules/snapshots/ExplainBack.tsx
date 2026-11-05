import styles from '../ab-testing/ExplainBack.module.css'

const questions: { q: string; a: string }[] = [
  {
    q: 'Why can’t a watermark-based incremental load see hard deletes, and what are two ways to handle them?',
    a: 'The job selects rows with updated_at > watermark; a deleted row no longer exists, so there is nothing to select. Options: soft deletes in the source (a deleted_at column that bumps updated_at), change data capture from the database log, or a periodic full key comparison (anti-join of target keys against source keys) to close or remove ghosts.',
  },
  {
    q: 'What makes a load job idempotent, and why does it matter for retries?',
    a: 'Running it twice on the same input leaves the target exactly as running it once. Schedulers retry failed jobs, and a job can fail after writing data but before recording success. Merge/upsert by key (or delete-then-insert of the batch’s keys, or overwrite of a partition) makes the retry harmless; a plain INSERT duplicates rows.',
  },
  {
    q: 'Why should the next watermark be max(updated_at) of the loaded rows and not the time the job finished?',
    a: 'Rows can change after you extract and before you finish. If you save the finish time, those changes have updated_at ≤ the watermark and are skipped forever. max(updated_at) of what you actually loaded only claims what you really have. (In practice also allow for ties and clock skew: use a small lookback window and merge, so re-reading a few rows is harmless.)',
  },
  {
    q: 'A row arrives with updated_at older than your watermark. What happens, and how do you design for it?',
    a: 'The incremental job never selects it, so the target silently misses it, while a full reload would have it. Designs: a lookback window (updated_at > watermark − N) combined with an idempotent merge; watermark on an ingestion/commit timestamp the source sets on arrival rather than a business timestamp; or a periodic full reconciliation.',
  },
  {
    q: 'Your SCD2 snapshot runs daily. Product asks how many users were on a trial plan for a few hours last Tuesday. What can you tell them?',
    a: 'The snapshot can’t answer it: it only sees state at run time, so a plan that changed and changed back between two daily runs never appears. You need finer snapshots, the source’s own change history (an audit table, CDC log or event stream), or a timestamp-strategy snapshot that at least uses updated_at for valid_from. Snapshot cadence sets the resolution of every historical question.',
  },
]

export default function ExplainBack() {
  return (
    <>
      <p>
        Answer each one out loud or in <code>notes/snapshots.md</code> <em>before</em> opening the
        reference answer. If you can’t explain it without notes, rerun the matching scenario.
      </p>
      <ol className={styles.list}>
        {questions.map(({ q, a }) => (
          <li key={q}>
            <p>{q}</p>
            <details>
              <summary>Reference answer</summary>
              <p>{a}</p>
            </details>
          </li>
        ))}
      </ol>
    </>
  )
}
