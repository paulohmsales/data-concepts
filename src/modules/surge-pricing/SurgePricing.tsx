import * as Plot from '@observablehq/plot'
import { useCallback, useMemo, useState } from 'react'
import { Choice, ResetButton, SeedControl } from '../../components/Controls.tsx'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import PlotFigure from '../../components/PlotFigure.tsx'
import Slider from '../../components/Slider.tsx'
import { Stat, StatRow } from '../../components/Stat.tsx'
import type { VizTheme } from '../../components/vizTheme.ts'
import { mulberry32 } from '../../core/random.ts'
import { demand, EVENT, GRID, MAX_MULT, MINUTES, surgeGrid, surgeStats } from '../../core/surge.ts'
import styles from '../common.module.css'

interface Controls {
  window: number
  cell: number
  minute: number
  seed: number
}
const DEFAULTS: Controls = { window: 1, cell: 1, minute: 70, seed: 1 }
const CELLS = [
  { value: '1', label: '250 m' },
  { value: '2', label: '500 m' },
  { value: '4', label: '1 km' },
]

function mapChart(grid: number[][], cell: number, eventCell: [number, number], width: number, t: VizTheme): Plot.PlotOptions {
  const data = grid.flatMap((row, y) => row.map((m, x) => ({ x: x * cell, y: y * cell, m })))
  const size = Math.min(width, 420)
  return {
    width: size,
    height: size,
    x: { axis: null, domain: [0, GRID] },
    y: { axis: null, domain: [GRID, 0] },
    color: { type: 'linear', domain: [1, MAX_MULT], range: [t.surface, t.series2], legend: true, label: 'surge multiplier' },
    marks: [
      Plot.rect(data, { x1: 'x', x2: (d) => d.x + cell, y1: 'y', y2: (d) => d.y + cell, fill: 'm', inset: 0.5 }),
      Plot.rect([0], { x1: eventCell[0] * cell, x2: (eventCell[0] + 1) * cell, y1: eventCell[1] * cell, y2: (eventCell[1] + 1) * cell, stroke: t.ink, strokeWidth: 2, fill: 'none' }),
      Plot.rect([0], { x1: EVENT.cells[0], x2: EVENT.cells[1] + 1, y1: EVENT.cells[0], y2: EVENT.cells[1] + 1, stroke: t.ink, strokeDasharray: '3 2', fill: 'none' }),
      Plot.frame({ stroke: t.axis }),
      Plot.tip(data, Plot.pointer({ x: (d) => d.x + cell / 2, y: (d) => d.y + cell / 2, title: (d) => `${d.m.toFixed(2)}×` })),
    ],
  }
}

function seriesChart(event: number[], calm: number[], minute: number, width: number, t: VizTheme): Plot.PlotOptions {
  const data = [...event.map((m, i) => ({ t: i, m, s: 'at the concert' })), ...calm.map((m, i) => ({ t: i, m, s: 'a quiet cell' }))]
  return {
    width,
    height: 220,
    x: { label: 'minute →' },
    y: { label: '↑ multiplier', domain: [1, MAX_MULT], grid: true },
    color: { domain: ['at the concert', 'a quiet cell'], range: [t.series2, t.series1], legend: true },
    marks: [
      Plot.rectY([0], { x1: EVENT.start, x2: EVENT.end, y1: 1, y2: MAX_MULT, fill: t.series2, fillOpacity: 0.08 }),
      Plot.text([0], { x: (EVENT.start + EVENT.end) / 2, y: MAX_MULT, dy: 10, text: () => 'crowd leaving', fill: t.inkSecondary }),
      Plot.ruleX([minute], { stroke: t.ink, strokeDasharray: '4 3' }),
      Plot.lineY(data, { x: 't', y: 'm', stroke: 's', strokeWidth: 2 }),
      Plot.tip(data, Plot.pointerX({ x: 't', y: 'm', stroke: 's', format: { y: (v: number) => `${v.toFixed(2)}×` } })),
    ],
  }
}

export default function SurgePricing() {
  const [c, setC] = useState(DEFAULTS)
  const set = <K extends keyof Controls>(k: K) => (v: Controls[K]) => setC((s) => ({ ...s, [k]: v }))
  const counts = useMemo(() => demand(mulberry32(c.seed)), [c.seed])
  const p = useMemo(() => ({ window: c.window, cell: c.cell }), [c.window, c.cell])
  const mult = useMemo(() => surgeGrid(counts, p), [counts, p])
  const st = useMemo(() => surgeStats(mult, p), [mult, p])
  const [ex, ey] = st.eventCell
  const calmCell = Math.floor(12 / c.cell)
  const event = useMemo(() => mult.map((g) => g[ey][ex]), [mult, ex, ey])
  const calm = useMemo(() => mult.map((g) => g[calmCell][calmCell]), [mult, calmCell])
  const map = useCallback((w: number, t: VizTheme) => mapChart(mult[c.minute], c.cell, st.eventCell, w, t), [mult, c.minute, c.cell, st.eventCell])
  const series = useCallback((w: number, t: VizTheme) => seriesChart(event, calm, c.minute, w, t), [event, calm, c.minute])

  const panel = (
    <>
      <Slider label="Window" value={c.window} onChange={set('window')} min={1} max={15} step={1} format={(v) => `${v} min`} />
      <Choice label="Pricing cell size" value={String(c.cell)} onChange={(v) => set('cell')(Number(v))} options={CELLS} hint="the grid is 4 km across" />
      <Slider label="Map shows minute" value={c.minute} onChange={set('minute')} min={0} max={MINUTES - 1} step={1} format={String} />
      <SeedControl seed={c.seed} onChange={set('seed')} />
      <ResetButton onClick={() => setC(DEFAULTS)} />
    </>
  )

  return (
    <ModuleLayout
      controls={panel}
      onPreset={(pp) => setC({ ...DEFAULTS, ...(pp as Partial<Controls>) })}
      play={
        <>
          <StatRow>
            <Stat label="Surge at the concert" value={`${st.eventMult.toFixed(2)}×`} note="average, minutes 65–80" />
            <Stat label="Reacts after" value={Number.isFinite(st.lag) ? `${st.lag} min` : 'never reaches 1.5×'} note="crowd starts leaving at 60" />
            <Stat label="Lingers for" value={`${st.linger} min`} note="after the crowd has gone" />
            <Stat label="False surges" value={`${(st.falseSurge * 100).toFixed(1)}%`} note="quiet cell-minutes ≥ 1.25×" />
          </StatRow>
          <div className={styles.grid2}>
            <div>
              <PlotFigure build={map} label={`Surge map at minute ${c.minute}; dashed square is the venue, solid is its pricing cell`} />
            </div>
            <div>
              <PlotFigure build={series} label="Surge over time at the venue and in a quiet cell" />
            </div>
          </div>
        </>
      }
    />
  )
}
