import * as Plot from '@observablehq/plot'
import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import { Choice, ResetButton, SeedControl } from '../../components/Controls.tsx'
import DataTable from '../../components/DataTable.tsx'
import ExplainBack from '../../components/ExplainBack.tsx'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import PlotFigure from '../../components/PlotFigure.tsx'
import Slider from '../../components/Slider.tsx'
import { Stat, StatRow } from '../../components/Stat.tsx'
import Status from '../../components/Status.tsx'
import type { VizTheme } from '../../components/vizTheme.ts'
import { expectedWritesPerEvent, simulateDelivery, type DeliveryParams } from '../../core/delivery.ts'
import { mulberry32 } from '../../core/random.ts'
import { int, pct } from '../../format.ts'
import styles from '../common.module.css'

interface Controls extends DeliveryParams {
  seed: number
}

const DEFAULTS: Controls = { events: 1000, pRequestLost: 0.1, pAckLost: 0.1, retry: 'at-least-once', maxAttempts: 20, sink: 'append', seed: 1 }
const OUTCOMES = ['written, acked', 'written, ack lost', 'request lost'] as const
const PRICE = 50

const COMBOS = (['at-most-once', 'at-least-once'] as const).flatMap((retry) => (['append', 'upsert'] as const).map((sink) => ({ retry, sink })))

function simulate(c: Controls) {
  const one = simulateDelivery(c, mulberry32(c.seed))
  const matrix = COMBOS.map((k) => ({ ...k, ...simulateDelivery({ ...c, ...k }, mulberry32(c.seed)) }))
  return { one, matrix }
}

