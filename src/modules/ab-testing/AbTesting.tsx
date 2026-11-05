import { useDeferredValue, useMemo, useState } from 'react'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import Slider from '../../components/Slider.tsx'
import { int, pct, signedPct } from '../../format.ts'
import { N_MAX, N_MIN } from './constants.ts'
import { runSimulation, type Controls } from './simulation.ts'
import ManyTests from './views/ManyTests.tsx'
import Peeking from './views/Peeking.tsx'
import PowerCurve from './views/PowerCurve.tsx'
import SingleTest from './views/SingleTest.tsx'
import WinnersCurse from './views/WinnersCurse.tsx'
import styles from './AbTesting.module.css'

const DEFAULTS: Controls = {
  baseline: 0.1,
  lift: 0.05,
  n: 10_000,
  alpha: 0.05,
  sims: 1000,
  looks: 20,
  seed: 1,
}

export default function AbTesting() {
  const [controls, setControls] = useState<Controls>(DEFAULTS)
  // Sliders stay responsive; the simulation catches up when the browser is idle.
  const deferred = useDeferredValue(controls)
  const sim = useMemo(() => runSimulation(deferred), [deferred])
  const stale = deferred !== controls

  const set = <K extends keyof Controls>(key: K) => (v: Controls[K]) =>
    setControls((c) => ({ ...c, [key]: v }))

  const panel = (
    <>
      <strong>Experiment</strong>
      <Slider label="Baseline conversion (A)" value={controls.baseline} onChange={set('baseline')} min={0.005} max={0.5} step={0.005} format={(v) => pct(v, 1)} />
      <Slider
        label="True relative lift (B vs A)"
        value={controls.lift}
        onChange={set('lift')}
        min={-0.2}
        max={0.5}
        step={0.01}
        format={(v) => signedPct(v, 0)}
        hint={`B converts at ${pct(controls.baseline * (1 + controls.lift), 2)}`}
      />
      <Slider label="Users per arm (n)" value={controls.n} onChange={set('n')} min={N_MIN} max={N_MAX} step={1} log format={int} />
      <Slider label="Significance level α" value={controls.alpha} onChange={set('alpha')} min={0.01} max={0.2} step={0.01} format={(v) => v.toFixed(2)} />
      <strong>Simulation</strong>
      <Slider label="Simulated tests" value={controls.sims} onChange={set('sims')} min={100} max={2000} step={100} format={int} />
      <Slider label="Peeks per test" value={controls.looks} onChange={set('looks')} min={1} max={50} step={1} format={String} hint="used in Break it" />
      <div className={styles.seed}>
        <label>
          Seed{' '}
          <input
            type="number"
            value={controls.seed}
            onChange={(e) => set('seed')(Math.trunc(Number(e.target.value)) || 0)}
          />
        </label>
        <button type="button" onClick={() => set('seed')(Math.floor(Math.random() * 1_000_000))}>
          New luck
        </button>
      </div>
      <button type="button" className={styles.reset} onClick={() => setControls(DEFAULTS)}>
        Reset
      </button>
    </>
  )

  return (
    <ModuleLayout
      controls={panel}
      onPreset={(p) => setControls({ ...DEFAULTS, ...(p as Partial<Controls>) })}
      play={
        <div className={stale ? styles.stale : undefined}>
          <SingleTest sim={sim} />
          <ManyTests sim={sim} />
          <PowerCurve sim={sim} />
        </div>
      }
      breakIt={
        <div className={stale ? styles.stale : undefined}>
          <Peeking sim={sim} />
          <WinnersCurse sim={sim} />
        </div>
      }
    />
  )
}
