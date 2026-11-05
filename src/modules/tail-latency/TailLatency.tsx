import * as Plot from '@observablehq/plot'
import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import { ResetButton, SeedControl } from '../../components/Controls.tsx'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import PlotFigure from '../../components/PlotFigure.tsx'
import Slider from '../../components/Slider.tsx'
import { Stat, StatRow } from '../../components/Stat.tsx'
import type { VizTheme } from '../../components/vizTheme.ts'
import { mulberry32 } from '../../core/random.ts'
import { pAnySlow, simulateRequests } from '../../core/swe/tail.ts'
import { int, pct } from '../../format.ts'
import styles from '../common.module.css'

interface Controls {
  fanout: number
  slowShare: number
  slowMs: number
  hedgeAfter: number
  seed: number
}

const DEFAULTS: Controls = { fanout: 1, slowShare: 0.01, slowMs: 500, hedgeAfter: 0, seed: 1 }
const FAST = 10
const ms = (x: number) => `${Math.round(x)} ms`

export default function TailLatency() {
  const [c, setC] = useState(DEFAULTS)
  const deferred = useDeferredValue(c)
  const stale = deferred !== c
  const set = <K extends keyof Controls>(k: K) => (v: Controls[K]) => setC((s) => ({ ...s, [k]: v }))
  const hedge = deferred.hedgeAfter > 0 ? deferred.hedgeAfter : Infinity
  const params = useMemo(() => ({ fanout: deferred.fanout, slowShare: deferred.slowShare, fastMs: FAST, slowMs: deferred.slowMs, hedgeAfter: hedge }), [deferred.fanout, deferred.slowShare, deferred.slowMs, hedge])
  const n = Math.max(500, Math.round(200_000 / deferred.fanout))
  const sim = useMemo(() => simulateRequests(params, n, mulberry32(deferred.seed)), [params, n, deferred.seed])
  const single = useMemo(() => simulateRequests({ ...params, fanout: 1 }, 20_000, mulberry32(deferred.seed + 1)), [params, deferred.seed])

  const buildHist = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const data = [...single.latencies.map((v) => ({ v, who: 'one backend call' })), ...sim.latencies.slice(0, 20_000).map((v) => ({ v, who: `request (fan-out ${deferred.fanout})` }))]
      return {
        width,
        height: 240,
        x: { type: 'log', label: 'latency (ms, log) →', tickFormat: '~g' },
        y: { label: '↑ share of requests', grid: true, tickFormat: '.0%' },
        color: { domain: ['one backend call', `request (fan-out ${deferred.fanout})`], range: [t.series1, t.series2], legend: true },
        marks: [
          Plot.lineY(data, Plot.binX<Plot.LineYOptions>({ y: 'proportion-facet' }, { x: 'v', stroke: 'who', z: 'who', thresholds: 60, curve: 'step', strokeWidth: 2 })),
          Plot.ruleX([sim.p99], { stroke: t.series2, strokeDasharray: '4 3' }),
          Plot.text([sim.p99], { x: (d: number) => d, frameAnchor: 'top', dx: 4, textAnchor: 'start', text: () => 'request p99', fill: t.series2 }),
        ],
      }
    },
    [sim, single, deferred.fanout],
  )

  const buildCurve = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const ns = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]
      const shares = [0.001, 0.01, deferred.slowShare].filter((v, i, a) => a.indexOf(v) === i)
      const data = shares.flatMap((q) => ns.map((k) => ({ k, p: pAnySlow(q, k), name: `${pct(q, 1)} of calls slow` })))
      return {
        width,
        height: 220,
        x: { type: 'log', label: 'backends per request (log) →' },
        y: { domain: [0, 1], tickFormat: '.0%', label: '↑ requests hit by at least one slow call', grid: true },
        color: { legend: true, range: [t.neutral, t.series1, t.series2] },
        marks: [
          Plot.axisX(ns, { tickFormat: (d: number) => String(d) }),
          Plot.ruleX([deferred.fanout], { stroke: t.inkSecondary, strokeDasharray: '4 3' }),
          Plot.line(data, { x: 'k', y: 'p', stroke: 'name', strokeWidth: 2 }),
          Plot.dot(data, { x: 'k', y: 'p', fill: 'name', r: 3, tip: { format: { y: '.1%' } } }),
        ],
      }
    },
    [deferred.slowShare, deferred.fanout],
  )

  const panel = (
    <>
      <Slider label="Backends per request (fan-out)" value={c.fanout} onChange={set('fanout')} min={1} max={500} step={1} log format={int} />
      <Slider label="Calls hitting the slow path" value={c.slowShare} onChange={set('slowShare')} min={0.001} max={0.05} step={0.001} log format={(v) => pct(v, 1)} />
      <Slider label="Slow path latency" value={c.slowMs} onChange={set('slowMs')} min={50} max={2000} step={10} log format={ms} hint={`fast path: ${FAST} ms`} />
      <Slider label="Hedge after" value={c.hedgeAfter} onChange={set('hedgeAfter')} min={0} max={200} step={1} format={(v) => (v === 0 ? 'never' : ms(v))} hint="send a duplicate if no answer yet" />
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
            <Stat label="One call: p50 / p99" value={`${ms(single.p50)} / ${ms(single.p99)}`} />
            <Stat label="Request: p50 / p99" value={`${ms(sim.p50)} / ${ms(sim.p99)}`} note={`waits for all ${deferred.fanout} calls`} />
            <Stat label="Requests with a slow call" value={pct(pAnySlow(deferred.slowShare, deferred.fanout), 0)} note="1 − (1 − q)ⁿ" />
            <Stat label="Extra calls from hedging" value={pct(sim.extraLoad, 1)} />
          </StatRow>
          <PlotFigure build={buildHist} label="Latency distribution of one backend call and of the whole request" />
        </div>
      }
      breakIt={
        <div className={stale ? styles.stale : undefined}>
          <h3>Rare becomes common</h3>
          <PlotFigure build={buildCurve} label="Share of requests hitting at least one slow backend against fan-out" />
        </div>
      }
    />
  )
}
