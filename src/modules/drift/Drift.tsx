import * as Plot from '@observablehq/plot'
import { useCallback, useMemo, useState } from 'react'
import { ResetButton, SeedControl } from '../../components/Controls.tsx'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import PlotFigure from '../../components/PlotFigure.tsx'
import Slider from '../../components/Slider.tsx'
import { Stat, StatRow } from '../../components/Stat.tsx'
import type { VizTheme } from '../../components/vizTheme.ts'
import { simulateDrift, WEEKS, type DriftParams, type DriftWeek } from '../../core/ml/drift.ts'
import { mulberry32 } from '../../core/random.ts'

const DEFAULTS: DriftParams = { covariateShift: 0, conceptDrift: 0, labelDelay: 4, retrainEvery: 0, seed: 1 }

function psiChart(ws: DriftWeek[], width: number, t: VizTheme): Plot.PlotOptions {
  return {
    width,
    height: 170,
    x: { label: 'week →', domain: [0, WEEKS - 1] },
    y: { label: '↑ PSI of feature x1', grid: true, domain: [0, Math.max(0.5, ...ws.map((w) => w.psi))] },
    marks: [
      Plot.ruleY([0.1], { stroke: t.muted, strokeDasharray: '3 3' }),
      Plot.ruleY([0.25], { stroke: '#d03b3b', strokeDasharray: '4 3' }),
      Plot.text([0.25], { y: (d: number) => d, frameAnchor: 'left', dx: 4, dy: -7, textAnchor: 'start', text: () => 'alert: PSI > 0.25', fill: '#d03b3b', fontSize: 10 }),
      Plot.lineY(ws, { x: 'week', y: 'psi', stroke: t.series2, strokeWidth: 2 }),
      Plot.dot(ws, { x: 'week', y: 'psi', fill: t.series2, r: 2.5 }),
      Plot.tip(ws, Plot.pointerX({ x: 'week', y: 'psi', format: { y: '.2f' } })),
    ],
  }
}

function aucChart(ws: DriftWeek[], delay: number, width: number, t: VizTheme): Plot.PlotOptions {
  const known = ws.filter((w) => w.week <= WEEKS - 1 - delay)
  const unknown = ws.filter((w) => w.week >= WEEKS - 1 - delay)
  return {
    width,
    height: 200,
    x: { label: 'week →', domain: [0, WEEKS - 1] },
    y: { label: '↑ model AUC', grid: true, domain: [0.4, 0.95] },
    marks: [
      Plot.ruleY([0.5], { stroke: t.ink, strokeOpacity: 0.4 }),
      Plot.rectY(delay > 0 ? [0] : [], { x1: WEEKS - 1 - delay, x2: WEEKS - 1, y1: 0.4, y2: 0.95, fill: t.neutral, fillOpacity: 0.15 }),
      Plot.text(delay > 0 ? [0] : [], { x: WEEKS - 1 - delay / 2, y: 0.92, text: () => 'labels not in yet', fill: t.inkSecondary, fontSize: 10 }),
      Plot.ruleX(
        ws.filter((w) => w.retrained),
        { x: 'week', stroke: t.series3, strokeOpacity: 0.6 },
      ),
      Plot.lineY(unknown, { x: 'week', y: 'auc', stroke: t.series1, strokeDasharray: '3 3', strokeOpacity: 0.6 }),
      Plot.lineY(known, { x: 'week', y: 'auc', stroke: t.series1, strokeWidth: 2 }),
      Plot.dot(known, { x: 'week', y: 'auc', fill: t.series1, r: 2.5 }),
      Plot.tip(ws, Plot.pointerX({ x: 'week', y: 'auc', title: (w) => `week ${w.week}: AUC ${w.auc.toFixed(3)}\nmodel weights x1 ${w.w1.toFixed(2)}, x2 ${w.w2.toFixed(2)}${w.retrained ? '\nretrained this week' : ''}` })),
    ],
  }
}

export default function Drift() {
  const [c, setC] = useState(DEFAULTS)
  const set = <K extends keyof DriftParams>(k: K) => (v: DriftParams[K]) => setC((s) => ({ ...s, [k]: v }))
  const ws = useMemo(() => simulateDrift(c, mulberry32(c.seed)), [c])
  const last = ws.at(-1)!
  const lastKnown = ws[WEEKS - 1 - c.labelDelay]
  const p = useCallback((w: number, t: VizTheme) => psiChart(ws, w, t), [ws])
  const a = useCallback((w: number, t: VizTheme) => aucChart(ws, c.labelDelay, w, t), [ws, c.labelDelay])

  const panel = (
    <>
      <Slider label="Covariate drift" value={c.covariateShift} onChange={set('covariateShift')} min={0} max={2} step={0.1} format={(v) => `${v.toFixed(1)} SD`} hint="how far the inputs (x1) move by week 26" />
      <Slider label="Concept drift" value={c.conceptDrift} onChange={set('conceptDrift')} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} hint="how much the outcome stops depending on x1 and starts depending on x2" />
      <Slider label="Label delay" value={c.labelDelay} onChange={set('labelDelay')} min={0} max={10} step={1} format={(v) => `${v} weeks`} hint="e.g. churn is only known weeks later" />
      <Slider label="Retrain every" value={c.retrainEvery} onChange={set('retrainEvery')} min={0} max={8} step={1} format={(v) => (v === 0 ? 'never' : `${v} weeks`)} hint="on the latest 4 weeks of labelled data" />
      <SeedControl seed={c.seed} onChange={set('seed')} />
      <ResetButton onClick={() => setC(DEFAULTS)} />
    </>
  )

  return (
    <ModuleLayout
      controls={panel}
      onPreset={(pp) => setC({ ...DEFAULTS, ...(pp as Partial<DriftParams>) })}
      play={
        <>
          <StatRow>
            <Stat label="Input drift (PSI) now" value={last.psi.toFixed(2)} note={last.psi > 0.25 ? '✗ alert fires' : last.psi > 0.1 ? 'worth watching' : 'stable'} />
            <Stat label="True AUC now" value={last.auc.toFixed(3)} note={`was ${ws[0].auc.toFixed(3)} at launch`} />
            <Stat label="AUC you can see" value={lastKnown.auc.toFixed(3)} note={c.labelDelay ? `week ${lastKnown.week}: labels lag ${c.labelDelay} weeks` : 'labels are instant'} />
            <Stat label="Calibration gap now" value={`${last.calibrationGap > 0 ? '+' : ''}${(last.calibrationGap * 100).toFixed(1)} pts`} note="predicted minus actual positive rate" />
          </StatRow>
          <PlotFigure build={p} label="Input monitoring: has the distribution of x1 moved since training?" />
          <PlotFigure build={a} label="Performance monitoring: model AUC (dashed: weeks whose labels haven't arrived; green lines: retrains)" />
        </>
      }
    />
  )
}
