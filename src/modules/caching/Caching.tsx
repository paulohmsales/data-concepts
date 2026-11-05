import * as Plot from '@observablehq/plot'
import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import { ResetButton, SeedControl, Toggle } from '../../components/Controls.tsx'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import PlotFigure from '../../components/PlotFigure.tsx'
import Slider from '../../components/Slider.tsx'
import { Stat, StatRow } from '../../components/Stat.tsx'
import type { VizTheme } from '../../components/vizTheme.ts'
import { mulberry32 } from '../../core/random.ts'
import { dbLoad, idealHitRate, lruHitRate, staleShare, zipfCdf } from '../../core/swe/cache.ts'
import { int, pct } from '../../format.ts'
import styles from '../common.module.css'

interface Controls {
  skew: number
  cachePct: number
  ttl: number
  updatesPerHour: number
  jitter: number
  coalesce: boolean
  seed: number
}

const DEFAULTS: Controls = { skew: 1, cachePct: 0.01, ttl: 60, updatesPerHour: 6, jitter: 0, coalesce: false, seed: 1 }
const KEYS = 20_000
const SIZES = [0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1]

export default function Caching() {
  const [c, setC] = useState(DEFAULTS)
  const deferred = useDeferredValue(c)
  const stale = deferred !== c
  const set = <K extends keyof Controls>(k: K) => (v: Controls[K]) => setC((s) => ({ ...s, [k]: v }))
  const cdf = useMemo(() => zipfCdf(KEYS, deferred.skew), [deferred.skew])
  const capacity = Math.max(1, Math.round(KEYS * deferred.cachePct))
  const hit = useMemo(() => lruHitRate(cdf, capacity, 60_000, mulberry32(deferred.seed)), [cdf, capacity, deferred.seed])
  const curve = useMemo(
    () => SIZES.flatMap((f) => {
      const cap = Math.max(1, Math.round(KEYS * f))
      return [
        { f, kind: 'LRU cache', hit: lruHitRate(cdf, cap, 40_000, mulberry32(deferred.seed + 1)) },
        { f, kind: 'ideal (top keys pinned)', hit: idealHitRate(cdf, cap) },
      ]
    }),
    [cdf, deferred.seed],
  )
  const load = useMemo(
    () => dbLoad({ keys: 500, ratePerKey: 20, ttl: deferred.ttl, jitter: deferred.jitter, refill: 0.5, coalesce: deferred.coalesce, seconds: Math.max(240, deferred.ttl * 4) }, mulberry32(deferred.seed + 2)),
    [deferred.ttl, deferred.jitter, deferred.coalesce, deferred.seed],
  )
  const staleP = staleShare(deferred.updatesPerHour / 3600, deferred.ttl)

  const buildCurve = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => ({
      width,
      height: 240,
      x: { type: 'log', label: 'cache size as a share of all keys (log) →', tickFormat: '.1~%' },
      y: { domain: [0, 1], tickFormat: '.0%', label: '↑ requests served from cache', grid: true },
      color: { domain: ['LRU cache', 'ideal (top keys pinned)'], range: [t.series1, t.neutral], legend: true },
      marks: [
        Plot.ruleX([deferred.cachePct], { stroke: t.inkSecondary, strokeDasharray: '4 3' }),
        Plot.line(curve, { x: 'f', y: 'hit', stroke: 'kind', strokeWidth: 2 }),
        Plot.dot(curve, { x: 'f', y: 'hit', fill: 'kind', r: 3.5, tip: { format: { x: '.1%', y: '.1%' } } }),
      ],
    }),
    [curve, deferred.cachePct],
  )

  const buildLoad = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => ({
      width,
      height: 220,
      x: { label: 'seconds since the cache was warmed →' },
      y: { label: '↑ database queries per second', grid: true },
      marks: [Plot.rectY(load.map((v, i) => ({ t: i, v })), { x1: 't', x2: (d: { t: number }) => d.t + 1, y: 'v', fill: t.series2, tip: true }), Plot.ruleY([0], { stroke: t.axis })],
    }),
    [load],
  )

  const panel = (
    <>
      <Slider label="Popularity skew (Zipf s)" value={c.skew} onChange={set('skew')} min={0.5} max={1.5} step={0.05} format={(v) => v.toFixed(2)} hint="higher = a few keys get most traffic" />
      <Slider label="Cache size" value={c.cachePct} onChange={set('cachePct')} min={0.001} max={1} step={0.001} log format={(v) => `${pct(v, 1)} of keys`} />
      <strong>Expiry</strong>
      <Slider label="TTL" value={c.ttl} onChange={set('ttl')} min={5} max={3600} step={5} log format={(v) => `${v} s`} />
      <Slider label="Updates per key per hour" value={c.updatesPerHour} onChange={set('updatesPerHour')} min={0} max={120} step={1} format={String} />
      <Slider label="TTL jitter" value={c.jitter} onChange={set('jitter')} min={0} max={0.5} step={0.05} format={(v) => `±${pct(v, 0)}`} />
      <Toggle label="Coalesce concurrent misses" checked={c.coalesce} onChange={set('coalesce')} />
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
            <Stat label="Hit rate" value={pct(hit, 0)} note={`LRU with ${int(capacity)} of ${int(KEYS)} keys`} />
            <Stat label="Ideal for that size" value={pct(idealHitRate(cdf, capacity), 0)} note="most popular keys pinned" />
            <Stat label="Reads that are stale" value={pct(staleP, 1)} note={`TTL ${deferred.ttl} s, ${deferred.updatesPerHour} updates/h`} />
            <Stat label="Peak DB load" value={`${int(Math.max(...load))}/s`} note="500 hot keys, 20 req/s each" />
          </StatRow>
          <h3>Hit rate against cache size</h3>
          <PlotFigure build={buildCurve} label="Cache hit rate against cache size" />
        </div>
      }
      breakIt={
        <div className={stale ? styles.stale : undefined}>
          <h3>Expiry and the stampede</h3>
          <p className="lede">500 popular keys were cached at the same moment (after a deploy). Each time a key expires, every request that arrives while it is being recomputed goes to the database.</p>
          <PlotFigure build={buildLoad} label="Database queries per second over time" />
        </div>
      }
    />
  )
}
