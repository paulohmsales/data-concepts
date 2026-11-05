import * as Plot from '@observablehq/plot'
import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import { ResetButton, SeedControl } from '../../components/Controls.tsx'
import ExplainBack from '../../components/ExplainBack.tsx'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import PlotFigure from '../../components/PlotFigure.tsx'
import Slider from '../../components/Slider.tsx'
import { Stat, StatRow } from '../../components/Stat.tsx'
import type { VizTheme } from '../../components/vizTheme.ts'
import { mulberry32 } from '../../core/random.ts'
import { monthlyTotals, movingAverage, simulateSeries, weekdayEffect, weeklyPattern, weeklyRipple, type SeriesParams } from '../../core/seasonality.ts'
import { signedPct } from '../../format.ts'
import styles from '../common.module.css'

interface Controls {
  trendPerYear: number
  yearly: number
  weekend: number
  noise: number
  window: number
  seed: number
}

const DEFAULTS: Controls = { trendPerYear: 120, yearly: 200, weekend: 250, noise: 40, window: 7, seed: 1 }
const DAYS = 365 * 3
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const params = (c: Controls): SeriesParams => ({ days: DAYS, level: 1000, trendPerYear: c.trendPerYear, yearly: c.yearly, weekend: c.weekend, noise: c.noise })

