import * as Plot from '@observablehq/plot'
import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import { Choice, ResetButton, SeedControl } from '../../components/Controls.tsx'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import PlotFigure from '../../components/PlotFigure.tsx'
import Slider from '../../components/Slider.tsx'
import { Stat, StatRow } from '../../components/Stat.tsx'
import type { VizTheme } from '../../components/vizTheme.ts'
import { mulberry32 } from '../../core/random.ts'
import { mm1, simulateQueue } from '../../core/swe/queue.ts'
import { pct } from '../../format.ts'
import styles from '../common.module.css'

interface Controls {
  utilization: number
  servers: number
  service: 'exponential' | 'constant'
  capacity: number
  seed: number
}

const DEFAULTS: Controls = { utilization: 0.8, servers: 1, service: 'exponential', capacity: 0, seed: 1 }
const MU = 10 // each server handles 10 requests per second (100 ms each)
const UTILS = [0.1, 0.3, 0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 0.98]
const ms = (s: number) => (s >= 10 ? `${s.toFixed(1)} s` : `${Math.round(s * 1000)} ms`)

export default function Queues() {
  const [c, setC] = useState(DEFAULTS)
  const deferred = useDeferredValue(c)
  const stale = deferred !== c
  const set = <K extends keyof Controls>(k: K) => (v: Controls[K]) => setC((s) => ({ ...s, [k]: v }))
  const capacity = deferred.capacity > 0 ? deferred.capacity : Infinity
  const lambda = deferred.utilization * MU * deferred.servers
  const run = useMemo(
    () => simulateQueue({ lambda, mu: MU, servers: deferred.servers, service: deferred.service, capacity, n: 30_000 }, mulberry32(deferred.seed)),
    [lambda, deferred.servers, deferred.service, capacity, deferred.seed],
  )
  const sweep = useMemo(
    () =>
      UTILS.map((u) => {
        const s = simulateQueue({ lambda: u * MU * deferred.servers, mu: MU, servers: deferred.servers, service: deferred.service, capacity, n: 15_000 }, mulberry32(deferred.seed + 1))
        return { u, mean: s.meanTime, p95: s.p95Time, theory: deferred.servers === 1 && capacity === Infinity && deferred.service === 'exponential' ? mm1(u * MU, MU).W : NaN }
      }),
    [deferred.servers, deferred.service, capacity, deferred.seed],
  )

  const buildCurve = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const data = sweep.flatMap((d) => [
        { u: d.u, kind: 'mean time in system', v: d.mean },
        { u: d.u, kind: 'p95 time in system', v: d.p95 },
      ])
      return {
        width,
        height: 260,
        x: { domain: [0, 1], tickFormat: '.0%', label: 'utilisation (arrival rate ÷ capacity) →' },
        y: { type: 'log', label: '↑ seconds (log)', grid: true, tickFormat: '~g' },
        color: { domain: ['mean time in system', 'p95 time in system', 'M/M/1 theory'], range: [t.series1, t.series2, t.ink], legend: true },
        marks: [
          Plot.ruleX([deferred.utilization], { stroke: t.inkSecondary, strokeDasharray: '4 3' }),
          Plot.line(sweep.filter((d) => Number.isFinite(d.theory)), { x: 'u', y: 'theory', stroke: () => 'M/M/1 theory', strokeDasharray: '5 3' }),
          Plot.line(data, { x: 'u', y: 'v', stroke: 'kind', strokeWidth: 2 }),
          Plot.dot(data, { x: 'u', y: 'v', fill: 'kind', r: 3.5, tip: { format: { x: '.0%', y: '.3f' } } }),
        ],
      }
    },
    [sweep, deferred.utilization],
  )

  const buildSeries = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => ({
      width,
      height: 200,
      x: { label: 'seconds →' },
      y: { label: '↑ requests in the system', grid: true },
      marks: [Plot.areaY(run.samples, { x: 't', y: 'inSystem', fill: t.series1, fillOpacity: 0.25, curve: 'step' }), Plot.lineY(run.samples, { x: 't', y: 'inSystem', stroke: t.series1, curve: 'step' })],
    }),
    [run.samples],
  )

  const panel = (
    <>
      <Slider label="Utilisation" value={c.utilization} onChange={set('utilization')} min={0.1} max={0.99} step={0.01} format={(v) => pct(v, 0)} hint="arrivals ÷ what the servers can handle" />
      <Slider label="Servers sharing the queue" value={c.servers} onChange={set('servers')} min={1} max={8} step={1} format={String} />
      <Choice label="Service time" value={c.service} onChange={set('service')} options={[{ value: 'exponential', label: 'variable' }, { value: 'constant', label: 'always 100 ms' }]} />
      <Slider label="Queue limit (backpressure)" value={c.capacity} onChange={set('capacity')} min={0} max={100} step={1} format={(v) => (v === 0 ? 'unbounded' : String(v))} />
      <SeedControl seed={c.seed} onChange={set('seed')} />
      <ResetButton onClick={() => setC(DEFAULTS)} />
    </>
  )

  return (
    <ModuleLayout
      controls={panel}
      onPreset={(p) => setC({ ...DEFAULTS, ...(p as Partial<Controls>) })}
      play={
        <div className={stale ? styles.stale : undefined}>
          <StatRow>
            <Stat label="Mean time in system" value={ms(run.meanTime)} note="service alone: 100 ms" />
            <Stat label="p95" value={ms(run.p95Time)} />
            <Stat label="Little’s law" value={`${run.meanInSystem.toFixed(1)} ≈ ${(lambda * (1 - run.rejected) * run.meanTime).toFixed(1)}`} note="L (in system) = λ × W" />
            <Stat label="Rejected" value={pct(run.rejected, 1)} note={capacity === Infinity ? 'no limit' : `queue limit ${capacity}`} />
          </StatRow>
          <h3>The hockey stick</h3>
          <PlotFigure build={buildCurve} label="Mean and p95 time in system against utilisation" />
          <h3>Queue length over time</h3>
          <PlotFigure build={buildSeries} label="Requests in the system over time" />
        </div>
      }
    />
  )
}
