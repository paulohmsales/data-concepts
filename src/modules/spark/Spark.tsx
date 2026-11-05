import * as Plot from '@observablehq/plot'
import { useCallback, useMemo, useState } from 'react'
import { ResetButton, Toggle } from '../../components/Controls.tsx'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import PlotFigure from '../../components/PlotFigure.tsx'
import Slider from '../../components/Slider.tsx'
import { Stat, StatRow } from '../../components/Stat.tsx'
import type { VizTheme } from '../../components/vizTheme.ts'
import { CORES, planJoin, type SparkParams, type SparkResult } from '../../core/spark.ts'
import { int } from '../../format.ts'
import styles from '../common.module.css'

const DEFAULTS: SparkParams = { factGb: 500, dimMb: 50, executors: 10, broadcastMb: 10, shufflePartitions: 200, skew: 0, aqe: false }
const dur = (s: number) => (!Number.isFinite(s) ? '—' : s < 120 ? `${s.toFixed(0)} s` : `${(s / 60).toFixed(1)} min`)

function taskChart(r: SparkResult, width: number, t: VizTheme): Plot.PlotOptions {
  const data = [...r.reduceTasks].sort((a, b) => b.seconds - a.seconds).map((x, i) => ({ ...x, i, kind: x.spilled ? 'spilled to disk' : 'in memory' }))
  return {
    width,
    height: 220,
    x: { label: 'reduce tasks, slowest first →', ticks: [] },
    y: { label: '↑ task duration (s)', grid: true, type: 'sqrt' },
    color: { domain: ['in memory', 'spilled to disk'], range: [t.series1, t.series2], legend: true },
    marks: [
      Plot.rectY(data, { x1: (d) => d.i, x2: (d) => d.i + 1, y: 'seconds', fill: 'kind' }),
      Plot.ruleY([0], { stroke: t.axis }),
      Plot.tip(data, Plot.pointerX({ x: (d) => d.i + 0.5, y: 'seconds', title: (d) => `${int(Math.round(d.mb))} MB · ${d.seconds.toFixed(1)} s${d.spilled ? ' · spilled' : ''}` })),
    ],
  }
}

function stageChart(r: SparkResult, width: number, t: VizTheme): Plot.PlotOptions {
  const data = [
    { stage: r.plan === 'broadcast' ? 'scan + broadcast join' : 'scan + shuffle write', x1: 0, x2: r.mapSeconds },
    ...(r.plan === 'sort-merge' ? [{ stage: 'shuffle read + sort-merge join', x1: r.mapSeconds, x2: r.totalSeconds }] : []),
  ]
  return {
    width,
    height: 90,
    marginLeft: 10,
    x: { label: 'seconds →', grid: true },
    y: { axis: null },
    color: { domain: ['scan + broadcast join', 'scan + shuffle write', 'shuffle read + sort-merge join'], range: [t.series3, t.series1, t.series2], legend: true },
    marks: [Plot.barX(data, { x1: 'x1', x2: 'x2', y: () => 'job', fill: 'stage', inset: 2 }), Plot.tip(data, Plot.pointerX({ x1: 'x1', x2: 'x2', y: () => 'job', title: (d) => `${d.stage}: ${dur(d.x2 - d.x1)}` }))],
  }
}

export default function Spark() {
  const [c, setC] = useState(DEFAULTS)
  const set = <K extends keyof SparkParams>(k: K) => (v: SparkParams[K]) => setC((s) => ({ ...s, [k]: v }))
  const r = useMemo(() => planJoin(c), [c])
  const tasks = useCallback((w: number, t: VizTheme) => taskChart(r, w, t), [r])
  const stages = useCallback((w: number, t: VizTheme) => stageChart(r, w, t), [r])
  const slowest = Math.max(0, ...r.reduceTasks.map((x) => x.seconds))

  const panel = (
    <>
      <Slider label="Dimension table" value={c.dimMb} onChange={set('dimMb')} min={1} max={5000} step={1} log format={(v) => (v < 1024 ? `${Math.round(v)} MB` : `${(v / 1024).toFixed(1)} GB`)} hint="fact table: 500 GB" />
      <Slider label="autoBroadcastJoinThreshold" value={c.broadcastMb} onChange={set('broadcastMb')} min={1} max={10000} step={1} log format={(v) => `${Math.round(v)} MB`} />
      <Slider label="spark.sql.shuffle.partitions" value={c.shufflePartitions} onChange={set('shufflePartitions')} min={50} max={4000} step={50} format={String} />
      <Slider label="Rows on one hot key" value={c.skew} onChange={set('skew')} min={0} max={0.4} step={0.01} format={(v) => `${Math.round(v * 100)}%`} />
      <Slider label="Executors" value={c.executors} onChange={set('executors')} min={2} max={50} step={1} format={(v) => `${v} × ${CORES} cores`} />
      <Toggle label="Adaptive query execution (skew join + coalesce)" checked={c.aqe} onChange={set('aqe')} />
      <ResetButton onClick={() => setC(DEFAULTS)} />
    </>
  )

  return (
    <ModuleLayout
      controls={panel}
      onPreset={(p) => setC({ ...DEFAULTS, ...(p as Partial<SparkParams>) })}
      play={
        <>
          <StatRow>
            <Stat label="Join plan" value={r.plan === 'oom' ? '✗ out of memory' : r.plan === 'broadcast' ? 'Broadcast hash join' : 'Sort-merge join'} note={r.plan === 'sort-merge' ? `shuffles ${int(Math.round(r.shuffleGb))} GB` : r.plan === 'broadcast' ? 'no shuffle' : 'the broadcast table does not fit'} />
            <Stat label="Job time" value={dur(r.totalSeconds)} note={`${r.slots} task slots`} />
            <Stat label="Slowest task" value={r.plan === 'sort-merge' ? dur(slowest) : '—'} note={r.spilledTasks ? `${int(r.spilledTasks)} of ${int(r.reduceTasks.length)} tasks spilled` : 'no spill'} />
          </StatRow>
          {r.plan !== 'oom' && <PlotFigure build={stages} label="Stages of the job" />}
          {r.plan === 'sort-merge' ? (
            <PlotFigure build={tasks} label="Every reduce task's duration; a lone tall bar is a straggler" />
          ) : (
            <p className={styles.card}>{r.plan === 'broadcast' ? 'Each executor received the whole dimension and joined its slice of the fact table locally. Nothing was shuffled, so there is no reduce stage to show.' : 'The driver collected the table to broadcast it and ran out of memory. Spark broadcasts are meant for tables of megabytes, not gigabytes.'}</p>
          )}
        </>
      }
    />
  )
}
