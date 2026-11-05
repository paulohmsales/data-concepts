import * as Plot from '@observablehq/plot'
import { useCallback, useState } from 'react'
import { Choice, ResetButton } from '../../components/Controls.tsx'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import PlotFigure from '../../components/PlotFigure.tsx'
import Slider from '../../components/Slider.tsx'
import { Stat, StatRow } from '../../components/Stat.tsx'
import type { VizTheme } from '../../components/vizTheme.ts'
import { costPerDay, DAG, FULL_MINUTES, report, SELECTOR_SYNTAX, type MatParams, type Materialization, type Selector } from '../../core/dbt.ts'
import Flow from '../../visuals/diagram/Flow.tsx'
import styles from '../common.module.css'

interface Controls extends MatParams {
  changed: string
  selector: Selector
}
const DEFAULTS: Controls = { changed: 'stg_customers', selector: 'only', sizeGb: 200, readsPerDay: 10, buildsPerDay: 1, dailyNew: 0.01, lookbackDays: 3 }

const CHANGED = ['stg_customers', 'int_order_payments', 'int_sessions', 'fct_orders'].map((v) => ({ value: v, label: v }))
const SELECTORS: { value: Selector; label: string }[] = [
  { value: 'only', label: 'model' },
  { value: 'up', label: '+model' },
  { value: 'down', label: 'model+' },
  { value: 'at', label: '@model' },
  { value: 'all', label: 'everything' },
]
const MATS: Materialization[] = ['view', 'table', 'incremental']
const usd = (v: number) => (v < 10 ? `$${v.toFixed(2)}` : `$${Math.round(v).toLocaleString('en-US')}`)

function costChart(p: MatParams, width: number, t: VizTheme): Plot.PlotOptions {
  const reads = Array.from({ length: 61 }, (_, i) => 10 ** (-1 + i / 15)) // 0.1 … 1000
  const data = MATS.flatMap((m) => reads.map((r) => ({ m, reads: r, cost: costPerDay(m, { ...p, readsPerDay: r }) })))
  return {
    width,
    height: 260,
    x: { type: 'log', label: 'queries per day →', tickFormat: (d: number) => (d < 1 ? String(d) : d.toLocaleString('en-US')) },
    y: { type: 'log', label: '↑ $ per day (log)', grid: true, tickFormat: (d: number) => usd(d) },
    color: { domain: MATS, range: [t.series2, t.series1, t.series3], legend: true },
    marks: [
      Plot.ruleX([p.readsPerDay], { stroke: t.ink, strokeDasharray: '4 3' }),
      Plot.lineY(data, { x: 'reads', y: 'cost', stroke: 'm', strokeWidth: 2 }),
      Plot.tip(data, Plot.pointer({ x: 'reads', y: 'cost', stroke: 'm', format: { y: (v: number) => usd(v), x: (v: number) => v.toFixed(1) } })),
    ],
  }
}

export default function Dbt() {
  const [c, setC] = useState(DEFAULTS)
  const set = <K extends keyof Controls>(k: K) => (v: Controls[K]) => setC((s) => ({ ...s, [k]: v }))
  const r = report(c.selector, c.changed)
  const nodes = DAG.filter((m) => !m.source).map((m) => ({
    id: m.id,
    label: m.id,
    col: m.col - 1,
    row: m.row,
    sub: m.id === c.changed ? 'you edited this' : r.untested.has(m.id) ? 'NOT tested' : r.built.has(m.id) ? `built · ${m.minutes} min` : undefined,
  }))
  const edges = DAG.flatMap((m) => m.deps.filter((d) => !d.startsWith('raw.')).map((d) => ({ from: d, to: m.id })))
  const p: MatParams = c
  const build = useCallback((w: number, t: VizTheme) => costChart(p, w, t), [p])
  const costs = MATS.map((m) => ({ m, v: costPerDay(m, c) }))
  const cheapest = costs.reduce((a, b) => (b.v < a.v ? b : a))

  const panel = (
    <>
      <p className="lede" style={{ margin: 0 }}>
        <strong>Materialisation</strong>
      </p>
      <Slider label="Model size" value={c.sizeGb} onChange={set('sizeGb')} min={1} max={2000} step={1} format={(v) => `${v} GB`} />
      <Slider label="Queries per day" value={c.readsPerDay} onChange={set('readsPerDay')} min={0.1} max={1000} step={0.1} format={(v) => (v < 10 ? v.toFixed(1) : String(Math.round(v)))} />
      <Slider label="Builds per day" value={c.buildsPerDay} onChange={set('buildsPerDay')} min={1} max={96} step={1} format={(v) => (v === 1 ? 'daily' : v === 24 ? 'hourly' : `${v}×`)} />
      <Slider label="Incremental lookback" value={c.lookbackDays} onChange={set('lookbackDays')} min={0} max={30} step={1} format={(v) => `${v} days`} />
      <ResetButton onClick={() => setC(DEFAULTS)} />
    </>
  )

  return (
    <ModuleLayout
      controls={panel}
      onPreset={(pp) => setC({ ...DEFAULTS, ...(pp as Partial<Controls>) })}
      play={
        <>
          <div className={styles.card}>
            <h4>1 · You changed a model. What should CI build?</h4>
            <Choice label="Edited model" value={c.changed} onChange={set('changed')} options={CHANGED} />
            <Choice label="Selector" value={c.selector} onChange={set('selector')} options={SELECTORS} />
            <pre className={styles.sql}>{SELECTOR_SYNTAX[c.selector](c.changed)}</pre>
            <StatRow>
              <Stat label="Models built" value={`${r.built.size}`} note={`${r.minutes} of ${FULL_MINUTES} build minutes`} />
              <Stat label="Affected but untested" value={String(r.untested.size)} note={r.untested.size ? 'a breaking change reaches production' : 'every dependant is checked'} />
              <Stat label="Built for nothing" value={String(r.wasted.size)} note="rebuilt although unaffected" />
            </StatRow>
            <Flow props={{ nodes, edges, compact: true }} state={{ active: [...r.built, ...r.untested], bad: [...r.untested] }} />
          </div>
          <div className={styles.card} style={{ marginTop: '1rem' }}>
            <h4>2 · View, table or incremental? (controls on the right)</h4>
            <StatRow>
              {costs.map(({ m, v }) => (
                <Stat key={m} label={m} value={`${usd(v)}/day`} note={m === cheapest.m ? 'cheapest here' : `${(v / cheapest.v).toFixed(1)}× the cheapest`} />
              ))}
            </StatRow>
            <PlotFigure build={build} label="Daily cost of each materialisation as query volume grows" />
          </div>
        </>
      }
    />
  )
}