export default function Retries() {
  const [c, setC] = useState(DEFAULTS)
  const deferred = useDeferredValue(c)
  const sim = useMemo(() => simulate(deferred), [deferred])
  const stale = deferred !== c
  const set = <K extends keyof Controls>(k: K) => (v: Controls[K]) => setC((s) => ({ ...s, [k]: v }))
  const { one } = sim

  const buildAttempts = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const shown = one.attempts.filter((a) => a.event < 20)
      return {
        width,
        height: 360,
        marginLeft: 70,
        x: { label: 'attempt →', ticks: Array.from({ length: Math.max(...shown.map((a) => a.attempt)) }, (_, i) => i + 1), tickFormat: 'd' },
        y: { label: null, tickFormat: (e: number) => `event ${e + 1}`, domain: Array.from({ length: 20 }, (_, i) => i) },
        color: { domain: [...OUTCOMES], range: [t.series1, t.series2, t.neutral], legend: true },
        marks: [
          Plot.cell(shown, { x: 'attempt', y: 'event', fill: 'outcome', inset: 1.5, rx: 3, tip: { format: { x: true, y: (e: number) => `event ${e + 1}`, fill: true } } }),
        ],
      }
    },
    [one.attempts],
  )

  const buildTheory = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const pts = Array.from({ length: 50 }, (_, i) => {
        const p = i / 100
        return { p, dup: expectedWritesPerEvent(p) - 1 }
      })
      return {
        width,
        height: 220,
        x: { label: 'chance an ack is lost →', tickFormat: '.0%' },
        y: { label: '↑ extra rows per event (retries + append)', tickFormat: '.0%', grid: true },
        marks: [
          Plot.line(pts, { x: 'p', y: 'dup', stroke: t.series2, strokeWidth: 2, tip: { format: { x: '.0%', y: '.1%' } } }),
          Plot.dot([{ p: deferred.pAckLost, dup: expectedWritesPerEvent(deferred.pAckLost) - 1 }], { x: 'p', y: 'dup', fill: t.series2, r: 6, stroke: t.surface, strokeWidth: 2 }),
        ],
      }
    },
    [deferred.pAckLost],
  )

  const panel = (
    <>
      <Slider label="Requests lost in transit" value={c.pRequestLost} onChange={set('pRequestLost')} min={0} max={0.5} step={0.01} format={(v) => pct(v, 0)} />
      <Slider label="Acks lost (written, but no reply)" value={c.pAckLost} onChange={set('pAckLost')} min={0} max={0.5} step={0.01} format={(v) => pct(v, 0)} />
      <Choice label="Producer" value={c.retry} onChange={set('retry')} options={[{ value: 'at-most-once', label: 'send once' }, { value: 'at-least-once', label: 'retry until acked' }]} />
      <Choice label="Sink" value={c.sink} onChange={set('sink')} options={[{ value: 'append', label: 'INSERT (append)' }, { value: 'upsert', label: 'upsert by event id' }]} />
      <SeedControl seed={c.seed} onChange={set('seed')} />
      <ResetButton onClick={() => setC(DEFAULTS)} />
    </>
  )

  return (
    <ModuleLayout
      title="Retries and idempotency"
      controls={panel}
      intuition={
        <>
          <p>
            A service sends an event (“charge Ana $50”) and waits for “OK”. Nothing comes back. Two very
            different things could have happened: the request never arrived, or it arrived, was
            processed, and the <em>reply</em> got lost. From the sender’s side they look identical: a
            timeout.
          </p>
          <p>
            So you choose. <b>Don’t retry</b>, and some events are lost (at-most-once). <b>Retry</b>, and
            some events are processed twice (at-least-once). There is no network trick that avoids
            both. What you can do is make the receiver <b>idempotent</b>: processing the same event twice
            has the same effect as once, typically by keying writes on an event id (upsert, MERGE,
            INSERT … ON CONFLICT DO NOTHING). At-least-once delivery + idempotent processing is what
            people mean by “exactly once”.
          </p>
        </>
      }
      play={
        <div className={stale ? styles.stale : undefined}>
          <h3>What the first 20 events went through</h3>
          <p className="lede">Each square is one attempt. Orange squares were written, but the producer never found out, so it tried again.</p>
          <PlotFigure build={buildAttempts} label="Delivery attempts per event, coloured by outcome" />
          <StatRow>
            <Stat label="Rows in the sink" value={int(one.rows)} note={`${int(deferred.events)} events sent`} />
            <Stat label="Lost events" value={int(one.lost)} note={one.lost ? <Status level="bad">never written</Status> : <Status level="good">none</Status>} />
            <Stat label="Duplicate rows" value={int(one.duplicates)} note={one.duplicates ? <Status level="bad">written twice or more</Status> : <Status level="good">none</Status>} />
          </StatRow>
          <h3>All four combinations, same network</h3>
          <DataTable
            rows={sim.matrix}
            rowKey={(r) => r.retry + r.sink}
            rowClass={(r) => (r.retry === deferred.retry && r.sink === deferred.sink ? 'hl' : undefined)}
            columns={[
              { key: 'p', label: 'Producer', render: (r) => (r.retry === 'at-most-once' ? 'send once' : 'retry until acked') },
              { key: 's', label: 'Sink', render: (r) => (r.sink === 'append' ? 'INSERT' : 'upsert by id') },
              { key: 'l', label: 'Lost', align: 'right', render: (r) => int(r.lost) },
              { key: 'd', label: 'Duplicates', align: 'right', render: (r) => int(r.duplicates) },
              {
                key: 'v',
                label: 'You get',
                render: (r) =>
                  r.lost === 0 && r.duplicates === 0 ? (
                    <Status level="good">effectively exactly once</Status>
                  ) : r.lost > 0 ? (
                    <Status level="bad">at most once (losses)</Status>
                  ) : (
                    <Status level="warn">at least once (duplicates)</Status>
                  ),
              },
            ]}
          />
          <p className="try">
            Set acks lost to 0%. Retrying + INSERT looks perfect, until the network has a bad day.
            Then set requests lost to 0% and acks lost high: “send once” looks lossless but quietly
            depends on luck.
          </p>
        </div>
      }
      breakIt={
        <div className={stale ? styles.stale : undefined}>
          <h3>The double charge</h3>
          <p className="lede">
            The events are payments of ${PRICE}. With “retry until acked” and a plain INSERT, every lost
            ack becomes a second charge.
          </p>
          <StatRow>
            <Stat label="Customers charged" value={`$${int(sim.matrix[2].rows * PRICE)}`} note={`should be $${int(deferred.events * PRICE)}`} />
            <Stat label="Overcharge" value={`$${int(sim.matrix[2].duplicates * PRICE)}`} note={`${int(sim.matrix[2].duplicates)} duplicate payments`} />
            <Stat label="With an idempotency key" value={`$${int(sim.matrix[3].rows * PRICE)}`} note={<Status level="good">every retry is a no-op</Status>} />
          </StatRow>
          <PlotFigure build={buildTheory} label="Expected duplicate share against ack loss rate" />
          <pre className={styles.sql}>{`-- the idempotent write: the event id decides, not the number of attempts
INSERT INTO payments (event_id, customer, amount)
VALUES ('evt_9f2c', 'ana', 50)
ON CONFLICT (event_id) DO NOTHING;`}</pre>
          <p>
            The same applies to batch jobs: a job that “appends today’s rows” and is retried by the
            scheduler after a timeout doubles a day (see Snapshots and incremental loads). Overwrite the
            partition, or merge by key, and a retry costs time instead of correctness. Also note that
            “increment a counter” operations (balance = balance + 50) are never idempotent: store the
            events and derive the balance.
          </p>
        </div>
      }
      explainBack={
        <ExplainBack
          questions={[
            {
              q: 'Why can’t a sender tell a lost request from a lost acknowledgement?',
              a: 'In both cases it sees the same thing: no reply before the timeout. The difference happened on the other side of the network, which is exactly what it can’t observe.',
            },
            {
              q: 'What do at-most-once, at-least-once and exactly-once mean?',
              a: 'At-most-once: never retry, so events can be lost but never duplicated. At-least-once: retry until acknowledged, so nothing is lost but events can be processed more than once. Exactly-once (effectively): at-least-once delivery plus idempotent processing, so duplicates have no extra effect.',
            },
            {
              q: 'How do you make a write idempotent? Give two ways.',
              a: 'Key it on a unique event/idempotency id and upsert or ignore conflicts (MERGE, INSERT … ON CONFLICT DO NOTHING); or make the write an overwrite of a deterministic unit (replace partition dt=2026-03-01 with exactly this data). Avoid relative updates like “add 50”.',
            },
            {
              q: 'With a 10% chance of losing acks and unlimited retries, how many rows do you expect per event if the sink appends?',
              a: 'Each event is written until an ack gets back: expected writes = 1 / (1 − 0.1) ≈ 1.11, so about 11% duplicates.',
            },
          ]}
        />
      }
    />
  )
}