export default function Seasonality() {
  const [c, setC] = useState(DEFAULTS)
  const deferred = useDeferredValue(c)
  const stale = deferred !== c
  const set = <K extends keyof Controls>(k: K) => (v: Controls[K]) => setC((s) => ({ ...s, [k]: v }))

  const series = useMemo(() => simulateSeries(params(deferred), mulberry32(deferred.seed)), [deferred])
  const values = useMemo(() => series.map((p) => p.value), [series])
  const ma = useMemo(() => movingAverage(values, deferred.window), [values, deferred.window])
  const trendEst = useMemo(() => movingAverage(values, 365, true), [values])
  const weekly = useMemo(() => weeklyPattern(values), [values])
  const months = useMemo(() => monthlyTotals(series), [series])
  const growth = months.slice(12).map((m, i) => ({
    month: i + 12,
    label: `${MONTHS[(i + 12) % 12]} Y${Math.floor((i + 12) / 12) + 1}`,
    mom: m.total / months[i + 11].total - 1,
    yoy: m.total / months[i].total - 1,
  }))
  // a Monday near the December peak of year 3 (day 1071 is a Monday), compared two ways
  const monday = 1071
  const dod = values[monday] / values[monday - 1] - 1
  const week = (end: number) => values.slice(end - 6, end + 1).reduce((a, b) => a + b, 0)
  const wow = week(monday + 6) / week(monday - 1) - 1

  const buildSeries = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const pts = series.map((p, i) => ({ day: p.day, value: p.value, ma: ma[i], trend: p.trend }))
      return {
        width,
        height: 280,
        x: { label: 'day →', ticks: [0, 365, 730, 1095], tickFormat: (d: number) => `Y${d / 365 + 1}` },
        y: { label: '↑ daily orders', grid: true },
        color: { domain: ['daily value', `${deferred.window}-day average`, 'true trend'], range: [t.neutral, t.series1, t.ink], legend: true },
        marks: [
          Plot.line(pts, { x: 'day', y: 'value', stroke: () => 'daily value', strokeWidth: 1 }),
          Plot.line(pts.filter((p) => !Number.isNaN(p.ma)), { x: 'day', y: 'ma', stroke: () => `${deferred.window}-day average`, strokeWidth: 2 }),
          Plot.line(pts, { x: 'day', y: 'trend', stroke: () => 'true trend', strokeDasharray: '5 4', strokeWidth: 1.5 }),
          Plot.tip(pts, Plot.pointerX({ x: 'day', y: 'value', format: { x: true, y: '.0f' } })),
        ],
      }
    },
    [series, ma, deferred.window],
  )

  const buildTrend = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => ({
      width,
      height: 180,
      x: { label: null, ticks: [0, 365, 730, 1095], tickFormat: (d: number) => `Y${d / 365 + 1}` },
      y: { label: '↑ trend', grid: true },
      color: { domain: ['estimate: centred 365-day average', 'truth'], range: [t.series1, t.ink], legend: true },
      marks: [
        Plot.line(series.map((p, i) => ({ day: p.day, est: trendEst[i] })).filter((p) => !Number.isNaN(p.est)), { x: 'day', y: 'est', stroke: () => 'estimate: centred 365-day average', strokeWidth: 2 }),
        Plot.line(series, { x: 'day', y: 'trend', stroke: () => 'truth', strokeDasharray: '5 4' }),
      ],
    }),
    [series, trendEst],
  )

  const buildWeekly = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const data = WEEKDAYS.flatMap((d, i) => [
        { d, kind: 'estimated', v: weekly[i] },
        { d, kind: 'truth', v: weekdayEffect(i, deferred.weekend) },
      ])
      return {
        width,
        height: 180,
        fx: { domain: WEEKDAYS, label: null },
        x: { axis: null, domain: ['estimated', 'truth'] },
        y: { label: '↑ vs a typical day', grid: true },
        color: { domain: ['estimated', 'truth'], range: [t.series1, t.neutral], legend: true },
        marks: [Plot.barY(data, { fx: 'd', x: 'kind', y: 'v', fill: 'kind', rx: 2, tip: { format: { y: '.0f' } } }), Plot.ruleY([0], { stroke: t.axis })],
      }
    },
    [weekly, deferred.weekend],
  )

  const buildGrowth = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const data = growth.flatMap((g) => [
        { month: g.month, label: g.label, kind: 'vs last month (MoM)', v: g.mom },
        { month: g.month, label: g.label, kind: 'vs same month last year (YoY)', v: g.yoy },
      ])
      return {
        width,
        height: 240,
        x: { label: 'month →', ticks: growth.filter((g) => g.month % 3 === 0).map((g) => g.month), tickFormat: (m: number) => growth.find((g) => g.month === m)?.label ?? '' },
        y: { label: '↑ growth', tickFormat: '+.0%', grid: true },
        color: { domain: ['vs last month (MoM)', 'vs same month last year (YoY)'], range: [t.series2, t.series1], legend: true },
        marks: [
          Plot.ruleY([0], { stroke: t.axis }),
          Plot.line(data, { x: 'month', y: 'v', stroke: 'kind', strokeWidth: 2 }),
          Plot.dot(data, { x: 'month', y: 'v', fill: 'kind', r: 3, tip: { channels: { month: 'label' }, format: { x: false, y: '+.1%' } } }),
        ],
      }
    },
    [growth],
  )

  const buildRipple = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const data = Array.from({ length: 35 }, (_, i) => ({ w: i + 1, ripple: weeklyRipple(i + 1, deferred.weekend) }))
      return {
        width,
        height: 200,
        x: { label: 'moving-average window (days) →', ticks: [1, 7, 14, 21, 28, 35] },
        y: { label: '↑ weekly wiggle left over', grid: true },
        marks: [
          Plot.barY(data, { x: 'w', y: 'ripple', fill: (d: { w: number }) => (d.w % 7 === 0 ? t.series1 : d.w === deferred.window ? t.series2 : t.neutral), rx: 2, tip: { format: { y: '.0f' } } }),
          Plot.ruleY([0], { stroke: t.axis }),
        ],
      }
    },
    [deferred.weekend, deferred.window],
  )

  const panel = (
    <>
      <Slider label="Trend (per year)" value={c.trendPerYear} onChange={set('trendPerYear')} min={-200} max={300} step={10} format={(v) => `${v > 0 ? '+' : ''}${v}`} />
      <Slider label="Yearly season (December peak)" value={c.yearly} onChange={set('yearly')} min={0} max={400} step={10} format={String} />
      <Slider label="Weekend dip" value={c.weekend} onChange={set('weekend')} min={0} max={400} step={10} format={String} />
      <Slider label="Noise" value={c.noise} onChange={set('noise')} min={0} max={150} step={5} format={String} />
      <Slider label="Moving-average window" value={c.window} onChange={set('window')} min={1} max={60} step={1} format={(v) => `${v} days`} />
      <SeedControl seed={c.seed} onChange={set('seed')} />
      <ResetButton onClick={() => setC(DEFAULTS)} />
    </>
  )

  return (
    <ModuleLayout
      title="Trend vs seasonality"
      controls={panel}
      intuition={
        <>
          <p>
            Most business metrics are several rhythms on top of each other: a slow <b>trend</b> (the
            business growing), a <b>yearly season</b> (December peaks, summer lulls), a <b>weekly
            pattern</b> (weekends differ), and day-to-day <b>noise</b>. The question people actually ask,
            “are we growing?”, is about the trend alone. The other rhythms are in the way.
          </p>
          <p>
            Two tools separate them. A <b>moving average</b> whose window is a whole number of cycles (7
            days, 28 days) cancels that cycle exactly. And comparing a period with <b>the same period one
            cycle earlier</b> (this Monday vs last Monday, this December vs last December) compares like
            with like.
          </p>
        </>
      }
      play={
        <div className={stale ? styles.stale : undefined}>
          <PlotFigure build={buildSeries} label="Daily series with moving average and true trend" />
          <h3>Pulling it apart</h3>
          <div className={styles.grid2}>
            <PlotFigure build={buildTrend} label="Estimated versus true trend" />
            <PlotFigure build={buildWeekly} label="Estimated versus true weekly pattern" />
          </div>
          <p className="try">
            Set the window to 7, then 10. The 7-day line is smooth; the 10-day line wobbles every week.
            Raise the yearly season and the 7-day line follows it, because a weekly average only removes the
            weekly cycle. The 365-day average removes both, but it can’t see the first and last half-year.
          </p>
        </div>
      }
      breakIt={
        <div className={stale ? styles.stale : undefined}>
          <h3>“Orders are down this month!”</h3>
          <p className="lede">
            Month-over-month growth for years 2–3 against year-over-year growth for the same months. The
            business grows {signedPct(deferred.trendPerYear / 1100, 0)}-ish a year the whole time.
          </p>
          <PlotFigure build={buildGrowth} label="Month-over-month versus year-over-year growth" />
          <p>
            MoM swings with the season every January and July: those are not problems, they are the
            calendar. YoY stays close to the real trend, because both months sit at the same point in the
            cycle. Set the trend to 0: MoM still shows dramatic “growth” and “decline”, and YoY flatlines.
          </p>
          <h3>Comparing the wrong days</h3>
          <StatRow>
            <Stat label="This Monday vs yesterday (Sunday)" value={signedPct(dod)} note="mostly the weekend effect" />
            <Stat label="This week vs last week (7-day totals)" value={signedPct(wow)} note="like with like: every weekday once" />
          </StatRow>
          <h3>Windows that don’t fit the cycle</h3>
          <p className="lede">
            How much weekly pattern each moving-average window leaves behind. Only multiples of 7 (blue) remove
            it completely; your current window is orange if it isn’t one.
          </p>
          <PlotFigure build={buildRipple} label="Weekly ripple left by each moving-average window" />
        </div>
      }
      explainBack={
        <ExplainBack
          questions={[
            {
              q: 'December revenue is up 25% on November. Is the business doing well?',
              a: 'You can’t tell from that: December is seasonally high. Compare with December last year (YoY), or with a seasonally adjusted series, to separate trend from season.',
            },
            {
              q: 'Why does a 7-day moving average remove the weekly pattern but a 10-day one doesn’t?',
              a: 'A 7-day window always contains exactly one of each weekday, so the weekly effects sum to zero. A 10-day window contains some weekdays twice, and which ones changes as it slides, so a weekly wiggle remains.',
            },
            {
              q: 'What are the downsides of year-over-year comparisons?',
              a: 'They need a year of history, react slowly (a change shows up fully only after months), and can be distorted by calendar shifts (Easter, an extra weekend day, leap years) or by anything unusual last year (the base effect).',
            },
            {
              q: 'Describe additive decomposition in a sentence.',
              a: 'Write the series as trend + seasonal + remainder: estimate the trend with a moving average spanning whole cycles, estimate each season as the average deviation from trend at that point in the cycle, and what is left is the remainder.',
            },
          ]}
        />
      }
    />
  )
}
