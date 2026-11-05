import * as Plot from '@observablehq/plot'
import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import { ResetButton, SeedControl, Toggle } from '../../components/Controls.tsx'
import ExplainBack from '../../components/ExplainBack.tsx'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import PlotFigure from '../../components/PlotFigure.tsx'
import Slider from '../../components/Slider.tsx'
import { Stat, StatRow } from '../../components/Stat.tsx'
import type { VizTheme } from '../../components/vizTheme.ts'
import { activeByWeek, pooledRetention, simulateCohorts, type CohortParams } from '../../core/cohorts.ts'
import { mulberry32 } from '../../core/random.ts'
import { int, pct } from '../../format.ts'
import styles from '../common.module.css'

interface Controls {
  growth: number
  floor: number
  decay: number
  worse: boolean
  seed: number
}

const DEFAULTS: Controls = { growth: 1.1, floor: 0.25, decay: 2, worse: false, seed: 1 }
const WEEKS = 16
const WORSE_FROM = 8

const params = (c: Controls): CohortParams => ({ weeks: WEEKS, firstCohort: 2000, growth: c.growth, floor: c.floor, decay: c.decay, worseFrom: c.worse ? WORSE_FROM : null, worseFloor: c.floor / 2.5 })

export default function Cohorts() {
  const [c, setC] = useState(DEFAULTS)
  const deferred = useDeferredValue(c)
  const stale = deferred !== c
  const set = <K extends keyof Controls>(k: K) => (v: Controls[K]) => setC((s) => ({ ...s, [k]: v }))
  const cohorts = useMemo(() => simulateCohorts(params(deferred), mulberry32(deferred.seed)), [deferred])
  const active = activeByWeek(cohorts, WEEKS)
  const pooled = Array.from({ length: WEEKS }, (_, k) => ({ k, ...pooledRetention(cohorts, k) }))
  const w4 = cohorts.filter((x) => x.active.length > 4).map((x) => ({ cohort: x.cohort, r: x.active[4] / x.size }))

  const buildHeat = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const cells = cohorts.flatMap((x) => x.active.map((a, k) => ({ cohort: `week ${x.cohort + 1}`, age: k, r: a / x.size, size: x.size })))
      return {
        width,
        height: 420,
        marginLeft: 70,
        padding: 0.06,
        x: { label: 'weeks since signup →', axis: 'top', tickFormat: 'd' },
        y: { label: 'signup cohort', domain: cohorts.map((x) => `week ${x.cohort + 1}`) },
        color: { type: 'linear', domain: [0, 0.6], range: [t.surface, t.series1], clamp: true, legend: true, label: 'share still active', tickFormat: '.0%' },
        marks: [
          Plot.cell(cells.filter((d) => d.age > 0), { x: 'age', y: 'cohort', fill: 'r', rx: 2, tip: { format: { fill: '.1%', x: true, y: true } } }),
          Plot.text(cells.filter((d) => d.age > 0 && width > 640), { x: 'age', y: 'cohort', text: (d: { r: number }) => (d.r * 100).toFixed(0), fill: (d: { r: number }) => (d.r > 0.35 ? '#ffffff' : t.inkSecondary), fontSize: 9 }),
        ],
      }
    },
    [cohorts],
  )

  const buildActive = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => ({
      width,
      height: 220,
      x: { label: 'calendar week →', tickFormat: (w: number) => String(w + 1) },
      y: { label: '↑ weekly active users', grid: true },
      marks: [
        Plot.areaY(active.map((a, w) => ({ w, a })), { x: 'w', y: 'a', fill: t.series1, fillOpacity: 0.15 }),
        Plot.line(active.map((a, w) => ({ w, a })), { x: 'w', y: 'a', stroke: t.series1, strokeWidth: 2, tip: true }),
        ...(deferred.worse ? [Plot.ruleX([WORSE_FROM], { stroke: '#d03b3b', strokeDasharray: '4 3' })] : []),
      ],
    }),
    [active, deferred.worse],
  )

  const buildW4 = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => ({
      width,
      height: 220,
      x: { label: 'signup cohort (week) →', tickFormat: (w: number) => String(w + 1) },
      y: { label: '↑ still active 4 weeks later', domain: [0, 0.6], tickFormat: '.0%', grid: true },
      marks: [
        Plot.line(w4, { x: 'cohort', y: 'r', stroke: t.series2, strokeWidth: 2 }),
        Plot.dot(w4, { x: 'cohort', y: 'r', fill: t.series2, r: 4, tip: { format: { y: '.1%' } } }),
        ...(deferred.worse ? [Plot.ruleX([WORSE_FROM], { stroke: '#d03b3b', strokeDasharray: '4 3' })] : []),
      ],
    }),
    [w4, deferred.worse],
  )

  const buildPooled = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const data = pooled.filter((d) => d.k > 0).flatMap((d) => [
        { k: d.k, kind: 'only cohorts old enough (correct)', r: d.correct },
        { k: d.k, kind: 'all signups in the denominator (naive)', r: d.naive },
      ])
      return {
        width,
        height: 240,
        x: { label: 'weeks since signup →', tickFormat: 'd' },
        y: { label: '↑ retention', tickFormat: '.0%', domain: [0, 0.7], grid: true },
        color: { domain: ['only cohorts old enough (correct)', 'all signups in the denominator (naive)'], range: [t.series1, t.series2], legend: true },
        marks: [
          Plot.line(data, { x: 'k', y: 'r', stroke: 'kind', strokeWidth: 2 }),
          Plot.dot(data, { x: 'k', y: 'r', fill: 'kind', r: 3, tip: { format: { y: '.1%' } } }),
        ],
      }
    },
    [pooled],
  )

  const panel = (
    <>
      <Slider label="Signup growth per week" value={c.growth} onChange={set('growth')} min={1} max={1.25} step={0.01} format={(v) => `+${((v - 1) * 100).toFixed(0)}%`} />
      <Slider label="Users who stick (long-run)" value={c.floor} onChange={set('floor')} min={0.05} max={0.5} step={0.01} format={(v) => pct(v, 0)} />
      <Slider label="Early drop-off speed" value={c.decay} onChange={set('decay')} min={0.5} max={6} step={0.25} format={(v) => `${v} wk`} hint="higher = slower decay" />
      <Toggle label={`Product gets worse from week ${WORSE_FROM + 1}`} checked={c.worse} onChange={set('worse')} />
      <SeedControl seed={c.seed} onChange={set('seed')} />
      <ResetButton onClick={() => setC(DEFAULTS)} />
    </>
  )

  return (
    <ModuleLayout
      title="Cohorts and retention"
      controls={panel}
      intuition={
        <>
          <p>
            “Weekly active users” mixes two very different things: how many people you <em>bring in</em>,
            and how many <em>stay</em>. A growing marketing budget can lift the total for months while each
            new group of users leaves faster than the last.
          </p>
          <p>
            A <b>cohort</b> is a group that started at the same time (signed up in the same week). Follow
            each cohort separately and line them up by <em>age</em> (weeks since signup), not by calendar
            date. Each row of the triangle below is one cohort; each column is “how many were still
            active k weeks later”. Read down a column to see whether newer cohorts retain better or
            worse than older ones at the same age.
          </p>
          <p>
            It’s a triangle because young cohorts haven’t lived long enough to have late columns. Those
            cells are <em>unknown</em>, not zero.
          </p>
        </>
      }
      play={
        <div className={stale ? styles.stale : undefined}>
          <StatRow>
            <Stat label="Week-1 retention (all cohorts)" value={pct(pooled[1].correct, 0)} />
            <Stat label="Week-4 retention" value={pct(pooled[4].correct, 0)} />
            <Stat label="Week-12 retention" value={pct(pooled[12].correct, 0)} note={`${cohorts.filter((x) => x.active.length > 12).length} cohorts old enough`} />
            <Stat label="Active users this week" value={int(active[WEEKS - 1])} />
          </StatRow>
          <PlotFigure build={buildHeat} label="Cohort retention triangle" />
          <p className="try">
            Try: the bottom-left is your newest cohort, with only a week of history. Move “users who stick” and watch
            the right-hand columns flatten out at that level: that plateau, not week 1, decides whether
            the product grows.
          </p>
        </div>
      }
      breakIt={
        <div className={stale ? styles.stale : undefined}>
          <h3>Growth that hides decline</h3>
          <p className="lede">
            Turn on “product gets worse”: from week {WORSE_FROM + 1}, new users stick around less than half as much. Then
            watch the top chart.
          </p>
          <div className={styles.grid2}>
            <PlotFigure build={buildActive} label="Weekly active users over calendar weeks" />
            <PlotFigure build={buildW4} label="Week-4 retention by signup cohort" />
          </div>
          <p>
            Active users keep climbing, because each week’s signups are bigger than the last. Only the cohort view
            shows the break. A total that mixes acquisition and retention can’t tell you which one changed.
          </p>
          <h3>The denominator trap</h3>
          <p className="lede">
            “Week-k retention = users active at age k ÷ all signups.” Young cohorts can’t be active at
            week 10 yet, but they’re in the denominator, so they count as churned.
          </p>
          <PlotFigure build={buildPooled} label="Pooled retention curve, correct versus naive denominator" />
          <p>
            With growing signups, most users are in the young cohorts, so the naive curve plunges toward zero
            and makes long-term retention look terrible. Only count cohorts that have reached the age you’re
            measuring.
          </p>
        </div>
      }
      explainBack={
        <ExplainBack
          questions={[
            {
              q: 'Why can weekly active users grow while retention gets worse?',
              a: 'Active users = survivors of every past cohort. If acquisition grows fast enough, bigger new cohorts more than offset faster churn, for a while. The decline only shows when you split by cohort and compare at equal age.',
            },
            {
              q: 'What is a cohort table, and how do you read it?',
              a: 'Rows are cohorts (users grouped by start week), columns are age (weeks since start), cells are the share still active. Read across a row for one cohort’s decay, and down a column to compare cohorts at the same age.',
            },
            {
              q: 'Why is the cohort table a triangle, and what mistake does that invite?',
              a: 'Recent cohorts haven’t reached the later ages, so those cells don’t exist yet. Treating them as zero (or averaging across all users) biases retention down; pool only cohorts that have reached that age.',
            },
            {
              q: 'Which part of a retention curve matters most for long-run growth?',
              a: 'Where it flattens: the share of each cohort that stays for good. A curve that keeps decaying to zero means every user eventually leaves and growth depends entirely on acquisition.',
            },
          ]}
        />
      }
    />
  )
}
