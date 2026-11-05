import { useDeferredValue, useMemo, useState } from 'react'
import { Experiments } from '../../components/content.tsx'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import Slider from '../../components/Slider.tsx'
import { int, pct, signedPct } from '../../format.ts'
import { N_MAX, N_MIN } from './constants.ts'
import DeepDive from './DeepDive.tsx'
import ExplainBack from './ExplainBack.tsx'
import InterviewQs from './InterviewQs.tsx'
import Intuition from './Intuition.tsx'
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
      title="A/B testing"
      controls={panel}
      intuition={<Intuition />}
      play={
        <div className={stale ? styles.stale : undefined}>
          <SingleTest sim={sim} />
          <ManyTests sim={sim} />
          <PowerCurve sim={sim} />
        </div>
      }
      breakIt={
        <div className={stale ? styles.stale : undefined}>
          <Experiments
            items={[
              {
                title: 'Manufacture false positives',
                goal: 'Run 1,000 tests of a change that does nothing.',
                setup: () => setControls({ ...DEFAULTS, lift: 0 }),
                look: <>View 2: about 5% come out significant, and the p-value histogram is flat.</>,
                why: <p>With no effect, the p-value is uniformly distributed between 0 and 1, so exactly a share α of tests land below α. That 5% is not a bug, it’s the definition of α: the false-positive rate you agreed to.</p>,
              },
              {
                title: 'Peek every day',
                goal: 'Same useless change, but check 20 times and stop at the first significant look.',
                setup: () => setControls({ ...DEFAULTS, lift: 0, looks: 20 }),
                look: <>The peeking chart below: “called a winner by a peeker” lands near 25%, five times the honest rate.</>,
                why: <p>The running p-value is a random walk that dips below α now and then even with no effect. Every look is another draw. Fixed-horizon tests look once; sequential designs raise the bar at each look so the total stays at α.</p>,
              },
              {
                title: 'Trust an underpowered winner',
                goal: 'A real +5% lift, but only 2,000 users per arm.',
                setup: () => setControls({ ...DEFAULTS, n: 2000 }),
                look: <>Power drops to about 8%, and the winner’s-curse chart shows significant results averaging several times the true lift.</>,
                why: <p>Only estimates that overshoot by about 2 standard errors pass the bar, and at low power the true effect sits far below that bar. Filtering on significance keeps the lucky overshoots.</p>,
              },
              {
                title: 'Plan a test for a tiny effect',
                goal: 'Baseline 2%, hoped-for lift +1% relative.',
                setup: () => setControls({ ...DEFAULTS, baseline: 0.02, lift: 0.01, n: 100_000 }),
                look: <>View 3’s “users per arm for 80% power”: about 7.7 million. At 100,000 users power is about 6%, barely above α.</>,
                why: <p>n scales with 1/d². A 0.02-point difference is tiny next to the binomial noise of a 2% rate, so it takes millions of users per arm to see it.</p>,
              },
              {
                title: 'Quadruple the sample',
                goal: 'Compare the confidence interval at 2,500 and at 10,000 users per arm.',
                setup: () => setControls({ ...DEFAULTS, n: 2500 }),
                look: <>Note the interval width in View 1, then drag n to 10,000: it halves.</>,
                why: <p>The standard error is proportional to 1/√n. Four times the data halves the uncertainty; to halve it again you need sixteen times the original.</p>,
              },
            ]}
          />
          <Peeking sim={sim} />
          <WinnersCurse sim={sim} />
        </div>
      }
      deepDive={<DeepDive />}
      interview={<InterviewQs />}
      explainBack={<ExplainBack />}
    />
  )
}
