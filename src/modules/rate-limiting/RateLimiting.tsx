import * as Plot from '@observablehq/plot'
import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import { Choice, ResetButton, SeedControl } from '../../components/Controls.tsx'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import PlotFigure from '../../components/PlotFigure.tsx'
import Slider from '../../components/Slider.tsx'
import { Stat, StatRow } from '../../components/Stat.tsx'
import type { VizTheme } from '../../components/vizTheme.ts'
import { mulberry32 } from '../../core/random.ts'
import { simulateRetries, type RetryParams, type Strategy } from '../../core/swe/ratelimit.ts'
import { int } from '../../format.ts'
import styles from '../common.module.css'

interface Controls {
  scenario: 'outage' | 'herd'
  strategy: Strategy
  baseDelay: number
  maxAttempts: number
  seed: number
}

const DEFAULTS: Controls = { scenario: 'outage', strategy: 'immediate', baseDelay: 0.2, maxAttempts: 12, seed: 1 }
const STRATS: { value: Strategy; label: string }[] = [
  { value: 'none', label: 'no retries' },
  { value: 'immediate', label: 'retry immediately' },
  { value: 'fixed', label: 'fixed delay' },
  { value: 'exponential', label: 'exponential backoff' },
  { value: 'jitter', label: 'backoff + jitter' },
]

function params(c: Controls): RetryParams {
  return c.scenario === 'outage'
    ? { rate: 800, capacity: 1000, burst: 200, outageStart: 5, outageEnd: 8, strategy: c.strategy, baseDelay: c.baseDelay, maxAttempts: c.maxAttempts, seconds: 30 }
    : { rate: 0, capacity: 200, burst: 50, outageStart: 0, outageEnd: 0, strategy: c.strategy, baseDelay: c.baseDelay, maxAttempts: c.maxAttempts, seconds: 60, initialBurst: 2000 }
}

function chart(sim: ReturnType<typeof simulateRetries>, p: RetryParams, width: number, t: VizTheme): Plot.PlotOptions {
  // aggregate 0.05 s ticks into 0.25 s buckets, expressed per second
  const buckets = Math.ceil(sim.ticks.length / 5)
  const data = Array.from({ length: buckets }, (_, i) => {
    const ticks = sim.ticks.slice(i * 5, i * 5 + 5)
    return {
      t: i / 4,
      attempts: ticks.reduce((a, x) => a + x.attempts, 0) * 4,
      accepted: ticks.reduce((a, x) => a + x.accepted, 0) * 4,
    }
  })
  const top = Math.max(p.capacity * 1.2, ...data.map((d) => d.attempts))
  return {
    width,
    height: 280,
    x: { label: 'seconds →' },
    y: { label: '↑ requests per second', grid: true, domain: [0, top * 1.05] },
    color: { domain: ['attempts (new + retries)', 'accepted'], range: [t.series2, t.series1], legend: true },
    marks: [
      ...(p.outageEnd > p.outageStart
        ? [Plot.rect([0], { x1: p.outageStart, x2: p.outageEnd, y1: 0, y2: top * 1.05, fill: '#d03b3b', fillOpacity: 0.08 })]
        : []),
      Plot.ruleY([p.capacity], { stroke: t.ink, strokeDasharray: '4 3' }),
      Plot.text([p.capacity], { y: (d: number) => d, frameAnchor: 'right', dy: -8, text: () => 'server capacity', fill: t.inkSecondary }),
      Plot.areaY(data, { x: 't', y: 'attempts', fill: () => 'attempts (new + retries)', fillOpacity: 0.25, curve: 'step' }),
      Plot.lineY(data, { x: 't', y: 'attempts', stroke: () => 'attempts (new + retries)', curve: 'step' }),
      Plot.lineY(data, { x: 't', y: 'accepted', stroke: () => 'accepted', strokeWidth: 2, curve: 'step' }),
      Plot.tip(data, Plot.pointerX({ x: 't', y: 'attempts', channels: { accepted: 'accepted' }, format: { y: ',.0f', accepted: ',.0f' } })),
    ],
  }
}

export default function RateLimiting() {
  const [c, setC] = useState(DEFAULTS)
  const deferred = useDeferredValue(c)
  const stale = deferred !== c
  const set = <K extends keyof Controls>(k: K) => (v: Controls[K]) => setC((s) => ({ ...s, [k]: v }))
  const p = useMemo(() => params(deferred), [deferred])
  const sim = useMemo(() => simulateRetries(p, mulberry32(deferred.seed)), [p, deferred.seed])
  const offered = deferred.scenario === 'outage' ? 800 * 30 : 2000
  const build = useCallback((width: number, t: VizTheme) => chart(sim, p, width, t), [sim, p])

  const panel = (
    <>
      <Choice
        label="Scenario"
        value={c.scenario}
        onChange={set('scenario')}
        options={[
          { value: 'outage', label: '3-second outage' },
          { value: 'herd', label: 'thundering herd' },
        ]}
        hint={c.scenario === 'outage' ? '800 req/s steady; server handles 1,000/s' : '2,000 clients connect at once; server handles 200/s'}
      />
      <Choice label="Retry strategy" value={c.strategy} onChange={set('strategy')} options={STRATS} />
      <Slider label="Base delay" value={c.baseDelay} onChange={set('baseDelay')} min={0.05} max={2} step={0.05} format={(v) => `${v.toFixed(2)} s`} />
      <Slider label="Max attempts" value={c.maxAttempts} onChange={set('maxAttempts')} min={1} max={50} step={1} format={String} />
      <SeedControl seed={c.seed} onChange={set('seed')} />
      <ResetButton onClick={() => setC(DEFAULTS)} />
    </>
  )

  return (
    <ModuleLayout
      controls={panel}
      onPreset={(pp) => setC({ ...DEFAULTS, ...(pp as Partial<Controls>) })}
      play={
        <div className={stale ? styles.stale : undefined}>
          <StatRow>
            {deferred.scenario === 'outage' ? (
              <Stat
                label="Back to normal after"
                value={Number.isFinite(sim.recovered) ? `${sim.recovered.toFixed(1)} s` : 'not within 30 s'}
                note="once the server is back up"
              />
            ) : (
              <Stat label="Last client served at" value={`${sim.lastAccepted.toFixed(1)} s`} note="2,000 clients at 200/s needs ≥ 10 s" />
            )}
            <Stat label="Requests given up" value={int(sim.dropped)} note={`of ${int(offered)}`} />
            <Stat label="Total attempts" value={int(sim.attemptsTotal)} note={`${(sim.attemptsTotal / offered).toFixed(2)} per request`} />
            <Stat label="Peak load" value={`${int(sim.peak)}/s`} note={`capacity ${int(p.capacity)}/s`} />
          </StatRow>
          <PlotFigure build={build} label="Attempted and accepted requests per second over time" />
        </div>
      }
    />
  )
}
