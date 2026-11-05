import * as Plot from '@observablehq/plot'
import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import { ResetButton, SeedControl } from '../../components/Controls.tsx'
import DataTable from '../../components/DataTable.tsx'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import PlotFigure from '../../components/PlotFigure.tsx'
import Slider from '../../components/Slider.tsx'
import { Stat, StatRow } from '../../components/Stat.tsx'
import type { VizTheme } from '../../components/vizTheme.ts'
import { auc, cheapestThreshold, confusion, curve, simulateScores } from '../../core/ml/roc.ts'
import { mulberry32 } from '../../core/random.ts'
import { int, pct } from '../../format.ts'
import styles from '../common.module.css'

interface Controls {
  separation: number
  prevalence: number
  threshold: number
  costFP: number
  costFN: number
  seed: number
}

const DEFAULTS: Controls = { separation: 1.5, prevalence: 0.2, threshold: 1, costFP: 1, costFN: 5, seed: 1 }
const N = 5000
const POS = 'positive (e.g. fraud)'
const NEG = 'negative'

export default function Roc() {
  const [c, setC] = useState(DEFAULTS)
  const deferred = useDeferredValue(c)
  const stale = deferred !== c
  const set = <K extends keyof Controls>(k: K) => (v: Controls[K]) => setC((s) => ({ ...s, [k]: v }))
  const data = useMemo(() => simulateScores(N, deferred.prevalence, deferred.separation, mulberry32(deferred.seed)), [deferred.prevalence, deferred.separation, deferred.seed])
  const points = useMemo(() => curve(data), [data])
  const area = auc(points)
  const cm = confusion(data, c.threshold)
  const cheapest = cheapestThreshold(points, c.costFP, c.costFN)
  const bestAcc = points.reduce((a, b) => (b.accuracy > a.accuracy ? b : a))
  const cost = (p: { fp: number; fn: number }) => c.costFP * p.fp + c.costFN * p.fn
  // the same model on a population where positives are 10× rarer
  const rare = useMemo(() => simulateScores(N * 4, deferred.prevalence / 10, deferred.separation, mulberry32(deferred.seed + 1)), [deferred.prevalence, deferred.separation, deferred.seed])
  const cmRare = confusion(rare, c.threshold)

  const buildHist = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => ({
      width,
      height: 220,
      x: { label: 'model score →', domain: [-4, 4 + deferred.separation] },
      y: { label: '↑ cases', grid: true },
      color: { domain: [NEG, POS], range: [t.series1, t.series2], legend: true },
      marks: [
        Plot.lineY(data.map((d) => ({ score: d.score, kind: d.label ? POS : NEG })), Plot.binX<Plot.LineYOptions>({ y: 'count' }, { x: 'score', stroke: 'kind', z: 'kind', thresholds: 60, curve: 'step', strokeWidth: 2, tip: true })),
        Plot.ruleX([c.threshold], { stroke: t.ink, strokeWidth: 2 }),
        Plot.text([c.threshold], { x: (d: number) => d, frameAnchor: 'top', dx: 6, textAnchor: 'start', text: () => 'flag everything to the right →', fill: t.ink }),
        Plot.ruleY([0], { stroke: t.axis }),
      ],
    }),
    [data, c.threshold, deferred.separation],
  )

  const buildRoc = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => ({
      width: Math.min(width, 380),
      height: Math.min(width, 380) * 0.9,
      x: { domain: [0, 1], label: 'false positive rate →', tickFormat: '.0%' },
      y: { domain: [0, 1], label: '↑ true positive rate (recall)', tickFormat: '.0%', grid: true },
      marks: [
        Plot.line([[0, 0], [1, 1]], { stroke: t.axis, strokeDasharray: '4 3' }),
        Plot.line(points.filter((_, i) => i % 5 === 0 || i === points.length - 1), { x: 'fpr', y: 'tpr', stroke: t.series1, strokeWidth: 2 }),
        Plot.dot([cm], { x: 'fpr', y: 'tpr', fill: t.series2, r: 6, stroke: t.surface, strokeWidth: 2 }),
        Plot.dot([cheapest], { x: 'fpr', y: 'tpr', symbol: 'star', r: 7, fill: t.ink }),
      ],
    }),
    [points, cm, cheapest],
  )

  const buildPr = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => ({
      width: Math.min(width, 380),
      height: Math.min(width, 380) * 0.9,
      x: { domain: [0, 1], label: 'recall →', tickFormat: '.0%' },
      y: { domain: [0, 1], label: '↑ precision', tickFormat: '.0%', grid: true },
      marks: [
        Plot.ruleY([deferred.prevalence], { stroke: t.axis, strokeDasharray: '4 3' }),
        Plot.line(points.slice(10).filter((_, i) => i % 5 === 0), { x: 'tpr', y: 'precision', stroke: t.series1, strokeWidth: 2 }),
        Plot.dot([cm], { x: 'tpr', y: 'precision', fill: t.series2, r: 6, stroke: t.surface, strokeWidth: 2 }),
      ],
    }),
    [points, cm, deferred.prevalence],
  )

  const panel = (
    <>
      <Slider label="How well the model separates" value={c.separation} onChange={set('separation')} min={0} max={4} step={0.1} format={(v) => v.toFixed(1)} hint="distance between the two score humps" />
      <Slider label="Share of positives" value={c.prevalence} onChange={set('prevalence')} min={0.005} max={0.5} step={0.005} log format={(v) => pct(v, 1)} />
      <Slider label="Threshold" value={c.threshold} onChange={set('threshold')} min={-3} max={5} step={0.05} format={(v) => v.toFixed(2)} />
      <strong>Costs (Break it)</strong>
      <Slider label="Cost of a false alarm" value={c.costFP} onChange={set('costFP')} min={1} max={20} step={1} format={(v) => `$${v}`} />
      <Slider label="Cost of a missed positive" value={c.costFN} onChange={set('costFN')} min={1} max={100} step={1} format={(v) => `$${v}`} />
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
          <PlotFigure build={buildHist} label="Score distributions for positives and negatives with the threshold" />
          <StatRow>
            <Stat label="Recall (TPR)" value={pct(cm.tpr, 0)} note="positives caught" />
            <Stat label="False positive rate" value={pct(cm.fpr, 1)} note="negatives flagged" />
            <Stat label="Precision" value={pct(cm.precision, 0)} note="flags that are real" />
            <Stat label="AUC" value={area.toFixed(3)} note="threshold-free" />
          </StatRow>
          <div className={styles.grid2}>
            <div>
              <h4>ROC curve</h4>
              <PlotFigure build={buildRoc} label="ROC curve with the current threshold" />
            </div>
            <div>
              <h4>Precision–recall curve</h4>
              <PlotFigure build={buildPr} label="Precision-recall curve with the current threshold" />
            </div>
          </div>
          <DataTable
            caption={`Confusion matrix at threshold ${c.threshold.toFixed(2)} (${int(N)} cases)`}
            rows={[
              { actual: 'actually positive', flagged: cm.tp, passed: cm.fn },
              { actual: 'actually negative', flagged: cm.fp, passed: cm.tn },
            ]}
            rowKey={(r) => r.actual}
            columns={[
              { key: 'a', label: '', render: (r) => r.actual },
              { key: 'f', label: 'flagged', align: 'right', render: (r) => int(r.flagged) },
              { key: 'p', label: 'let through', align: 'right', render: (r) => int(r.passed) },
            ]}
          />
        </div>
      }
      breakIt={
        <div className={stale ? styles.stale : undefined}>
          <h3>Same model, rarer positives</h3>
          <p className="lede">
            Deploy the same model where positives are 10× rarer ({pct(deferred.prevalence / 10, 2)}). The ROC
            curve doesn’t change, but precision does.
          </p>
          <StatRow>
            <Stat label="Recall here → there" value={`${pct(cm.tpr, 0)} → ${pct(cmRare.tpr, 0)}`} note="unchanged" />
            <Stat label="False positive rate" value={`${pct(cm.fpr, 1)} → ${pct(cmRare.fpr, 1)}`} note="unchanged" />
            <Stat label="Precision" value={`${pct(cm.precision, 0)} → ${pct(cmRare.precision, 0)}`} note="most flags are now false alarms" />
          </StatRow>
          <p>
            False positives scale with the number of negatives, which is huge when positives are rare. A
            great-looking ROC curve can still mean “9 of 10 alerts are wrong”. For rare events, look at
            precision–recall, not just AUC.
          </p>
          <h3>Accuracy picks the wrong threshold</h3>
          <StatRow>
            <Stat label="Most accurate threshold" value={bestAcc.threshold.toFixed(2)} note={`accuracy ${pct(bestAcc.accuracy, 1)}, cost $${int(cost(bestAcc))}`} />
            <Stat label="Cheapest threshold (★)" value={cheapest.threshold.toFixed(2)} note={`accuracy ${pct(cheapest.accuracy, 1)}, cost $${int(cost(cheapest))}`} />
            <Stat label="Your threshold" value={c.threshold.toFixed(2)} note={`cost $${int(cost(cm))}`} />
          </StatRow>
          <p>
            Accuracy treats a missed fraud and a false alarm as equally bad. When a miss costs $
            {c.costFN} and a false alarm ${c.costFP}, the best threshold moves down: you accept more false alarms to
            catch more positives. Choose the threshold from costs, not from a default of 0.5.
          </p>
        </div>
      }
    />
  )
}
