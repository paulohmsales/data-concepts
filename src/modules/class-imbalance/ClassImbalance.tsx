import * as Plot from '@observablehq/plot'
import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import { ResetButton, SeedControl } from '../../components/Controls.tsx'
import DataTable from '../../components/DataTable.tsx'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import PlotFigure from '../../components/PlotFigure.tsx'
import Slider from '../../components/Slider.tsx'
import { Stat, StatRow } from '../../components/Stat.tsx'
import Status from '../../components/Status.tsx'
import type { VizTheme } from '../../components/vizTheme.ts'
import { calibration, correctForWeight, fitLogistic, metrics, simulate } from '../../core/ml/imbalance.ts'
import { mulberry32 } from '../../core/random.ts'
import { normalPdf } from '../../core/stats.ts'
import { pct } from '../../format.ts'
import styles from '../common.module.css'

interface Controls {
  prevalence: number
  separation: number
  threshold: number
  seed: number
}

const DEFAULTS: Controls = { prevalence: 0.02, separation: 2, threshold: 0.15, seed: 1 }
const N = 20_000
const PLAIN = 'plain model'
const WEIGHTED = 'class-weighted model'
const CORRECTED = 'weighted, then corrected'
const TRUE = 'true probability'

function simulateAll(c: Controls) {
  const data = simulate(N, c.prevalence, c.separation, mulberry32(c.seed))
  const w = (1 - c.prevalence) / c.prevalence
  const plain = fitLogistic(data)
  const weighted = fitLogistic(data, w)
  const corrected = (x: number) => correctForWeight(weighted.prob(x), w)
  return { data, w, plain, weighted, corrected }
}

