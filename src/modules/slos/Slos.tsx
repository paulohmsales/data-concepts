import * as Plot from '@observablehq/plot'
import { useCallback, useMemo, useState } from 'react'
import { Choice, ResetButton, SeedControl, Toggle } from '../../components/Controls.tsx'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import PlotFigure from '../../components/PlotFigure.tsx'
import Slider from '../../components/Slider.tsx'
import { Stat, StatRow } from '../../components/Stat.tsx'
import type { VizTheme } from '../../components/vizTheme.ts'
import { mulberry32 } from '../../core/random.ts'
import { DAYS, expectedMissRate, hhmm, simulateSlo, type SloParams, type SloResult } from '../../core/slo.ts'
import styles from '../common.module.css'

const DEFAULTS: SloParams = { deadline: 7 * 60, target: 0.95, deploysPerWeek: 10, freeze: false, seed: 1 }
const TARGETS = ['0.9', '0.95', '0.99', '0.999'].map((v) => ({ value: v, label: `${(Number(v) * 100).toFixed(Number(v) === 0.999 ? 1 : 0)}%` }))
const CAUSE = { normal: 'normal run', upstream: 'upstream data late', deploy: 'broken by a deploy' } as const

function finishChart(r: SloResult, p: SloParams, width: number, t: VizTheme): Plot.PlotOptions {
  const data = r.days.map((d) => ({ ...d, label: CAUSE[d.cause], y: Math.min(d.finish, 12 * 60) }))
  return {
    width,
    height: 230,
    x: { label: 'day of the quarter →' },
    y: { label: '↑ data ready at', domain: [5 * 60, 12 * 60], ticks: [300, 360, 420, 480, 540, 600, 660, 720], tickFormat: hhmm, grid: true },
    color: { domain: Object.values(CAUSE), range: [t.neutral, t.series1, t.series2], legend: true },
    marks: [
      Plot.rectY(
        r.days.filter((d) => d.frozen),
        { x1: (d) => d.day - 0.5, x2: (d) => d.day + 0.5, y1: 5 * 60, y2: 12 * 60, fill: t.series3, fillOpacity: 0.1 },
      ),
      Plot.ruleY([p.deadline], { stroke: '#d03b3b', strokeDasharray: '4 3' }),
      Plot.text([p.deadline], { y: (d: number) => d, frameAnchor: 'left', dx: 4, dy: -8, textAnchor: 'start', text: () => `deadline ${hhmm(p.deadline)}`, fill: '#d03b3b' }),
      Plot.dot(data, { x: 'day', y: 'y', fill: 'label', r: (d) => (d.miss ? 5 : 3), stroke: (d) => (d.miss ? t.ink : 'none') }),
      Plot.tip(data, Plot.pointer({ x: 'day', y: 'y', title: (d) => `day ${d.day + 1}: ready ${hhmm(d.finish)}\n${d.label}${d.deploys ? `\n${d.deploys} deploy(s) the day before` : ''}${d.frozen ? '\nchange freeze' : ''}` })),
    ],
  }
}

function budgetChart(r: SloResult, width: number, t: VizTheme): Plot.PlotOptions {
  const data = [{ day: -1, left: r.budget }, ...r.days.map((d) => ({ day: d.day, left: d.budgetLeft }))]
  return {
    width,
    height: 180,
    x: { label: 'day →' },
    y: { label: '↑ budget left (missed days)', grid: true },
    marks: [
      Plot.ruleY([0], { stroke: t.ink }),
      Plot.areaY(data, { x: 'day', y: 'left', fill: t.series1, fillOpacity: 0.15, curve: 'step-after' }),
      Plot.lineY(data, { x: 'day', y: 'left', stroke: t.series1, strokeWidth: 2, curve: 'step-after' }),
      Plot.tip(data, Plot.pointerX({ x: 'day', y: 'left', format: { y: '.1f' } })),
    ],
  }
}

