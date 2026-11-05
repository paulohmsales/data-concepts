import * as Plot from '@observablehq/plot'
import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import { Choice, ResetButton } from '../../components/Controls.tsx'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import PlotFigure from '../../components/PlotFigure.tsx'
import Slider from '../../components/Slider.tsx'
import { Stat, StatRow } from '../../components/Stat.tsx'
import type { VizTheme } from '../../components/vizTheme.ts'
import { mulberry32 } from '../../core/random.ts'
import { demandSeries, replicate, SLOTS_PER_DAY, type Replicated, type SwitchParams } from '../../core/switchback.ts'
import styles from '../common.module.css'

const DEFAULTS: SwitchParams = { capacity: 1.1, lift: 0.2, days: 14, blockSlots: 2, noise: 0.1 }
const BLOCKS = [
  { value: '1', label: '30 min' },
  { value: '2', label: '1 h' },
  { value: '8', label: '4 h' },
  { value: '48', label: '1 day' },
]
const p100 = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`

function estimates(r: Replicated, width: number, t: VizTheme): Plot.PlotOptions {
  const data = r.runs.flatMap((x, i) => [
    { design: 'user-level A/B', v: x.userAB, i },
    { design: 'switchback', v: x.switchback, i },
  ])
  return {
    width,
    height: 200,
    marginLeft: 110,
    x: { label: 'estimated effect on completed rides →', tickFormat: (v: number) => `${Math.round(v * 100)}%`, grid: true },
    y: { label: null, domain: ['user-level A/B', 'switchback'] },
    color: { domain: ['user-level A/B', 'switchback'], range: [t.series2, t.series1] },
    marks: [
      Plot.ruleX([r.truth], { stroke: t.ink, strokeWidth: 2 }),
      Plot.text([r.truth], { x: (d: number) => d, frameAnchor: 'top', dy: -2, text: () => `true market effect ${p100(r.truth)}`, fill: t.ink, fontSize: 11 }),
      Plot.tickX(data, { x: 'v', y: 'design', stroke: 'design', strokeOpacity: 0.25 }),
      Plot.dot(
        [
          { design: 'user-level A/B', v: r.userAB.mean },
          { design: 'switchback', v: r.switchback.mean },
        ],
        { x: 'v', y: 'design', fill: 'design', r: 6, stroke: t.surface, strokeWidth: 2 },
      ),
    ],
  }
}

function dayChart(p: SwitchParams, width: number, t: VizTheme): Plot.PlotOptions {
  const d = demandSeries({ ...p, days: 1, noise: 0 }, mulberry32(7))
  const rows = d.flatMap((v, s) => [
    { h: s / 2, v, who: 'demand without discount' },
    { h: s / 2, v: v * (1 + p.lift), who: 'demand with discount' },
  ])
  return {
    width,
    height: 200,
    x: { label: 'hour of day →', domain: [0, 24], ticks: [0, 6, 12, 18, 24] },
    y: { label: '↑ ride requests per slot', grid: true },
    color: { domain: ['demand without discount', 'demand with discount'], range: [t.series1, t.series2], legend: true },
    marks: [
      Plot.areaY(d.map((v, s) => ({ h: s / 2, lo: 100 * p.capacity, hi: Math.max(100 * p.capacity, v * (1 + p.lift)) })), { x: 'h', y1: 'lo', y2: 'hi', fill: '#d03b3b', fillOpacity: 0.12, curve: 'step' }),
      Plot.ruleY([100 * p.capacity], { stroke: t.ink, strokeDasharray: '4 3' }),
      Plot.text([100 * p.capacity], { y: (v: number) => v, frameAnchor: 'left', dx: 4, dy: -8, textAnchor: 'start', text: () => 'driver capacity', fill: t.inkSecondary }),
      Plot.lineY(rows, { x: 'h', y: 'v', stroke: 'who', strokeWidth: 2, curve: 'step' }),
    ],
  }
}

export default function Switchback() {
  const [c, setC] = useState(DEFAULTS)
  const set = <K extends keyof SwitchParams>(k: K) => (v: SwitchParams[K]) => setC((s) => ({ ...s, [k]: v }))
  const deferred = useDeferredValue(c)
  const r = useMemo(() => replicate(deferred, 300, mulberry32(1)), [deferred])
  const est = useCallback((w: number, t: VizTheme) => estimates(r, w, t), [r])
  const day = useCallback((w: number, t: VizTheme) => dayChart(deferred, w, t), [deferred])

  const panel = (
    <>
      <Slider label="Driver capacity" value={c.capacity} onChange={set('capacity')} min={0.6} max={3} step={0.05} format={(v) => `${v.toFixed(2)}× avg demand`} hint="below the peaks, riders compete for drivers" />
      <Slider label="Discount's effect on demand" value={c.lift} onChange={set('lift')} min={0} max={0.5} step={0.01} format={p100} />
      <Slider label="Experiment length" value={c.days} onChange={set('days')} min={3} max={42} step={1} format={(v) => `${v} days`} />
      <Choice label="Switchback block" value={String(c.blockSlots)} onChange={(v) => set('blockSlots')(Number(v))} options={BLOCKS} />
      <ResetButton onClick={() => setC(DEFAULTS)} />
    </>
  )

  return (
    <ModuleLayout
      controls={panel}
      onPreset={(p) => setC({ ...DEFAULTS, ...(p as Partial<SwitchParams>) })}
      play={
        <div className={deferred !== c ? styles.stale : undefined}>
          <StatRow>
            <Stat label="True effect (everyone discounted)" value={p100(r.truth)} note="more completed rides, market-wide" />
            <Stat label="User-level A/B says" value={p100(r.userAB.mean)} note={Math.abs(r.userAB.mean - r.truth) > 0.01 ? `✗ ${(r.userAB.mean / Math.max(r.truth, 1e-6)).toFixed(1)}× the truth` : '✓ no interference here'} />
            <Stat label="Switchback says" value={`${p100(r.switchback.mean)} ± ${(r.switchback.sd * 200).toFixed(1)}`} note="mean ± 2 SD over 300 simulated experiments" />
          </StatRow>
          <PlotFigure build={est} label="300 simulated experiments per design: each tick is one experiment's estimate" />
          <PlotFigure build={day} label={`One day: where discounted demand exceeds drivers (red), extra requests can't become rides (${SLOTS_PER_DAY} half-hour slots)`} />
        </div>
      }
    />
  )
}
