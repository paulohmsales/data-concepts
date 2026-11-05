import * as Plot from '@observablehq/plot'
import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import { Choice, ResetButton, SeedControl } from '../../components/Controls.tsx'
import DataTable from '../../components/DataTable.tsx'
import ExplainBack from '../../components/ExplainBack.tsx'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import PlotFigure from '../../components/PlotFigure.tsx'
import Slider from '../../components/Slider.tsx'
import { Stat, StatRow } from '../../components/Stat.tsx'
import Status from '../../components/Status.tsx'
import type { VizTheme } from '../../components/vizTheme.ts'
import { bootstrap, bootstrapCoverage, percentileInterval, resample, STATS, type StatName } from '../../core/bootstrap.ts'
import { meanInterval } from '../../core/ci.ts'
import { mulberry32 } from '../../core/random.ts'
import { sd } from '../../core/stats.ts'
import { int, pct } from '../../format.ts'
import styles from '../common.module.css'

interface Controls {
  stat: StatName
  n: number
  B: number
  level: number
  seed: number
}

const DEFAULTS: Controls = { stat: 'median', n: 30, B: 2000, level: 0.9, seed: 1 }
const COVERAGE_NS = [5, 20, 100]
const f1 = (x: number) => x.toFixed(1)

function simulate(c: Controls) {
  const s = STATS[c.stat]
  const rng = mulberry32(c.seed)
  const sample = Array.from({ length: c.n }, () => s.sample(rng))
  const estimate = s.of(sample)
  const reps = bootstrap(sample, s.of, c.B, rng)
  const interval = percentileInterval(reps, c.level)
  // how much of the sample one resample leaves out (≈ 1/e)
  const one = resample(sample.map((_, i) => i), rng)
  const leftOut = 1 - new Set(one).size / c.n
  return { s, sample, estimate, reps, interval, leftOut }
}

type CoverageRow = { stat: StatName; byN: number[] }

