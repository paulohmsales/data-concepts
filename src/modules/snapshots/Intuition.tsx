export default function Intuition() {
  return (
    <>
      <p>
        The app has a <b>source</b> database that it changes all day: customers sign up, switch plans,
        get deleted. Analytics wants a copy in the <b>warehouse</b>, and there are three basic ways to
        keep that copy up to date.
      </p>
      <p>
        <b>Full reload:</b> empty the copy and copy everything again. Easy, always right afterwards,
        and safe to rerun. But it costs as much as the whole table every time, and it only ever knows{' '}
        <em>now</em>.
      </p>
      <p>
        <b>Incremental load:</b> remember a <b>watermark</b> (“I have everything up to updated_at =
        42”) and next time copy only rows with updated_at &gt; 42. Cheap, but it trusts that every
        change bumps updated_at, shows up in order, and never disappears. Hard deletes,
        late-arriving rows and changes made <em>while the job runs</em> all break that trust. And
        if the job crashes and retries, it had better be <b>idempotent</b>: running it twice must give
        the same table as running it once.
      </p>
      <p>
        <b>Snapshot (SCD2):</b> keep every version of each row with <code>valid_from</code> and{' '}
        <code>valid_to</code>. Now you can ask “what was true at T?”, which neither copy above can
        answer. But a snapshot only sees what the source looks like when it runs. Anything that
        changes and changes back between two runs is invisible.
      </p>
      <p>
        The clock here is logical: every action takes a tick (an incremental job takes two:
        extract, then finish). Edit the source, run jobs, and watch each target drift from, or stay
        in step with, the truth.
      </p>
    </>
  )
}
