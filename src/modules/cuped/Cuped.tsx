import * as Plot from '@observablehq/plot'
import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import { ResetButton, SeedControl } from '../../components/Controls.tsx'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import PlotFigure from '../../components/PlotFigure.tsx'
import Slider from '../../components/Slider.tsx'
import { Stat, StatRow } from '../../components/Stat.tsx'
import type { VizTheme } from '../../components/vizTheme.ts'
import { analyze, simulateMany, simulateUnits, type CupedParams } from '../../core/cuped.ts'
import { mulberry32 } from '../../core/random.ts'
import { mean } from '../../core/stats.ts'
import { int, pct } from '../../format.ts'
import styles from '../common.module.css'

interface Controls extends CupedParams {
  seed: number
}

const DEFAULTS: Controls = { n: 2000, rho: 0.7, effect: 0.08, leak: 0, seed: 1 }
const RAW = 'plain difference'
const CUPED = 'CUPED-adjusted'
const LEAKS = [0, 0.25, 0.5, 0.75, 1]
const f3 = (x: number) => x.toFixed(3)

function simulate(c: Controls) {
  const units = simulateUnits(c, mulberry32(c.seed))
  const one = analyze(units)
  const runs = Math.max(60, Math.min(300, Math.round(600_000 / (2 * c.n))))
  const many = simulateMany(c, runs, mulberry32(c.seed + 1))
  const nSweep = Math.min(c.n, 2000)
  const sweepRng = mulberry32(c.seed + 2)
  const sweep = LEAKS.flatMap((leak) => {
    const rs = simulateMany({ ...c, n: nSweep, leak }, 60, sweepRng)
    return [
      { leak, kind: RAW, est: mean(rs.map((r) => r.raw.diff)) },
      { leak, kind: CUPED, est: mean(rs.map((r) => r.cuped.diff)) },
    ]
  })
  return { units, one, many, sweep }
}

