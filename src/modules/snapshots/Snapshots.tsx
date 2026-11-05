import { useState } from 'react'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import Slider from '../../components/Slider.tsx'
import AsOfTable from './AsOfTable.tsx'
import type { View } from './sandbox.ts'
import { scenarios, type Scenario } from './scenarios.ts'
import SourceTable from './SourceTable.tsx'
import SqlLog from './SqlLog.tsx'
import TargetTable from './TargetTable.tsx'
import Timeline from './Timeline.tsx'
import { useSandbox } from './useSandbox.ts'
import styles from './Snapshots.module.css'

type Write = 'merge' | 'append'
type Watermark = 'maxLoaded' | 'jobEnd'

function freshness(view: View, job: string) {
  const st = view.state.find((s) => s.job === job)
  if (!st) return 'no completed run'
  const ago = view.now - st.last_run
  const wm = st.watermark !== null ? `, watermark ${st.watermark}` : ''
  return `last run at ${st.last_run} (${ago} tick${ago === 1 ? '' : 's'} ago)${wm}`
}

export default function Snapshots() {
  const { view, busy, error, run, asOf, setAsOf } = useSandbox()
  const [write, setWrite] = useState<Write>('merge')
  const [watermark, setWatermark] = useState<Watermark>('maxLoaded')
  const [active, setActive] = useState<Scenario | null>(null)

  const runScenario = (sc: Scenario) => {
    setActive(sc)
    run(async (s) => {
      await s.reset()
      await sc.run(s)
    }, sc.asOf)
    document.getElementById('lab')?.scrollIntoView({ behavior: 'smooth' })
  }

  const controls = (
    <>
      <div className={styles.clock}>
        <span>Clock</span>
        <strong>tick {view?.now ?? '…'}</strong>
      </div>
      <strong>Jobs</strong>
      <button type="button" disabled={busy} onClick={() => run((s) => s.fullReload())}>
        Full reload
      </button>
      <fieldset className={styles.fieldset}>
        <legend>Incremental load</legend>
        <label>
          <input type="radio" checked={write === 'merge'} onChange={() => setWrite('merge')} /> merge by key
        </label>
        <label>
          <input type="radio" checked={write === 'append'} onChange={() => setWrite('append')} /> append (INSERT)
        </label>
        <label>
          <input type="radio" checked={watermark === 'maxLoaded'} onChange={() => setWatermark('maxLoaded')} /> watermark = max(updated_at)
        </label>
        <label>
          <input type="radio" checked={watermark === 'jobEnd'} onChange={() => setWatermark('jobEnd')} /> watermark = job end time
        </label>
        <button type="button" disabled={busy} onClick={() => run((s) => s.incremental({ write, watermark }))}>
          Run
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => run((s) => s.incremental({ write, watermark, crashBeforeWatermark: true }))}
        >
          Run, crash before saving watermark
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => run((s) => s.incremental({ write, watermark, changeDuringRun: true }))}
        >
          Run, source changes mid-run
        </button>
      </fieldset>
      <button type="button" disabled={busy} onClick={() => run((s) => s.snapshot())}>
        SCD2 snapshot
      </button>
      <button type="button" disabled={busy} onClick={() => run((s) => s.wait())}>
        Let 1 tick pass
      </button>
      {view && view.now > 1 && (
        <Slider
          label="As of T"
          value={Math.min(asOf, view.now)}
          onChange={setAsOf}
          min={1}
          max={view.now}
          step={1}
          format={String}
          hint="“what did we know at T” (below the timeline)"
        />
      )}
      <button
        type="button"
        className={styles.secondary}
        disabled={busy}
        onClick={() => {
          setActive(null)
          run((s) => s.reset())
        }}
      >
        Reset sandbox
      </button>
    </>
  )

  const snapshotTicks = view?.log.filter((e) => e.label.startsWith('SCD2')).map((e) => e.tick) ?? []

  const play = !view ? (
    <p>{error ? `DuckDB failed to start: ${error}` : 'Starting DuckDB in your browser (a few MB, once)…'}</p>
  ) : (
    <div className={busy ? styles.busy : undefined}>
      {error && <p className={styles.error}>{error}</p>}
      {active && (
        <div className="try">
          <strong>Scenario: {active.title}.</strong> {active.setup}
          <br />
          <strong>Look for:</strong> {active.lookFor}
        </div>
      )}
      <SourceTable rows={view.source} busy={busy} run={run} />
      <div className={styles.targets}>
        <TargetTable title="target_full (full reload)" rows={view.targetFull} diff={view.diffFull} freshness={freshness(view, 'full')} neverRun={view.targetFull.length === 0 && !view.state.some((x) => x.job === 'full')} />
        <TargetTable title="target_incr (incremental)" rows={view.targetIncr} diff={view.diffIncr} freshness={freshness(view, 'incremental')} neverRun={view.targetIncr.length === 0 && !view.state.some((x) => x.job === 'incremental')} />
      </div>
      <div className={styles.card}>
        <h4>snap_customers (SCD2 history)</h4>
        <p className={styles.meta}>
          {freshness(view, 'snapshot')} · each bar is one version, from valid_from to valid_to; faint lines mark snapshot runs
        </p>
        <Timeline snaps={view.snaps} now={view.now} asOf={Math.min(asOf, view.now)} snapshotTicks={snapshotTicks} />
        <AsOfTable truth={view.truthAt} snap={view.snapAt} asOf={Math.min(asOf, view.now)} />
      </div>
      <SqlLog log={view.log} />
    </div>
  )

  const breakIt = (
    <p className="lede">
      Each scenario resets the sandbox, runs a short script and leaves the result in the tables above.
      Read the action log to see each step and the SQL it ran.
    </p>
  )

  const onPreset = (p: Record<string, unknown>) => {
    const sc = scenarios.find((x) => x.id === p.scenario)
    if (sc) runScenario(sc)
  }

  return (
    <ModuleLayout controls={controls} play={play} breakIt={breakIt} onPreset={onPreset} />
  )
}
