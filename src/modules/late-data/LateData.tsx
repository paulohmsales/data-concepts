import * as Plot from '@observablehq/plot'
import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import { ResetButton, SeedControl, Toggle } from '../../components/Controls.tsx'
import ExplainBack from '../../components/ExplainBack.tsx'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import PlotFigure from '../../components/PlotFigure.tsx'
import Slider from '../../components/Slider.tsx'
import { Stat, StatRow } from '../../components/Stat.tsx'
import type { VizTheme } from '../../components/vizTheme.ts'
import { mulberry32 } from '../../core/random.ts'
import { generateEvents, runStream, type StreamParams } from '../../core/streaming.ts'
import { int, pct } from '../../format.ts'
import styles from '../common.module.css'

interface Controls {
  meanDelay: number
  stragglers: number
  allowedLateness: number
  outage: boolean
  seed: number
}

const DEFAULTS: Controls = { meanDelay: 3, stragglers: 0.03, allowedLateness: 10, outage: false, seed: 1 }
const BASE = { rate: 10, duration: 600, window: 60 }
const SWEEP = [0, 1, 2, 5, 10, 20, 30, 60, 120, 300]
const ON_TIME = 'counted'
const LATE = 'dropped: arrived after its window closed ✗'

const params = (c: Controls): StreamParams => ({ ...BASE, meanDelay: c.meanDelay, stragglers: c.stragglers, allowedLateness: c.allowedLateness, outage: c.outage ? [200, 260] : undefined })

function simulate(c: Controls) {
  const p = params(c)
  const input = generateEvents(p, mulberry32(c.seed))
  const run = runStream(p, input)
  const sweep = SWEEP.map((allowedLateness) => {
    const r = runStream({ ...p, allowedLateness }, input)
    return { allowedLateness, dropRate: r.dropRate, latency: r.latency }
  })
  return { run, sweep }
}

type SweepPoint = { allowedLateness: number; dropRate: number; latency: number }

function sweepChart(metric: 'dropRate' | 'latency', sweep: SweepPoint[], lateness: number, width: number, t: VizTheme): Plot.PlotOptions {
  const color = metric === 'dropRate' ? '#d03b3b' : t.series1
  return {
    width,
    height: 200,
    x: { type: 'symlog', label: 'allowed lateness (s) →', ticks: SWEEP, tickFormat: 'd' },
    y: metric === 'dropRate' ? { label: '↑ events dropped', tickFormat: '.1%', grid: true } : { label: '↑ result delay after window end (s)', grid: true },
    marks: [
      Plot.ruleX([lateness], { stroke: t.inkSecondary, strokeDasharray: '4 3' }),
      Plot.line(sweep, { x: 'allowedLateness', y: metric, stroke: color, strokeWidth: 2 }),
      Plot.dot(sweep, { x: 'allowedLateness', y: metric, fill: color, r: 3.5, tip: { format: { y: metric === 'dropRate' ? '.2%' : '.1f' } } }),
    ],
  }
}