export default function Cuped() {
  const [c, setC] = useState(DEFAULTS)
  const deferred = useDeferredValue(c)
  const sim = useMemo(() => simulate(deferred), [deferred])
  const stale = deferred !== c
  const set = <K extends keyof Controls>(k: K) => (v: Controls[K]) => setC((s) => ({ ...s, [k]: v }))
  const { one, many } = sim
  const powerRaw = many.filter((r) => r.raw.significant && r.raw.diff > 0).length / many.length
  const powerCuped = many.filter((r) => r.cuped.significant && r.cuped.diff > 0).length / many.length

  const buildScatter = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const pts = sim.units.slice(0, 800).map((u) => ({ ...u, arm: u.treated ? 'treatment' : 'control' }))
      return {
        width: Math.min(width, 420),
        height: 300,
        x: { label: 'pre-period metric x →', domain: [-3.5, 3.5] },
        y: { label: '↑ outcome y', domain: [-3.5, 3.5], grid: true },
        color: { domain: ['control', 'treatment'], range: [t.series1, t.series2], legend: true },
        marks: [Plot.dot(pts, { x: 'x', y: 'y', fill: 'arm', r: 2, fillOpacity: 0.6 })],
      }
    },
    [sim.units],
  )

  const buildIntervals = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const data = [
        { kind: RAW, ...one.raw, lo: one.raw.ci[0], hi: one.raw.ci[1] },
        { kind: CUPED, ...one.cuped, lo: one.cuped.ci[0], hi: one.cuped.ci[1] },
      ]
      return {
        width,
        height: 140,
        marginLeft: 120,
        x: { label: 'estimated effect (95% interval) →', grid: true },
        y: { label: null, domain: [RAW, CUPED] },
        color: { domain: [RAW, CUPED], range: [t.series1, t.series3] },
        marks: [
          Plot.ruleX([0], { stroke: t.axis }),
          Plot.ruleX([deferred.effect], { stroke: t.ink, strokeDasharray: '4 3' }),
          Plot.ruleY(data, { y: 'kind', x1: 'lo', x2: 'hi', stroke: 'kind', strokeWidth: 3 }),
          Plot.dot(data, { y: 'kind', x: 'diff', fill: 'kind', r: 6, stroke: t.surface, strokeWidth: 2, tip: { format: { x: '.3f', y: true, fill: false } } }),
        ],
      }
    },
    [one, deferred.effect],
  )

  const buildMany = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const data = many.flatMap((r) => [
        { kind: RAW, est: r.raw.diff },
        { kind: CUPED, est: r.cuped.diff },
      ])
      return {
        width,
        height: 240,
        x: { label: `estimated effect across ${many.length} reruns →` },
        y: { label: '↑ reruns', grid: true },
        color: { domain: [RAW, CUPED], range: [t.series1, t.series3], legend: true },
        marks: [
          Plot.lineY(data, Plot.binX<Plot.LineYOptions>({ y: 'count' }, { x: 'est', stroke: 'kind', strokeWidth: 2, curve: 'step', thresholds: 40, tip: true })),
          Plot.ruleX([deferred.effect], { stroke: t.ink, strokeDasharray: '4 3' }),
          Plot.ruleY([0], { stroke: t.axis }),
        ],
      }
    },
    [many, deferred.effect],
  )

  const buildSweep = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => ({
      width,
      height: 240,
      x: { label: 'share of the effect that leaks into the “covariate” →', tickFormat: '.0%' },
      y: { label: '↑ average estimate', grid: true, domain: [0, deferred.effect * 1.3] },
      color: { domain: [RAW, CUPED], range: [t.series1, t.series3], legend: true },
      marks: [
        Plot.ruleY([deferred.effect], { stroke: t.ink, strokeDasharray: '4 3' }),
        Plot.text([deferred.effect], { y: (d: number) => d, frameAnchor: 'right', dy: -8, text: () => 'true effect', fill: t.inkSecondary }),
        Plot.line(sim.sweep, { x: 'leak', y: 'est', stroke: 'kind', strokeWidth: 2 }),
        Plot.dot(sim.sweep, { x: 'leak', y: 'est', fill: 'kind', r: 4, tip: { format: { y: '.3f', x: '.0%' } } }),
      ],
    }),
    [sim.sweep, deferred.effect],
  )

  const panel = (
    <>
      <Slider label="Users per arm" value={c.n} onChange={set('n')} min={200} max={50_000} step={1} log format={int} />
      <Slider label="Correlation of pre-period with outcome (ρ)" value={c.rho} onChange={set('rho')} min={0} max={0.95} step={0.05} format={(v) => v.toFixed(2)} />
      <Slider label="True effect (in SDs of y)" value={c.effect} onChange={set('effect')} min={0} max={0.3} step={0.01} format={(v) => v.toFixed(2)} />
      <Slider label="Covariate leak (Break it)" value={c.leak} onChange={set('leak')} min={0} max={1} step={0.05} format={(v) => pct(v, 0)} hint="0% = measured before the test" />
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
          <div className={styles.grid2}>
            <div>
              <h3>Users: before vs during</h3>
              <p className="lede">Heavy users stay heavy: that predictable part is what CUPED removes.</p>
              <PlotFigure build={buildScatter} label="Scatter of pre-period metric against outcome" />
            </div>
            <div>
              <h3>One experiment</h3>
              <StatRow>
                <Stat label="Variance kept" value={pct(one.varianceRatio, 0)} note={`theory 1 − ρ² = ${pct(1 - deferred.rho ** 2, 0)}`} />
                <Stat label="Worth" value={`${(1 / one.varianceRatio).toFixed(1)}× traffic`} note="same precision without CUPED" />
              </StatRow>
              <PlotFigure build={buildIntervals} label="Raw and CUPED estimates with 95% intervals" />
            </div>
          </div>
          <h3>Rerun it many times</h3>
          <StatRow>
            <Stat label="Average raw estimate" value={f3(mean(many.map((r) => r.raw.diff)))} note={`truth ${f3(deferred.effect)}`} />
            <Stat label="Average CUPED estimate" value={f3(mean(many.map((r) => r.cuped.diff)))} note="same centre: unbiased" />
            <Stat label="Power: raw → CUPED" value={`${pct(powerRaw, 0)} → ${pct(powerCuped, 0)}`} note="share of reruns detecting it" />
          </StatRow>
          <PlotFigure build={buildMany} label="Distribution of raw and CUPED estimates across reruns" />
        </div>
      }
      breakIt={
        <div className={stale ? styles.stale : undefined}>
          <h3>A covariate the treatment can move</h3>
          <p className="lede">
            Someone uses “sessions during the experiment” as the covariate because it correlates better.
            But the treatment also changes sessions. Part of the effect now lives in x, and
            subtracting θ·x subtracts that part of the effect too.
          </p>
          <PlotFigure build={buildSweep} label="Average raw and CUPED estimate as the covariate leak grows" />
          <p>
            At 0% leak (a proper pre-period covariate), both lines sit on the truth. As the leak grows, the
            CUPED estimate sinks toward zero while still looking more precise. That is the worst
            combination: confidently wrong. Rule: only use covariates measured before assignment (or
            provably unaffected by it).
          </p>
        </div>
      }
    />
  )
}