export default function Bootstrap() {
  const [c, setC] = useState(DEFAULTS)
  const deferred = useDeferredValue(c)
  const sim = useMemo(() => simulate(deferred), [deferred])
  const stale = deferred !== c
  const set = <K extends keyof Controls>(k: K) => (v: Controls[K]) => setC((s) => ({ ...s, [k]: v }))
  const [coverage, setCoverage] = useState<CoverageRow[] | null>(null)
  const [running, setRunning] = useState(false)

  const runCoverage = () => {
    setRunning(true)
    // let the button repaint before the heavy loop
    setTimeout(() => {
      const rng = mulberry32(c.seed + 99)
      setCoverage(
        (Object.keys(STATS) as StatName[]).map((stat) => ({
          stat,
          byN: COVERAGE_NS.map((n) => bootstrapCoverage(stat, n, c.level, 200, 300, rng)),
        })),
      )
      setRunning(false)
    }, 20)
  }

  const { s, sample, estimate, reps, interval } = sim
  const tInterval = deferred.stat === 'mean' ? meanInterval(sample, deferred.level, 't', s.truth) : null

  const buildSample = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => ({
      width,
      height: 110,
      marginTop: 10,
      x: { label: `one sample of ${sample.length}: ${s.population} →`, domain: deferred.stat === 'max' ? [0, 100] : [0, 200], clamp: true },
      y: { axis: null },
      marks: [
        Plot.tickX(sample, { x: (d: number) => d, stroke: t.series1, strokeOpacity: 0.7 }),
        Plot.ruleX([estimate], { stroke: t.series2, strokeWidth: 3 }),
        Plot.text([estimate], { x: (d: number) => d, frameAnchor: 'top', dy: -2, dx: 6, textAnchor: 'start', text: () => `sample ${s.label.toLowerCase()} ${f1(estimate)}`, fill: t.ink }),
      ],
    }),
    [sample, estimate, s, deferred.stat],
  )

  const buildReps = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => ({
      width,
      height: 260,
      x: { label: `${s.label.toLowerCase()} of each resample →` },
      y: { label: '↑ resamples', grid: true },
      marks: [
        Plot.rectY(reps, Plot.binX<Plot.RectYOptions>({ y: 'count' }, { x: (d: number) => d, thresholds: 50, fill: t.series1, insetLeft: 0.5, insetRight: 0.5, tip: true })),
        Plot.ruleY([0], { stroke: t.axis }),
        Plot.ruleX(interval, { stroke: t.series2, strokeWidth: 2 }),
        Plot.text([interval[0]], { x: (d: number) => d, frameAnchor: 'top', dx: -4, textAnchor: 'end', text: () => `${pct(deferred.level, 0)} interval`, fill: t.inkSecondary }),
        Plot.ruleX([s.truth], { stroke: t.ink, strokeDasharray: '4 3' }),
        Plot.text([s.truth], { x: (d: number) => d, frameAnchor: 'top', dy: 14, dx: 4, textAnchor: 'start', text: () => 'truth (unknown in real life)', fill: t.inkSecondary }),
      ],
    }),
    [reps, interval, s, deferred.level],
  )

  const panel = (
    <>
      <Choice label="Statistic" value={c.stat} onChange={set('stat')} options={(Object.keys(STATS) as StatName[]).map((k) => ({ value: k, label: STATS[k].label }))} />
      <Slider label="Sample size n" value={c.n} onChange={set('n')} min={5} max={500} step={1} log format={int} />
      <Slider label="Resamples B" value={c.B} onChange={set('B')} min={200} max={5000} step={100} format={int} />
      <Slider label="Interval level" value={c.level} onChange={set('level')} min={0.8} max={0.99} step={0.01} format={(v) => pct(v, 0)} />
      <SeedControl seed={c.seed} onChange={set('seed')} />
      <ResetButton onClick={() => setC(DEFAULTS)} />
    </>
  )

  return (
    <ModuleLayout
      title="The bootstrap"
      controls={panel}
      intuition={
        <>
          <p>
            You have one sample and a statistic, say the median income of 30 people. How uncertain is
            it? For a mean there is a formula (s/√n). For a median, a 90th percentile or a ratio, the
            formula is ugly or doesn’t exist.
          </p>
          <p>
            The <b>bootstrap</b> fakes the “repeat the study” experiment using only the data you have.
            Treat your sample as a stand-in for the population, draw a new sample of the same size from
            it <em>with replacement</em> (some people twice, about a third not at all), and recompute the
            statistic. Do it thousands of times. The spread of those recomputed values estimates the
            statistic’s standard error, and their middle 90% is a 90% interval.
          </p>
          <p>
            It works when the sample resembles the population well enough. It quietly fails when the
            sample is tiny, or when the statistic depends on extremes the sample can’t contain.
          </p>
        </>
      }
      play={
        <div className={stale ? styles.stale : undefined}>
          <h3>The one sample you have</h3>
          <PlotFigure build={buildSample} label="Strip of the sample values with the sample statistic" />
          <h3>{int(deferred.B)} resamples of it</h3>
          <p className="lede">
            Each resample draws {int(deferred.n)} values from the sample with replacement. One resample
            left out {pct(sim.leftOut, 0)} of the original values (on average 1/e ≈ 37%).
          </p>
          <StatRow>
            <Stat label={`Sample ${s.label.toLowerCase()}`} value={f1(estimate)} note={`truth ${f1(s.truth)}`} />
            <Stat label="Bootstrap standard error" value={f1(sd(reps))} note="SD of the resampled statistic" />
            <Stat
              label={`${pct(deferred.level, 0)} percentile interval`}
              value={`${f1(interval[0])} – ${f1(interval[1])}`}
              note={interval[0] <= s.truth && s.truth <= interval[1] ? <Status level="good">contains the truth</Status> : <Status level="bad">misses the truth</Status>}
            />
            {tInterval && <Stat label="Formula (t) interval" value={`${f1(tInterval.lo)} – ${f1(tInterval.hi)}`} note="for comparison" />}
          </StatRow>
          <PlotFigure build={buildReps} label="Histogram of bootstrap replicates with the percentile interval" />
          <p className="try">
            Try: pick the mean and compare the bootstrap interval with the formula interval: they nearly agree. Now pick the 90th percentile, where there is no simple formula and the bootstrap still gives an answer. Small n with the median makes a spiky histogram: a median of 5 values can only be one of those values.
          </p>
        </div>
      }
      breakIt={
        <>
          <h3>Does the interval really cover {pct(c.level, 0)} of the time?</h3>
          <p className="lede">
            Run 200 fresh studies per cell, bootstrap each one (300 resamples), and count how often the
            interval contains the truth.
          </p>
          <div className={styles.buttons}>
            <button type="button" onClick={runCoverage} disabled={running}>
              {running ? 'Running…' : coverage ? 'Run again' : 'Run the coverage check'}
            </button>
          </div>
          {coverage && (
            <DataTable
              rows={coverage}
              rowKey={(r) => r.stat}
              columns={[
                { key: 's', label: 'Statistic', render: (r) => `${STATS[r.stat].label} (${STATS[r.stat].population})` },
                ...COVERAGE_NS.map((n, i) => ({
                  key: String(n),
                  label: `n = ${n}`,
                  align: 'right' as const,
                  render: (r: CoverageRow) => {
                    const v = r.byN[i]
                    const gap = c.level - v
                    return <Status level={gap < 0.04 ? 'good' : gap < 0.1 ? 'warn' : 'bad'}>{pct(v, 0)}</Status>
                  },
                })),
              ]}
            />
          )}
          <ul>
            <li>
              <b>The maximum:</b> a resample can never exceed the sample’s own maximum, which is below the
              true maximum. The interval sits entirely below the truth: 0% coverage at any n. The same
              goes for anything driven by extremes, like the max order or a 99.9th percentile with little data.
            </li>
            <li>
              <b>Tiny samples:</b> at n = 5 the sample is a poor stand-in for a skewed population (it
              rarely contains the long tail), so the intervals are too narrow. The bootstrap is not magic
              for small data.
            </li>
          </ul>
        </>
      }
      explainBack={
        <ExplainBack
          questions={[
            {
              q: 'Explain the bootstrap to a PM in two sentences.',
              a: 'We can’t rerun the study, so we pretend our sample is the population and draw many fake “new studies” from it with replacement. How much the answer wobbles across those fake studies tells us how much it would wobble across real ones.',
            },
            {
              q: 'Why resample with replacement, and why the same size n?',
              a: 'Without replacement, every resample of size n is just the original sample shuffled: same statistic every time, no variability. With replacement, each draw is independent from the empirical distribution, mimicking fresh draws from the population. Same n, because the uncertainty depends on n.',
            },
            {
              q: 'When does the bootstrap fail? Give two cases.',
              a: 'Statistics driven by extremes (the max, extreme quantiles), since resamples can’t go beyond the sample; and tiny samples, which don’t represent the population. It also breaks with dependent data (time series, clustered users) unless you resample blocks or clusters instead of rows.',
            },
            {
              q: 'You A/B test revenue per user and want a CI for the ratio of means B/A. How would you bootstrap it?',
              a: 'Resample users with replacement within A and within B separately (keeping each arm’s size), compute mean(B)/mean(A) for each pair of resamples, repeat thousands of times, and take the 2.5th and 97.5th percentiles. If users have many rows, resample users, not rows.',
            },
          ]}
        />
      }
    />
  )
}
