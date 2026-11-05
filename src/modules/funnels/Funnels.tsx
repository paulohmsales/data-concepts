import * as Plot from '@observablehq/plot'
import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import { ResetButton, SeedControl } from '../../components/Controls.tsx'
import DataTable from '../../components/DataTable.tsx'
import ExplainBack from '../../components/ExplainBack.tsx'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import PlotFigure from '../../components/PlotFigure.tsx'
import Slider from '../../components/Slider.tsx'
import Status from '../../components/Status.tsx'
import type { VizTheme } from '../../components/vizTheme.ts'
import { naiveFunnel, orderedFunnel, simulateEvents, STEPS, type FunnelParams } from '../../core/funnels.ts'
import { mulberry32 } from '../../core/random.ts'
import { int, pct } from '../../format.ts'
import styles from '../common.module.css'

interface Controls {
  r1: number
  r2: number
  r3: number
  guests: number
  slowBuyers: number
  windowHours: number
  bots: number
  seed: number
}

const DEFAULTS: Controls = { r1: 0.35, r2: 0.5, r3: 0.55, guests: 0, slowBuyers: 0.2, windowHours: 168, bots: 0, seed: 1 }
const USERS = 10_000
const ORDERED = 'ordered, within the window'
const NAIVE = 'distinct users per event (naive)'

const params = (c: Controls): FunnelParams => ({ users: USERS, rates: [c.r1, c.r2, c.r3], meanGapHours: 3, guests: c.guests, slowBuyers: c.slowBuyers, bots: c.bots })
const hours = (h: number) => (h >= 48 ? `${Math.round(h / 24)} days` : `${h} h`)

