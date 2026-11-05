import * as Plot from '@observablehq/plot'
import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import { Choice, ResetButton, SeedControl } from '../../components/Controls.tsx'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import PlotFigure from '../../components/PlotFigure.tsx'
import Slider from '../../components/Slider.tsx'
import { Stat, StatRow } from '../../components/Stat.tsx'
import type { VizTheme } from '../../components/vizTheme.ts'
import { coverage, POPULATIONS, simulateIntervals, type Method, type Population } from '../../core/ci.ts'
import { mulberry32 } from '../../core/random.ts'
import { mean } from '../../core/stats.ts'
import { int, pct } from '../../format.ts'
import styles from '../common.module.css'

interface Controls {
  population: Population
  n: number
  level: number
  method: Method
  seed: number
}

const DEFAULTS: Controls = { population: 'normal', n: 20, level: 0.95, method: 't', seed: 1 }
const NS = [3, 5, 10, 20, 50, 100, 200]
const HIT = 'contains the true mean'
const MISS = 'missed it ✗'

function simulate(c: Controls) {
  const shown = simulateIntervals(c, 100, mulberry32(c.seed))
  const longRun = coverage(simulateIntervals(c, 10_000, mulberry32(c.seed + 1)))
  const rng = mulberry32(c.seed + 2)
  const byN = NS.flatMap((n) =>
    (['t', 'z'] as const).map((method) => ({
      n,
      method: method === 't' ? 't interval' : 'z interval (normal critical value)',
      coverage: coverage(simulateIntervals({ ...c, n, method }, 2000, rng)),
    })),
  )
  return { shown, longRun, byN }
}

export default function ConfidenceIntervals() {
  const [c, setC] = useState(DEFAULTS)
  const deferred = useDeferredValue(c)
  const sim = useMemo(() => simulate(deferred), [deferred])
  const stale = deferred !== c
  const set = <K extends keyof Controls>(k: K) => (v: Controls[K]) => setC((s) => ({ ...s, [k]: v }))
  const pop = POPULATIONS[deferred.population]
  const hits = sim.shown.filter((iv) => iv.covers).length
  const avgWidth = mean(sim.shown.map((iv) => iv.hi - iv.lo))

  const buildIntervals = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const data = sim.shown.map((iv, i) => ({ ...iv, i: i + 1, kind: iv.covers ? HIT : MISS }))
      // symmetric around the truth, wide enough for the 98% widest intervals (outliers are clamped)
      const reach = [...sim.shown.map((iv) => Math.max(pop.mu - iv.lo, iv.hi - pop.mu))].sort((a, b) => a - b)[97] * 1.1
      return {
        width,
        height: 520,
        marginLeft: 40,
        x: { label: 'interval for the mean →', domain: [pop.mu - reach, pop.mu + reach], clamp: true },
        y: { label: '↑ experiment #', domain: [0, 101], ticks: [1, 25, 50, 75, 100] },
        color: { domain: [HIT, MISS], range: [t.series1, '#d03b3b'], legend: true },
        marks: [
          Plot.ruleY(data, { y: 'i', x1: 'lo', x2: 'hi', stroke: 'kind', strokeWidth: 2, tip: { format: { y: true, x1: '.2f', x2: '.2f', stroke: true } } }),
          Plot.dot(data, { y: 'i', x: 'center', fill: 'kind', r: 2 }),
          Plot.ruleX([pop.mu], { stroke: t.ink, strokeDasharray: '4 3' }),
          Plot.text([pop.mu], { x: (d: number) => d, frameAnchor: 'top', dy: -6, text: () => `true mean ${pop.mu}`, fill: t.inkSecondary }),
        ],
      }
    },
    [sim.shown, pop.mu],
  )

  const buildByN = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => ({
      width,
      height: 260,
      x: { type: 'log', label: 'sample size n (log) →' },
      y: { label: '↑ long-run coverage', domain: [0.6, 1], tickFormat: '.0%', grid: true },
      color: { domain: ['t interval', 'z interval (normal critical value)'], range: [t.series1, t.series2], legend: true },
      marks: [
        Plot.axisX(NS, { tickFormat: (d: number) => String(d) }),
        Plot.ruleY([deferred.level], { stroke: t.ink, strokeDasharray: '4 3' }),
        Plot.text([deferred.level], { y: (d: number) => d, frameAnchor: 'right', dy: -8, text: () => `promised ${pct(deferred.level, 0)}`, fill: t.inkSecondary }),
        Plot.line(sim.byN, { x: 'n', y: 'coverage', stroke: 'method', strokeWidth: 2 }),
        Plot.dot(sim.byN, { x: 'n', y: 'coverage', fill: 'method', r: 4, tip: { format: { y: '.1%' } } }),
      ],
    }),
    [sim.byN, deferred.level],
  )

  const panel = (
    <>
      <Choice label="Population" value={c.population} onChange={set('population')} options={Object.entries(POPULATIONS).map(([value, p]) => ({ value: value as Population, label: p.label }))} />
      <Slider label="Sample size n" value={c.n} onChange={set('n')} min={3} max={500} step={1} log format={int} />
      <Slider label="Confidence level" value={c.level} onChange={set('level')} min={0.5} max={0.99} step={0.01} format={(v) => pct(v, 0)} />
      <Choice
        label="Critical value"
        value={c.method}
        onChange={set('method')}
        options={[
          { value: 't', label: 't (correct)' },
          { value: 'z', label: 'z (1.96)' },
        ]}
      />
      <SeedControl seed={c.seed} onChange={set('seed')} />
      <ResetButton onClick={() => setC(DEFAULTS)} />
    </>
  )

  return (
    <ModuleLayout
      onPreset={(p) => setC({ ...DEFAULTS, ...(p as Partial<Controls>) })}
      controls={panel}
      play={
        <div className={stale ? styles.stale : undefined}>
          <h3>100 studies, 100 intervals</h3>
          <p className="lede">
            Each line is one study: {int(deferred.n)} draws from “{pop.label}”, and its {pct(deferred.level, 0)}{' '}
            interval. The dashed line is the truth, which the studies never see.
          </p>
          <StatRow>
            <Stat label="Contain the true mean" value={`${hits} / 100`} note={`promised ${pct(deferred.level, 0)}`} />
            <Stat label="Long-run coverage" value={pct(sim.longRun)} note="over 10,000 studies" />
            <Stat label="Average width" value={avgWidth.toFixed(1)} note="shrinks like 1/√n" />
          </StatRow>
          <PlotFigure build={buildIntervals} label="One hundred confidence intervals, misses in red" />
        </div>
      }
      breakIt={
        <div className={stale ? styles.stale : undefined}>
          <h3>When the 95% is a lie</h3>
          <p className="lede">
            Long-run coverage against n, for the correct t interval and the “just use 1.96” z
            interval. The recipe only delivers its promise when its assumptions hold.
          </p>
          <PlotFigure build={buildByN} label="Coverage of t and z intervals against sample size" />
          <ul>
            <li>
              <b>Small n with z:</b> at n = 5 the 1.96 interval covers only ~88%. The sample SD is itself a
              noisy guess, and the t distribution’s fatter tails pay for that. Set n = 5 and switch to
              z above: count the red lines.
            </li>
            <li>
              <b>Skewed data with small n:</b> pick the exponential population. Even the t interval
              falls short at n = 5–10, because the mean of a few skewed draws isn’t normal yet (see
              the CLT module). Both lines climb back to the promise as n grows.
            </li>
          </ul>
        </div>
      }
    />
  )
}
