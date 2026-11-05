import * as Plot from '@observablehq/plot'
import { useCallback, useMemo, useState } from 'react'
import { Choice, ResetButton, Toggle } from '../../components/Controls.tsx'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import PlotFigure from '../../components/PlotFigure.tsx'
import Slider from '../../components/Slider.tsx'
import { Stat, StatRow } from '../../components/Stat.tsx'
import type { VizTheme } from '../../components/vizTheme.ts'
import { clock, schedule, SLA, TASKS, type SchedParams, type SchedResult } from '../../core/orchestration.ts'

const DEFAULTS: SchedParams = { backfillDays: 30, slots: 4, maxActiveRuns: 16, priority: 'fifo', dependsOnPast: false }
const hours = (m: number) => (m < 60 ? `${m} min` : `${(m / 60).toFixed(1)} h`)
const runLabel = (r: number) => (r === 0 ? 'today' : `D−${r}`)

function gantt(res: SchedResult, days: number, width: number, t: VizTheme): Plot.PlotOptions {
  const data = res.slots.map((s) => ({ ...s, label: runLabel(s.run) }))
  const order = Array.from({ length: days + 1 }, (_, i) => runLabel(i))
  const end = Math.max(SLA + 30, ...data.map((d) => d.end))
  const ticks = Array.from({ length: Math.floor(end / 60) + 1 }, (_, i) => i * 60)
  return {
    width,
    height: Math.max(160, 24 + order.length * 13),
    marginLeft: 48,
    x: { label: 'time →', domain: [0, end], ticks, tickFormat: (m: number) => clock(m) },
    y: { domain: order, label: null, tickSize: 0 },
    color: { domain: TASKS.map((x) => x.id), range: [t.neutral, t.series1, t.series3, t.series2, t.ink], legend: true },
    marks: [
      Plot.barX(data.filter((d) => d.run === 0).slice(0, 1), { x1: 0, x2: end, y: 'label', fill: t.series2, fillOpacity: 0.08 }),
      Plot.barX(data, { x1: 'start', x2: 'end', y: 'label', fill: 'task', inset: 1 }),
      Plot.ruleX([SLA], { stroke: '#d03b3b', strokeWidth: 1.5, strokeDasharray: '4 3' }),
      Plot.text([SLA], { x: (d: number) => d, frameAnchor: 'top', dx: 4, textAnchor: 'start', text: () => 'SLA 08:00', fill: '#d03b3b' }),
      Plot.tip(data, Plot.pointer({ x1: 'start', x2: 'end', y: 'label', title: (d) => `${d.label} · ${d.task}\n${clock(d.start)}–${clock(d.end)}` })),
    ],
  }
}

export default function Orchestration() {
  const [c, setC] = useState(DEFAULTS)
  const set = <K extends keyof SchedParams>(k: K) => (v: SchedParams[K]) => setC((s) => ({ ...s, [k]: v }))
  const res = useMemo(() => schedule(c), [c])
  const build = useCallback((w: number, t: VizTheme) => gantt(res, c.backfillDays, w, t), [res, c.backfillDays])

  const panel = (
    <>
      <Slider label="Backfill" value={c.backfillDays} onChange={set('backfillDays')} min={0} max={30} step={1} format={(v) => `${v} days`} />
      <Slider label="Worker slots" value={c.slots} onChange={set('slots')} min={1} max={12} step={1} format={String} />
      <Slider label="max_active_runs (backfill)" value={c.maxActiveRuns} onChange={set('maxActiveRuns')} min={1} max={30} step={1} format={String} />
      <Choice
        label="Priority"
        value={c.priority}
        onChange={set('priority')}
        options={[
          { value: 'fifo', label: 'first come, first served' },
          { value: 'today-first', label: 'today’s run first' },
        ]}
      />
      <Toggle label="depends_on_past" checked={c.dependsOnPast} onChange={set('dependsOnPast')} />
      <ResetButton onClick={() => setC(DEFAULTS)} />
    </>
  )

  return (
    <ModuleLayout
      controls={panel}
      onPreset={(p) => setC({ ...DEFAULTS, ...(p as Partial<SchedParams>) })}
      play={
        <>
          <StatRow>
            <Stat label="Today’s data ready at" value={clock(res.todayDone)} note={res.slaMet ? '✓ SLA met (08:00)' : `✗ SLA missed by ${hours(res.todayDone - SLA)}`} />
            <Stat label="Backfill takes" value={c.backfillDays ? hours(res.backfillDone) : '—'} note={`${c.backfillDays} days of history`} />
            <Stat label="Slot utilisation" value={`${Math.round(res.utilisation * 100)}%`} note={`${c.slots} workers`} />
          </StatRow>
          <PlotFigure build={build} label="Every task of every DAG run on the timeline; today’s run is the shaded top row" />
        </>
      }
    />
  )
}
