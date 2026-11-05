import * as Plot from '@observablehq/plot'
import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import { Choice, ResetButton, SeedControl } from '../../components/Controls.tsx'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import PlotFigure from '../../components/PlotFigure.tsx'
import Slider from '../../components/Slider.tsx'
import { Stat, StatRow } from '../../components/Stat.tsx'
import type { VizTheme } from '../../components/vizTheme.ts'
import { biasVariance, fitPoly, mse, sampleData, truth } from '../../core/ml/poly.ts'
import { mulberry32 } from '../../core/random.ts'
import { int } from '../../format.ts'
import styles from '../common.module.css'

interface Controls {
  degree: number
  n: number
  noise: number
  lambda: string
  seed: number
}

const DEFAULTS: Controls = { degree: 3, n: 25, noise: 0.3, lambda: '0', seed: 1 }
const DEGREES = Array.from({ length: 13 }, (_, i) => i)
const XS = Array.from({ length: 181 }, (_, i) => -0.9 + i / 100)
const f3 = (x: number) => (x < 0.001 ? x.toExponential(1) : x.toFixed(3))

function simulate(c: Controls) {
  const lambda = Number(c.lambda)
  const rng = mulberry32(c.seed)
  const train = sampleData(c.n, c.noise, rng)
  const test = sampleData(2000, c.noise, mulberry32(c.seed + 1)).filter((d) => Math.abs(d.x) <= 0.9)
  const model = fitPoly(train, c.degree, lambda)
  const refits = Array.from({ length: 20 }, () => fitPoly(sampleData(c.n, c.noise, rng), c.degree, lambda))
  const curve = DEGREES.map((d) => {
    const bv = biasVariance(d, c.n, c.noise, 60, mulberry32(c.seed + 100 + d), lambda)
    const m = fitPoly(train, d, lambda)
    return { degree: d, train: mse(m, train), test: mse(m, test), bias2: bv.bias2, variance: bv.variance, noise2: bv.noise2 }
  })
  return { train, test, model, refits, curve }
}

