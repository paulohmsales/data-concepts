import * as Plot from '@observablehq/plot'
import { useCallback, useMemo, useState } from 'react'
import { ResetButton, SeedControl } from '../../components/Controls.tsx'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import PlotFigure from '../../components/PlotFigure.tsx'
import Slider from '../../components/Slider.tsx'
import { Stat, StatRow } from '../../components/Stat.tsx'
import type { VizTheme } from '../../components/vizTheme.ts'
import { estimates, eventStudy, preTrend, simulateDid, START, type DidParams, type Week } from '../../core/did.ts'
import { mulberry32 } from '../../core/random.ts'

const DEFAULTS: DidParams = { effect: -8, levelGap: 15, extraTrend: 0, noise: 3, seed: 1 }
const signed = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`

function series(ws: Week[], width: number, t: VizTheme): Plot.PlotOptions {
  const pre = ws.filter((w) => w.week < START)
  const gap = pre.reduce((a, w) => a + w.treated - w.control, 0) / pre.length
  const data = ws.flatMap((w) => [
    { week: w.week, v: w.treated, g: 'treated cities' },
    { week: w.week, v: w.control, g: 'control cities' },
  ])
  const counterfactual = ws.filter((w) => w.week >= START - 1).map((w) => ({ week: w.week, v: w.control + gap }))
  return {
    width,
    height: 260,
    x: { label: 'week →' },
    y: { label: '↑ orders per city (thousands)', grid: true },
    color: { domain: ['treated cities', 'control cities'], range: [t.series2, t.series1], legend: true },
    marks: [
      Plot.rectY([0], { x1: START - 0.5, x2: ws.length - 0.5, y1: Math.min(...data.map((d) => d.v)) - 5, y2: Math.max(...data.map((d) => d.v)) + 5, fill: t.series2, fillOpacity: 0.05 }),
      Plot.text([0], { x: START, frameAnchor: 'bottom', dy: -4, dx: 4, textAnchor: 'start', text: () => 'new fee policy in treated cities →', fill: t.inkSecondary }),
      Plot.lineY(counterfactual, { x: 'week', y: 'v', stroke: t.series2, strokeDasharray: '4 3', strokeOpacity: 0.8 }),
      Plot.lineY(data, { x: 'week', y: 'v', stroke: 'g', strokeWidth: 2 }),
      Plot.tip(data, Plot.pointerX({ x: 'week', y: 'v', stroke: 'g', format: { y: '.1f' } })),
    ],
  }
}

function events(ws: Week[], width: number, t: VizTheme): Plot.PlotOptions {
  const data = eventStudy(ws)
  return {
    width,
    height: 200,
    x: { label: 'weeks relative to the policy →' },
    y: { label: '↑ treated − control, vs before', grid: true },
    marks: [
      Plot.ruleY([0], { stroke: t.ink }),
      Plot.ruleX([-0.5], { stroke: t.axis, strokeDasharray: '4 3' }),
      Plot.dot(data, { x: 'rel', y: 'gap', fill: (d) => (d.rel < 0 ? t.neutral : t.series2), r: 3.5 }),
      Plot.tip(data, Plot.pointer({ x: 'rel', y: 'gap', format: { y: '.1f' } })),
    ],
  }
}

export default function Did() {
  const [c, setC] = useState(DEFAULTS)
  const set = <K extends keyof DidParams>(k: K) => (v: DidParams[K]) => setC((s) => ({ ...s, [k]: v }))
  const ws = useMemo(() => simulateDid(c, mulberry32(c.seed)), [c])
  const e = estimates(ws)
  const pt = preTrend(ws)
  const s = useCallback((w: number, t: VizTheme) => series(ws, w, t), [ws])
  const ev = useCallback((w: number, t: VizTheme) => events(ws, w, t), [ws])
  const verdict = (v: number) => (Math.abs(v - c.effect) < 3 ? '✓ close to the truth' : Math.sign(v) !== Math.sign(c.effect) && c.effect !== 0 ? '✗ wrong sign' : '✗ biased')

  const panel = (
    <>
      <Slider label="True effect of the policy" value={c.effect} onChange={set('effect')} min={-20} max={20} step={1} format={signed} hint="orders per city per week (thousands)" />
      <Slider label="Treated cities start higher by" value={c.levelGap} onChange={set('levelGap')} min={-30} max={30} step={1} format={signed} />
      <Slider label="Extra trend in treated cities" value={c.extraTrend} onChange={set('extraTrend')} min={-1} max={1} step={0.05} format={(v) => `${signed(v)}/wk`} hint="0 = parallel trends" />
      <Slider label="Noise" value={c.noise} onChange={set('noise')} min={0} max={10} step={0.5} format={(v) => v.toFixed(1)} />
      <SeedControl seed={c.seed} onChange={set('seed')} />
      <ResetButton onClick={() => setC(DEFAULTS)} />
    </>
  )

  return (
    <ModuleLayout
      controls={panel}
      onPreset={(p) => setC({ ...DEFAULTS, ...(p as Partial<DidParams>) })}
      play={
        <>
          <StatRow>
            <Stat label="Truth" value={signed(c.effect)} note="what the policy really did" />
            <Stat label="Before vs after" value={signed(e.beforeAfter)} note={verdict(e.beforeAfter)} />
            <Stat label="Treated vs control, after" value={signed(e.postGap)} note={verdict(e.postGap)} />
            <Stat label="Difference-in-differences" value={signed(e.did)} note={verdict(e.did)} />
          </StatRow>
          <PlotFigure build={s} label="Weekly orders in treated and control cities; dashed: the treated cities' path had the gap stayed constant" />
          <PlotFigure build={ev} label={`Event study: pre-period points should hover around 0 (measured pre-trend ${signed(pt)}/week)`} />
        </>
      }
    />
  )
}