function promiseChart(p: SloParams, width: number, t: VizTheme): Plot.PlotOptions {
  const data = Array.from({ length: 64 }, (_, i) => 5 * 60 + 45 + i * 4).map((m) => ({ m, ok: 1 - expectedMissRate(m, p.deploysPerWeek) }))
  return {
    width,
    height: 180,
    x: { label: 'deadline you promise →', tickFormat: hhmm, ticks: [360, 420, 480, 540, 600] },
    y: { label: '↑ expected on-time days', domain: [0.5, 1], tickFormat: '.0%', grid: true },
    marks: [
      Plot.ruleY([p.target], { stroke: t.series2, strokeDasharray: '4 3' }),
      Plot.ruleX([p.deadline], { stroke: t.ink, strokeDasharray: '2 2' }),
      Plot.lineY(data, { x: 'm', y: 'ok', stroke: t.series1, strokeWidth: 2 }),
      Plot.tip(data, Plot.pointerX({ x: 'm', y: 'ok', title: (d) => `${hhmm(d.m)}: ${(d.ok * 100).toFixed(1)}% on time` })),
    ],
  }
}

export default function Slos() {
  const [c, setC] = useState(DEFAULTS)
  const set = <K extends keyof SloParams>(k: K) => (v: SloParams[K]) => setC((s) => ({ ...s, [k]: v }))
  const r = useMemo(() => simulateSlo(c, mulberry32(c.seed)), [c])
  const fin = useCallback((w: number, t: VizTheme) => finishChart(r, c, w, t), [r, c])
  const bud = useCallback((w: number, t: VizTheme) => budgetChart(r, w, t), [r])
  const pro = useCallback((w: number, t: VizTheme) => promiseChart(c, w, t), [c])
  const expected = 1 - expectedMissRate(c.deadline, c.deploysPerWeek)

  const panel = (
    <>
      <Slider label="Deadline (SLI: ready by)" value={c.deadline} onChange={set('deadline')} min={6 * 60 + 10} max={10 * 60} step={5} format={hhmm} hint="the pipeline usually finishes ~06:00" />
      <Choice label="SLO target (share of days on time)" value={String(c.target)} onChange={(v) => set('target')(Number(v))} options={TARGETS} />
      <Slider label="Deploys per week" value={c.deploysPerWeek} onChange={set('deploysPerWeek')} min={0} max={30} step={1} format={String} hint="each has a 3% chance of breaking the next run" />
      <Toggle label="Freeze deploys when the budget runs out" checked={c.freeze} onChange={set('freeze')} />
      <SeedControl seed={c.seed} onChange={set('seed')} />
      <ResetButton onClick={() => setC(DEFAULTS)} />
    </>
  )

  return (
    <ModuleLayout
      controls={panel}
      onPreset={(p) => setC({ ...DEFAULTS, ...(p as Partial<SloParams>) })}
      play={
        <>
          <StatRow>
            <Stat label="SLO" value={r.met ? '✓ met' : '✗ breached'} note={`${(r.achieved * 100).toFixed(1)}% on time vs ${(c.target * 100).toFixed(c.target === 0.999 ? 1 : 0)}% target`} />
            <Stat label="Error budget" value={`${r.budget.toFixed(r.budget < 1 ? 2 : 1)} days`} note={`${r.misses} missed of ${DAYS}`} />
            <Stat label="Expected on-time rate" value={`${(expected * 100).toFixed(1)}%`} note="for this deadline and deploy rate" />
            <Stat label="Deploys shipped" value={String(r.deploysShipped)} note={r.frozenDays ? `${r.frozenDays} days frozen` : 'no freeze'} />
          </StatRow>
          <PlotFigure build={fin} label="When the dashboard data was ready each day (big dots missed the deadline; green bands are freeze days)" />
          <div className={styles.grid2}>
            <div>
              <PlotFigure build={bud} label="Error budget remaining over the quarter" />
            </div>
            <div>
              <PlotFigure build={pro} label="The promise curve: on-time rate for each possible deadline (orange: your target)" />
            </div>
          </div>
        </>
      }
    />
  )
}
