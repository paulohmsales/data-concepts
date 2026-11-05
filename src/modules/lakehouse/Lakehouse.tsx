import * as Plot from '@observablehq/plot'
import { useCallback, useMemo, useState } from 'react'
import { Choice, ResetButton } from '../../components/Controls.tsx'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import PlotFigure from '../../components/PlotFigure.tsx'
import Slider from '../../components/Slider.tsx'
import { Stat, StatRow } from '../../components/Stat.tsx'
import type { VizTheme } from '../../components/vizTheme.ts'
import { simulateLake, type LakeParams, type LakePoint } from '../../core/lakehouse.ts'
import { int } from '../../format.ts'
import styles from '../common.module.css'

const DEFAULTS: LakeParams = { appendsPerHour: 1, compaction: 'none', writeMode: 'cow', updatesPerDay: 0, updatePattern: 'clustered', retentionDays: 7 }
const dayTicks = Array.from({ length: 8 }, (_, d) => d * 24)

function queryChart(s: LakePoint[], width: number, t: VizTheme): Plot.PlotOptions {
  return {
    width,
    height: 200,
    x: { label: 'day →', ticks: dayTicks, tickFormat: (h: number) => `${h / 24}` },
    y: { label: '↑ full-scan time (s)', grid: true },
    marks: [
      Plot.areaY(s, { x: 'h', y: 'querySec', fill: t.series1, fillOpacity: 0.15, curve: 'step' }),
      Plot.lineY(s, { x: 'h', y: 'querySec', stroke: t.series1, strokeWidth: 2, curve: 'step' }),
      Plot.tip(s, Plot.pointerX({ x: 'h', y: 'querySec', title: (d) => `day ${(d.h / 24).toFixed(1)}\n${d.querySec.toFixed(0)} s scan\n${int(d.files)} data files${d.deleteFiles ? `\n${int(d.deleteFiles)} delete files` : ''}` })),
    ],
  }
}

function storageChart(s: LakePoint[], width: number, t: VizTheme): Plot.PlotOptions {
  const data = s.flatMap((d) => [
    { h: d.h, kind: 'current table', gb: d.liveGb },
    { h: d.h, kind: 'old versions kept for time travel', gb: d.storageGb - d.liveGb },
  ])
  return {
    width,
    height: 200,
    x: { label: 'day →', ticks: dayTicks, tickFormat: (h: number) => `${h / 24}` },
    y: { label: '↑ storage (GB)', grid: true },
    color: { domain: ['current table', 'old versions kept for time travel'], range: [t.series1, t.series2], legend: true },
    marks: [
      Plot.areaY(data, Plot.stackY({ x: 'h', y: 'gb', fill: 'kind', order: ['current table', 'old versions kept for time travel'], curve: 'step' })),
      Plot.tip(data, Plot.pointerX(Plot.stackY({ x: 'h', y: 'gb', fill: 'kind', order: ['current table', 'old versions kept for time travel'], format: { y: ',.0f' } }))),
    ],
  }
}

export default function Lakehouse() {
  const [c, setC] = useState(DEFAULTS)
  const set = <K extends keyof LakeParams>(k: K) => (v: LakeParams[K]) => setC((s) => ({ ...s, [k]: v }))
  const r = useMemo(() => simulateLake(c), [c])
  const end = r.series[r.series.length - 1]
  const q = useCallback((w: number, t: VizTheme) => queryChart(r.series, w, t), [r])
  const st = useCallback((w: number, t: VizTheme) => storageChart(r.series, w, t), [r])

  const panel = (
    <>
      <Slider label="Commits per hour" value={c.appendsPerHour} onChange={set('appendsPerHour')} min={1} max={60} step={1} format={(v) => (v === 1 ? 'hourly' : v === 60 ? 'every min' : `${v}/h`)} hint="1 GB of new data arrives every hour" />
      <Choice
        label="Compaction"
        value={c.compaction}
        onChange={set('compaction')}
        options={[
          { value: 'none', label: 'never' },
          { value: 'daily', label: 'daily' },
          { value: 'hourly', label: 'hourly' },
        ]}
      />
      <Slider label="Update batches per day" value={c.updatesPerDay} onChange={set('updatesPerDay')} min={0} max={24} step={1} format={(v) => (v === 0 ? 'none' : String(v))} hint="each changes 1% of the rows it touches" />
      {c.updatesPerDay > 0 && (
        <>
          <Choice
            label="Updated rows are"
            value={c.updatePattern}
            onChange={set('updatePattern')}
            options={[
              { value: 'clustered', label: 'recent (clustered)' },
              { value: 'scattered', label: 'everywhere (scattered)' },
            ]}
          />
          <Choice
            label="Write mode"
            value={c.writeMode}
            onChange={set('writeMode')}
            options={[
              { value: 'cow', label: 'copy-on-write' },
              { value: 'mor', label: 'merge-on-read' },
            ]}
          />
        </>
      )}
      <Slider label="Keep old versions" value={c.retentionDays} onChange={set('retentionDays')} min={0} max={7} step={1} format={(v) => `${v} d`} hint="VACUUM / expire_snapshots retention" />
      <ResetButton onClick={() => setC(DEFAULTS)} />
    </>
  )

  return (
    <ModuleLayout
      controls={panel}
      onPreset={(p) => setC({ ...DEFAULTS, ...(p as Partial<LakeParams>) })}
      play={
        <>
          <StatRow>
            <Stat label="Files after a week" value={int(end.files)} note={end.deleteFiles ? `+ ${int(end.deleteFiles)} delete files` : `${int(r.commits)} commits`} />
            <Stat label="Full scan now" value={`${end.querySec.toFixed(0)} s`} note={`${int(Math.round(end.liveGb))} GB of data`} />
            <Stat label="Write amplification" value={`${r.writeAmplification.toFixed(1)}×`} note="bytes written ÷ bytes changed" />
            <Stat label="Storage" value={`${int(Math.round(end.storageGb))} GB`} note={`${(end.storageGb / end.liveGb).toFixed(1)}× the table`} />
          </StatRow>
          <div className={styles.grid2}>
            <div>
              <PlotFigure build={q} label="How long a full scan takes over the week" />
            </div>
            <div>
              <PlotFigure build={st} label="Storage: the current table plus old versions not yet vacuumed" />
            </div>
          </div>
        </>
      }
    />
  )
}