export default function BiasVariance() {
  const [c, setC] = useState(DEFAULTS)
  const deferred = useDeferredValue(c)
  const sim = useMemo(() => simulate(deferred), [deferred])
  const stale = deferred !== c
  const set = <K extends keyof Controls>(k: K) => (v: Controls[K]) => setC((s) => ({ ...s, [k]: v }))
  const here = sim.curve[deferred.degree]

  const buildFit = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const line = (m: { predict: (x: number) => number }) => XS.map((x) => ({ x, y: m.predict(x) }))
      return {
        width,
        height: 320,
        x: { domain: [-1, 1], label: 'x →' },
        y: { domain: [-2, 2], label: '↑ y', grid: true, clamp: true },
        color: { domain: ['true function', 'your fit', 'fits on 20 other samples'], range: [t.ink, t.series1, t.neutral], legend: true },
        marks: [
          ...sim.refits.map((m) => Plot.line(line(m), { x: 'x', y: 'y', stroke: () => 'fits on 20 other samples', strokeWidth: 1, clip: true })),
          Plot.line(XS.map((x) => ({ x, y: truth(x) })), { x: 'x', y: 'y', stroke: () => 'true function', strokeDasharray: '5 4', strokeWidth: 1.5 }),
          Plot.line(line(sim.model), { x: 'x', y: 'y', stroke: () => 'your fit', strokeWidth: 2.5, clip: true }),
          Plot.dot(sim.train, { x: 'x', y: 'y', fill: t.series2, r: 3.5, stroke: t.surface, strokeWidth: 1 }),
        ],
      }
    },
    [sim.refits, sim.model, sim.train],
  )

  const buildErrors = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const data = sim.curve.flatMap((d) => [
        { degree: d.degree, kind: 'training error', v: Math.max(1e-4, d.train) },
        { degree: d.degree, kind: 'test error (new data)', v: Math.max(1e-4, d.test) },
      ])
      return {
        width,
        height: 240,
        x: { label: 'polynomial degree (complexity) →', ticks: DEGREES },
        y: { type: 'log', label: '↑ mean squared error (log)', grid: true, tickFormat: '~g', domain: [Math.max(1e-4, Math.min(...data.map((d) => d.v))), Math.min(100, Math.max(...data.map((d) => d.v)))], clamp: true },
        color: { domain: ['training error', 'test error (new data)'], range: [t.series1, t.series2], legend: true },
        marks: [
          Plot.ruleX([deferred.degree], { stroke: t.inkSecondary, strokeDasharray: '4 3' }),
          Plot.ruleY([deferred.noise ** 2], { stroke: t.ink, strokeDasharray: '2 3' }),
          Plot.text([deferred.noise ** 2], { y: (d: number) => d, frameAnchor: 'left', dy: 10, dx: 4, textAnchor: 'start', text: () => 'noise floor σ²', fill: t.inkSecondary }),
          Plot.line(data, { x: 'degree', y: 'v', stroke: 'kind', strokeWidth: 2 }),
          Plot.dot(data, { x: 'degree', y: 'v', fill: 'kind', r: 3.5, tip: { format: { y: '.4f' } } }),
        ],
      }
    },
    [sim.curve, deferred.degree, deferred.noise],
  )

  const buildDecomp = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const data = sim.curve.flatMap((d) => [
        { degree: d.degree, kind: 'bias²', v: Math.max(1e-5, d.bias2) },
        { degree: d.degree, kind: 'variance', v: Math.max(1e-5, d.variance) },
      ])
      return {
        width,
        height: 220,
        x: { label: 'polynomial degree →', ticks: DEGREES },
        y: { type: 'log', label: '↑ error component (log)', grid: true, tickFormat: '~g', domain: [1e-5, 100], clamp: true },
        color: { domain: ['bias²', 'variance'], range: [t.series3, t.series2], legend: true },
        marks: [
          Plot.ruleX([deferred.degree], { stroke: t.inkSecondary, strokeDasharray: '4 3' }),
          Plot.line(data, { x: 'degree', y: 'v', stroke: 'kind', strokeWidth: 2 }),
          Plot.dot(data, { x: 'degree', y: 'v', fill: 'kind', r: 3.5, tip: { format: { y: '.4f' } } }),
        ],
      }
    },
    [sim.curve, deferred.degree],
  )


  const panel = (
    <>
      <Slider label="Polynomial degree" value={c.degree} onChange={set('degree')} min={0} max={12} step={1} format={String} />
      <Slider label="Training points" value={c.n} onChange={set('n')} min={8} max={300} step={1} log format={int} />
      <Slider label="Noise σ" value={c.noise} onChange={set('noise')} min={0.05} max={1} step={0.05} format={(v) => v.toFixed(2)} />
      <Choice
        label="Ridge penalty λ"
        value={c.lambda}
        onChange={set('lambda')}
        options={[
          { value: '0', label: 'none' },
          { value: '0.01', label: '0.01' },
          { value: '0.1', label: '0.1' },
          { value: '1', label: '1' },
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
          <PlotFigure build={buildFit} label="Training data, true function, fitted polynomial and refits" />
          <StatRow>
            <Stat label="Training error" value={f3(here.train)} />
            <Stat label="Test error" value={f3(here.test)} note={`noise floor ${f3(deferred.noise ** 2)}`} />
            <Stat label="Bias²" value={f3(here.bias2)} note="the average fit vs the truth" />
            <Stat label="Variance" value={f3(here.variance)} note="how much fits disagree" />
          </StatRow>
          <PlotFigure build={buildErrors} label="Training and test error by polynomial degree" />
        </div>
      }
      breakIt={
        <div className={stale ? styles.stale : undefined}>
          <PlotFigure build={buildDecomp} label="Bias squared and variance by degree" />
          <ul>
            <li>
              <b>Memorising:</b> with as many parameters as points, the curve passes through every training point:
              training error ≈ 0, test error huge. A model judged on its training data always looks great.
            </li>
            <li>
              <b>More data</b> shrinks variance (each fit sees more of the truth), so the complex model becomes
              fine. <b>Ridge</b> penalises large coefficients, taming variance without new data, at the price
              of a little bias.
            </li>
            <li>
              <b>Underfitting</b> doesn’t improve with data: 300 points can’t make a straight line curve.
              Only more flexibility fixes bias.
            </li>
          </ul>
        </div>
      }
    />
  )
}