export default function ClassImbalance() {
  const [c, setC] = useState(DEFAULTS)
  const deferred = useDeferredValue(c)
  const simKey = useMemo(() => ({ prevalence: deferred.prevalence, separation: deferred.separation, seed: deferred.seed }), [deferred.prevalence, deferred.separation, deferred.seed])
  const sim = useMemo(() => simulateAll({ ...simKey, threshold: 0 }), [simKey])
  const stale = deferred !== c
  const set = <K extends keyof Controls>(k: K) => (v: Controls[K]) => setC((s) => ({ ...s, [k]: v }))
  const { data, plain, weighted, corrected } = sim

  const rows = [
    { name: 'Always say “no”', m: metrics(data, () => false) },
    { name: 'Plain model, threshold 0.5', m: metrics(data, (x) => plain.prob(x) >= 0.5) },
    { name: `Plain model, threshold ${c.threshold.toFixed(2)}`, m: metrics(data, (x) => plain.prob(x) >= c.threshold) },
    { name: 'Class-weighted model, threshold 0.5', m: metrics(data, (x) => weighted.prob(x) >= 0.5) },
  ]
  const meanP = (f: (x: number) => number) => data.reduce((s, d) => s + f(d.x), 0) / data.length

  const buildHist = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => ({
      width,
      height: 220,
      x: { label: 'feature value →' },
      y: { type: 'log', label: '↑ cases (log)', grid: true, tickFormat: '~s' },
      color: { domain: ['negative', 'positive'], range: [t.series1, t.series2], legend: true },
      marks: [
        Plot.lineY(data.map((d) => ({ x: d.x, kind: d.y ? 'positive' : 'negative' })), Plot.binX<Plot.LineYOptions>({ y: 'count', filter: (bin: unknown[]) => bin.length > 0 }, { x: 'x', stroke: 'kind', z: 'kind', thresholds: 50, curve: 'step', strokeWidth: 2, tip: true })),
      ],
    }),
    [data],
  )

  const buildProb = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const { prevalence: p, separation: sep } = simKey
      const truthP = (x: number) => {
        const a = p * normalPdf(x, sep)
        return a / (a + (1 - p) * normalPdf(x))
      }
      const xs = Array.from({ length: 121 }, (_, i) => -3 + ((sep + 6) * i) / 120)
      const lines = xs.flatMap((x) => [
        { x, kind: TRUE, p: truthP(x) },
        { x, kind: PLAIN, p: plain.prob(x) },
        { x, kind: WEIGHTED, p: weighted.prob(x) },
      ])
      return {
        width,
        height: 240,
        x: { label: 'feature value →' },
        y: { domain: [0, 1], label: '↑ predicted probability of positive', tickFormat: '.0%', grid: true },
        color: { domain: [TRUE, PLAIN, WEIGHTED], range: [t.ink, t.series1, t.series2], legend: true },
        marks: [
          Plot.ruleY([c.threshold], { stroke: t.inkSecondary, strokeDasharray: '4 3' }),
          Plot.line(lines.filter((d) => d.kind === TRUE), { x: 'x', y: 'p', stroke: 'kind', strokeWidth: 1.5, strokeDasharray: '5 4' }),
          Plot.line(lines.filter((d) => d.kind !== TRUE), { x: 'x', y: 'p', stroke: 'kind', z: 'kind', strokeWidth: 2.5 }),
        ],
      }
    },
    [plain, weighted, c.threshold, simKey],
  )

  const buildCal = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const pts = [
        ...calibration(data, plain.prob).map((b) => ({ ...b, kind: PLAIN })),
        ...calibration(data, weighted.prob).map((b) => ({ ...b, kind: WEIGHTED })),
        ...calibration(data, corrected).map((b) => ({ ...b, kind: CORRECTED })),
      ]
      return {
        width: Math.min(width, 440),
        height: Math.min(width, 440) * 0.85,
        x: { domain: [0, 1], label: 'model says (binned) →', tickFormat: '.0%' },
        y: { domain: [0, 1], label: '↑ actually positive', tickFormat: '.0%', grid: true },
        color: { domain: [PLAIN, WEIGHTED, CORRECTED], range: [t.series1, t.series2, t.series3], legend: true },
        marks: [
          Plot.line([[0, 0], [1, 1]], { stroke: t.axis, strokeDasharray: '4 3' }),
          Plot.line(pts, { x: 'predicted', y: 'observed', stroke: 'kind', z: 'kind', strokeWidth: 2 }),
          Plot.dot(pts, { x: 'predicted', y: 'observed', fill: 'kind', r: 4, tip: { format: { x: '.1%', y: '.1%' }, channels: { cases: 'n' } } }),
        ],
      }
    },
    [data, plain, weighted, corrected],
  )

  const panel = (
    <>
      <Slider label="Share of positives" value={c.prevalence} onChange={set('prevalence')} min={0.005} max={0.3} step={0.005} log format={(v) => pct(v, 1)} />
      <Slider label="How separable the classes are" value={c.separation} onChange={set('separation')} min={0.5} max={4} step={0.1} format={(v) => v.toFixed(1)} />
      <Slider label="Threshold for the plain model" value={c.threshold} onChange={set('threshold')} min={0.01} max={0.9} step={0.01} format={(v) => v.toFixed(2)} />
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
          <PlotFigure build={buildHist} label="Feature distribution per class, log scale" />
          <DataTable
            rows={rows}
            rowKey={(r) => r.name}
            columns={[
              { key: 'n', label: 'Strategy', render: (r) => r.name },
              { key: 'a', label: 'Accuracy', align: 'right', render: (r) => pct(r.m.accuracy, 1) },
              { key: 'r', label: 'Recall', align: 'right', render: (r) => (r.m.recall === 0 ? <Status level="bad">0%</Status> : pct(r.m.recall, 0)) },
              { key: 'p', label: 'Precision', align: 'right', render: (r) => pct(r.m.precision, 0) },
              { key: 't', label: 'Positives caught', align: 'right', render: (r) => `${r.m.tp} of ${r.m.tp + r.m.fn}` },
            ]}
          />
          <PlotFigure build={buildProb} label="Predicted probability by feature value for each model" />
        </div>
      }
      breakIt={
        <div className={stale ? styles.stale : undefined}>
          <h3>Rebalancing breaks the probabilities</h3>
          <p className="lede">
            Bin cases by predicted probability and check how many really are positive. A calibrated model sits on the
            diagonal.
          </p>
          <PlotFigure build={buildCal} label="Calibration: predicted versus observed positive rate" />
          <StatRow>
            <Stat label="Actual positive rate" value={pct(deferred.prevalence, 1)} />
            <Stat label="Plain model’s average prediction" value={pct(meanP(plain.prob), 1)} note={<Status level="good">matches</Status>} />
            <Stat label="Weighted model’s average prediction" value={pct(meanP(weighted.prob), 1)} note={<Status level="bad">inflated</Status>} />
            <Stat label="After the correction" value={pct(meanP(corrected), 1)} note="p / (p + (1 − p)·w)" />
          </StatRow>
          <p>
            Class weights of w = {sim.w.toFixed(0)} multiply the model’s odds by w. Anything downstream that treats the output as a
            probability (expected losses, “send the offer if P(churn) &gt; 30%”, capacity planning) is now off by
            that factor. Either undo it with the correction, or skip rebalancing and choose the threshold.
          </p>
        </div>
      }
    />
  )
}