export default function LateData() {
  const [c, setC] = useState(DEFAULTS)
  const deferred = useDeferredValue(c)
  const sim = useMemo(() => simulate(deferred), [deferred])
  const stale = deferred !== c
  const set = <K extends keyof Controls>(k: K) => (v: Controls[K]) => setC((s) => ({ ...s, [k]: v }))
  const { run } = sim

  const buildScatter = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const pts = run.events.filter((_, i) => i % 3 === 0).map((e) => ({ ...e, kind: e.late ? LATE : ON_TIME }))
      const wm = run.watermarks.filter((_, i) => i % 5 === 0)
      return {
        width,
        height: 340,
        x: { label: 'processing time: when the event reached us (s) →', domain: [0, Math.min(900, Math.max(...pts.map((p) => p.arrival)))] },
        y: { label: '↑ event time: when it happened (s)', domain: [0, BASE.duration], grid: true },
        color: { domain: [ON_TIME, LATE], range: [t.series1, '#d03b3b'], legend: true },
        marks: [
          Plot.line([[0, 0], [BASE.duration, BASE.duration]], { stroke: t.inkSecondary, strokeDasharray: '2 3' }),
          Plot.dot(pts.filter((p) => !p.late), { x: 'arrival', y: 't', fill: 'kind', r: 1.6, fillOpacity: 0.6 }),
          Plot.dot(pts.filter((p) => p.late), { x: 'arrival', y: 't', fill: 'kind', r: 3, tip: { format: { x: '.1f', y: '.1f', fill: false } } }),
          Plot.line(wm, { x: 'at', y: 'watermark', stroke: t.series2, strokeWidth: 2, curve: 'step-after' }),
          Plot.text([wm[Math.floor(wm.length * 0.55)]], { x: 'at', y: 'watermark', text: () => 'watermark', dx: 12, dy: 12, textAnchor: 'start', fill: t.series2 }),
        ],
      }
    },
    [run],
  )

  const buildWindows = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const bars = run.windows.flatMap((w) => [
        { start: w.start, kind: ON_TIME, n: w.counted },
        { start: w.start, kind: LATE, n: w.dropped },
      ])
      return {
        width,
        height: 240,
        x: { label: 'one-minute window (by event time) →', tickFormat: (s: number) => `${s / 60}:00`, padding: 0.15 },
        y: { label: '↑ events', grid: true },
        color: { domain: [ON_TIME, LATE, 'processing-time window count'], range: [t.series1, '#d03b3b', t.ink], legend: true },
        marks: [
          Plot.barY(bars, { x: 'start', y: 'n', fill: 'kind', tip: true }),
          Plot.tickY(run.windows, { x: 'start', y: 'byArrival', stroke: () => 'processing-time window count', strokeWidth: 3 }),
          Plot.ruleY([0], { stroke: t.axis }),
        ],
      }
    },
    [run.windows],
  )

  const buildDrops = useCallback((w: number, t: VizTheme) => sweepChart('dropRate', sim.sweep, deferred.allowedLateness, w, t), [sim.sweep, deferred.allowedLateness])
  const buildLatency = useCallback((w: number, t: VizTheme) => sweepChart('latency', sim.sweep, deferred.allowedLateness, w, t), [sim.sweep, deferred.allowedLateness])

  const panel = (
    <>
      <Slider label="Typical delay" value={c.meanDelay} onChange={set('meanDelay')} min={0.5} max={30} step={0.5} format={(v) => `${v} s`} />
      <Slider label="Stragglers (offline devices)" value={c.stragglers} onChange={set('stragglers')} min={0} max={0.15} step={0.01} format={(v) => pct(v, 0)} hint="arrive ~20× later" />
      <Slider label="Allowed lateness" value={c.allowedLateness} onChange={set('allowedLateness')} min={0} max={300} step={1} format={(v) => `${v} s`} />
      <Toggle label="Network outage 3:20–4:20 (Break it)" checked={c.outage} onChange={set('outage')} />
      <SeedControl seed={c.seed} onChange={set('seed')} />
      <ResetButton onClick={() => setC(DEFAULTS)} />
    </>
  )

  return (
    <ModuleLayout
      title="Late data and watermarks"
      controls={panel}
      intuition={
        <>
          <p>
            Every event has two times: when it <b>happened</b> (event time: the tap on the phone) and when
            it <b>reached you</b> (processing time). Networks, retries and phones in airplane mode put a gap
            between them, and the gap varies. Events arrive out of order.
          </p>
          <p>
            You want counts per minute of <em>event</em> time. But when can you publish “12:01 had 600
            taps”? Something from 12:01 might still be on its way. A <b>watermark</b> is the pipeline’s
            running guess: “I’ve probably seen everything up to time W”. Here, W = latest event time seen −
            allowed lateness. When W passes a window’s end, the window is emitted, and stragglers for it
            are dropped (or sent to a correction path).
          </p>
          <p>
            Allowed lateness is a dial between <b>fast</b> and <b>complete</b>. There is no setting that
            gives you both.
          </p>
        </>
      }
      play={
        <div className={stale ? styles.stale : undefined}>
          <StatRow>
            <Stat label="Events" value={int(run.events.length)} note="10 per second for 10 minutes" />
            <Stat label="Dropped as too late" value={pct(run.dropRate, 2)} note={`${int(run.dropped)} events`} />
            <Stat label="Results delayed by" value={`${run.latency.toFixed(1)} s`} note="after each window ends" />
          </StatRow>
          <h3>Two clocks</h3>
          <p className="lede">
            Each dot is an event. On the dashed diagonal it would arrive the instant it happened; delay
            pushes it right. The orange step is the watermark. Red dots arrived after their window had
            already been emitted.
          </p>
          <PlotFigure build={buildScatter} label="Event time against processing time with the watermark" />
          <h3>Counts per minute</h3>
          <p className="lede">
            Bars: counts by event time, split into counted and dropped. Black ticks: what you’d get by
            bucketing on arrival time instead.
          </p>
          <PlotFigure build={buildWindows} label="Per-window counts: counted, dropped, and by arrival time" />
          <p className="try">
            Set allowed lateness to 0. The watermark hugs the newest event and every slightly delayed event is
            dropped. Raise stragglers to 10%: even 60 s of lateness can’t save them, because they’re minutes late.
          </p>
        </div>
      }
      breakIt={
        <div className={stale ? styles.stale : undefined}>
          <h3>Fast or complete: pick a point on the curve</h3>
          <div className={styles.grid2}>
            <PlotFigure build={buildDrops} label="Drop rate against allowed lateness" />
            <PlotFigure build={buildLatency} label="Result latency against allowed lateness" />
          </div>
          <p>
            Every second of allowed lateness delays every result by a second, and drops fall off slowly
            because the tail of delays is long. Real systems pick a lateness for the dashboard and send
            later events to a correction job (or update the window and emit a revised count).
          </p>
          <h3>The outage</h3>
          <p>
            Turn on the outage: the network is down for a minute and phones buffer their events, then send
            them all at 4:20. Look at the black ticks: bucketing by arrival time shows a dead minute and
            then a spike, a fake drop-and-surge that might page someone. Event-time counts (the bars) keep
            the true, flat shape, as long as the allowed lateness covers the outage.
          </p>
        </div>
      }
      explainBack={
        <ExplainBack
          questions={[
            {
              q: 'What is the difference between event time and processing time, and which should a business metric use?',
              a: 'Event time is when it happened; processing time is when the system saw it. Business metrics (“purchases per hour”) almost always want event time; processing time measures your pipeline, and it distorts metrics whenever delays change (outages, backfills, retries).',
            },
            {
              q: 'What is a watermark?',
              a: 'A moving threshold of event time that says “events older than this have (probably) all arrived”. It lets a streaming system decide when a window is complete enough to emit. Here it is max event time seen minus an allowed lateness.',
            },
            {
              q: 'What do you trade when you increase allowed lateness?',
              a: 'Completeness for latency (and memory: windows stay open longer). Fewer events are dropped, but every window’s result comes out later.',
            },
            {
              q: 'What happens to events that arrive after their window closed, and what can you do about them?',
              a: 'By default they are dropped (or counted in no window). Options: allow longer lateness; emit updated results for the window (retractions/upserts downstream); send them to a side output and reconcile in a batch job that recomputes from event time.',
            },
          ]}
        />
      }
    />
  )
}