export default function Funnels() {
  const [c, setC] = useState(DEFAULTS)
  const deferred = useDeferredValue(c)
  const stale = deferred !== c
  const set = <K extends keyof Controls>(k: K) => (v: Controls[K]) => setC((s) => ({ ...s, [k]: v }))
  const events = useMemo(() => simulateEvents(params(deferred), mulberry32(deferred.seed)), [deferred])
  const ordered = useMemo(() => orderedFunnel(events, deferred.windowHours), [events, deferred.windowHours])
  const unlimited = useMemo(() => orderedFunnel(events, 1e9), [events])
  const naive = useMemo(() => naiveFunnel(events), [events])
  const windows = useMemo(() => [1, 3, 6, 12, 24, 48, 72, 168, 336, 720].map((w) => ({ w, buyers: orderedFunnel(events, w)[3] })), [events])

  const buildFunnel = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const data = STEPS.map((s, i) => ({ step: s, n: ordered[i], ofTop: ordered[i] / ordered[0], ofPrev: i ? ordered[i] / ordered[i - 1] : 1 }))
      return {
        width,
        height: 220,
        marginLeft: 80,
        x: { label: 'users →', grid: true },
        y: { label: null, domain: [...STEPS] },
        marks: [
          Plot.barX(data, { y: 'step', x: 'n', fill: t.series1, rx: 4, tip: { format: { x: ',' } } }),
          Plot.text(data, { y: 'step', x: 'n', text: (d: { n: number; ofPrev: number; step: string }) => `${int(d.n)}${d.step === 'visit' ? '' : `  (${pct(d.ofPrev, 0)} of previous)`}`, dx: 8, textAnchor: 'start', fill: t.ink }),
        ],
      }
    },
    [ordered],
  )

  const buildCompare = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const data = STEPS.flatMap((s, i) => [
        { step: s, kind: ORDERED, n: ordered[i] },
        { step: s, kind: NAIVE, n: naive[i] },
      ])
      return {
        width,
        height: 240,
        fx: { domain: [...STEPS], label: null },
        x: { axis: null, domain: [ORDERED, NAIVE] },
        y: { label: '↑ users', grid: true },
        color: { domain: [ORDERED, NAIVE], range: [t.series1, t.series2], legend: true },
        marks: [
          Plot.barY(data, { fx: 'step', x: 'kind', y: 'n', fill: 'kind', rx: 3, insetLeft: 1, insetRight: 1, tip: { format: { y: ',' } } }),
          Plot.ruleY([0], { stroke: t.axis }),
        ],
      }
    },
    [ordered, naive],
  )

  const buildWindows = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => ({
      width,
      height: 220,
      x: { type: 'log', label: 'conversion window (hours, log) →' },
      y: { label: '↑ purchasers counted', grid: true },
      marks: [
        Plot.axisX([1, 3, 6, 12, 24, 48, 72, 168, 336, 720], { tickFormat: (h: number) => hours(h) }),
        Plot.ruleX([deferred.windowHours], { stroke: t.inkSecondary, strokeDasharray: '4 3' }),
        Plot.line(windows, { x: 'w', y: 'buyers', stroke: t.series1, strokeWidth: 2 }),
        Plot.dot(windows, { x: 'w', y: 'buyers', fill: t.series1, r: 4, tip: true }),
      ],
    }),
    [windows, deferred.windowHours],
  )

  const panel = (
    <>
      <strong>True behaviour</strong>
      <Slider label="visit → signup" value={c.r1} onChange={set('r1')} min={0.05} max={0.9} step={0.01} format={(v) => pct(v, 0)} />
      <Slider label="signup → cart" value={c.r2} onChange={set('r2')} min={0.05} max={0.9} step={0.01} format={(v) => pct(v, 0)} />
      <Slider label="cart → purchase" value={c.r3} onChange={set('r3')} min={0.05} max={0.9} step={0.01} format={(v) => pct(v, 0)} />
      <Slider label="Buyers who come back days later" value={c.slowBuyers} onChange={set('slowBuyers')} min={0} max={0.8} step={0.05} format={(v) => pct(v, 0)} />
      <strong>Measurement</strong>
      <Slider label="Conversion window" value={c.windowHours} onChange={set('windowHours')} min={1} max={720} step={1} log format={hours} />
      <strong>Break it</strong>
      <Slider label="Guest checkout (no signup event)" value={c.guests} onChange={set('guests')} min={0} max={0.9} step={0.05} format={(v) => pct(v, 0)} />
      <Slider label="Bot visits" value={c.bots} onChange={set('bots')} min={0} max={30_000} step={1000} format={int} />
      <SeedControl seed={c.seed} onChange={set('seed')} />
      <ResetButton onClick={() => setC(DEFAULTS)} />
    </>
  )

  return (
    <ModuleLayout
      title="Funnels"
      controls={panel}
      intuition={
        <>
          <p>
            A funnel counts how many users make it through a sequence of steps: visit, sign up, add to
            cart, buy. The drop between two steps is where the product loses people, so it is where to look.
          </p>
          <p>
            Defining it takes more decisions than it seems. <b>Order</b>: does a user count at “cart” if
            they never signed up, or did it before signing up? <b>Window</b>: if they buy three weeks after
            their first visit, is that the same journey? <b>Who</b> is in the denominator: users, sessions,
            bots? Each choice changes the numbers, and two dashboards that made different choices will
            disagree.
          </p>
        </>
      }
      play={
        <div className={stale ? styles.stale : undefined}>
          <h3>The funnel ({hours(deferred.windowHours)} window, steps in order)</h3>
          <PlotFigure build={buildFunnel} label="Ordered funnel counts per step" />
          <p className="lede">
            Overall conversion {pct(ordered[3] / ordered[0], 1)}. The true rates multiply:{' '}
            {pct(deferred.r1, 0)} × {pct(deferred.r2, 0)} × {pct(deferred.r3, 0)} = {pct(deferred.r1 * deferred.r2 * deferred.r3, 1)}.
          </p>
          <h3>How long is a journey?</h3>
          <p className="lede">
            Purchasers counted against the window length. Short windows miss buyers who come back later;
            the curve flattens once the window covers almost everyone ({int(unlimited[3])} with no limit).
          </p>
          <PlotFigure build={buildWindows} label="Purchasers counted by conversion window" />
          <p className="try">
            Set the window to 1 hour, and “buyers who come back later” to 80%. Most purchases fall outside,
            and cart → purchase looks like a disaster. Same users, different definition.
          </p>
        </div>
      }
      breakIt={
        <div className={stale ? styles.stale : undefined}>
          <h3>Counting events instead of journeys</h3>
          <p className="lede">
            The naive funnel counts distinct users per event type, with no order and no window. Raise “guest
            checkout”: guests add to cart without ever signing up.
          </p>
          <PlotFigure build={buildCompare} label="Ordered versus naive funnel counts" />
          <DataTable
            rows={STEPS.slice(1).map((s, i) => ({ s, ord: ordered[i + 1] / ordered[i], nai: naive[i + 1] / naive[i] }))}
            rowKey={(r) => r.s}
            columns={[
              { key: 's', label: 'Step', render: (r) => `${STEPS[STEPS.indexOf(r.s) - 1]} → ${r.s}` },
              { key: 'o', label: 'Ordered funnel', align: 'right', render: (r) => pct(r.ord, 0) },
              { key: 'n', label: 'Naive', align: 'right', render: (r) => (r.nai > 1 ? <Status level="bad">{pct(r.nai, 0)}</Status> : pct(r.nai, 0)) },
            ]}
          />
          <p>
            Naive “signup → cart” can go above 100%, which is a sure sign the steps aren’t nested. The strict
            funnel instead drops guests entirely, which may hide your best buyers. Neither is “right”: decide
            whether guest checkout is part of this funnel, and make the definition explicit.
          </p>
          <h3>Bots in the denominator</h3>
          <p>
            Slide bot visits up. Visit → signup collapses (now {pct(ordered[1] / ordered[0], 1)}) and overall
            conversion falls, while every later step is unchanged. When the top of the funnel moves and nothing
            below it does, suspect the traffic, not the product.
          </p>
        </div>
      }
      explainBack={
        <ExplainBack
          questions={[
            {
              q: 'What decisions define a funnel, beyond the list of steps?',
              a: 'The unit (user, session, account), whether steps must happen in order, the conversion window (and whether it starts at the first step), whether repeated steps count, and which traffic is excluded (bots, internal users).',
            },
            {
              q: 'Step conversion shows 115%. What happened?',
              a: 'The later step isn’t a subset of the earlier one: users reach it without the earlier event (guest flows, deep links, missing tracking) and the funnel counts events independently rather than ordered journeys.',
            },
            {
              q: 'Why does the conversion window matter, and how do you choose it?',
              a: 'Purchases after the window aren’t counted, so a short window understates conversion, especially for considered purchases, and makes recent periods look worse (not enough time has passed). Choose from the observed time-to-convert distribution (e.g. the window covering 90–95% of conversions) and apply it consistently.',
            },
            {
              q: 'Top-of-funnel conversion dropped 30% overnight; every later step is flat. What do you check first?',
              a: 'The denominator: a traffic change (bots, a new campaign bringing low-intent visitors, a tracking change double-firing page views). A real product problem would usually show in the steps below too.',
            },
          ]}
        />
      }
    />
  )
}
