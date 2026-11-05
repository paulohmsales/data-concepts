import * as Plot from '@observablehq/plot'
import { useCallback, useMemo, useState } from 'react'
import { Choice, ResetButton, Toggle } from '../../components/Controls.tsx'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import PlotFigure from '../../components/PlotFigure.tsx'
import Slider from '../../components/Slider.tsx'
import { Stat, StatRow } from '../../components/Stat.tsx'
import type { VizTheme } from '../../components/vizTheme.ts'
import { assign, EXTRA_CONSUMERS, SCALE_AT, simulateKafka, type KafkaParams, type KafkaResult } from '../../core/kafka.ts'
import { int } from '../../format.ts'
import styles from './Kafka.module.css'

const DEFAULTS: KafkaParams = { partitions: 6, consumers: 3, rate: 6000, capacity: 1500, hotShare: 0, scaleOut: false, protocol: 'eager' }

function lagChart(r: KafkaResult, k: KafkaParams, width: number, t: VizTheme): Plot.PlotOptions {
  const data = r.lag.flatMap((row, s) => [
    { s, who: 'partition 0', lag: row[0] },
    { s, who: 'other partitions', lag: row.slice(1).reduce((a, b) => a + b, 0) },
  ])
  return {
    width,
    height: 260,
    x: { label: 'seconds →' },
    y: { label: '↑ consumer lag (messages)', grid: true, tickFormat: '~s' },
    color: { domain: ['partition 0', 'other partitions'], range: [t.series2, t.series1], legend: true },
    marks: [
      ...(k.scaleOut ? [Plot.ruleX([SCALE_AT], { stroke: t.ink, strokeDasharray: '4 3' }), Plot.text([SCALE_AT], { x: (d: number) => d, frameAnchor: 'top', dx: 4, textAnchor: 'start', text: () => `+${EXTRA_CONSUMERS} consumers → rebalance`, fill: t.inkSecondary })] : []),
      Plot.areaY(data, Plot.stackY({ x: 's', y: 'lag', fill: 'who', order: ['other partitions', 'partition 0'], curve: 'step' })),
      Plot.ruleY([0], { stroke: t.axis }),
      Plot.tip(data, Plot.pointerX(Plot.stackY({ x: 's', y: 'lag', fill: 'who', order: ['other partitions', 'partition 0'], format: { y: ',.0f' } }))),
    ],
  }
}

export default function Kafka() {
  const [k, setK] = useState(DEFAULTS)
  const set = <K extends keyof KafkaParams>(key: K) => (v: KafkaParams[K]) => setK((s) => ({ ...s, [key]: v }))
  const r = useMemo(() => simulateKafka(k), [k])
  const build = useCallback((w: number, t: VizTheme) => lagChart(r, k, w, t), [r, k])
  const consumersNow = k.consumers + (k.scaleOut ? EXTRA_CONSUMERS : 0)
  const owner = assign(k.partitions, consumersNow)

  const panel = (
    <>
      <Slider label="Partitions" value={k.partitions} onChange={set('partitions')} min={1} max={12} step={1} format={String} />
      <Slider label="Consumers in the group" value={k.consumers} onChange={set('consumers')} min={1} max={12} step={1} format={String} hint="each handles 1,500 msg/s" />
      <Slider label="Producer rate" value={k.rate} onChange={set('rate')} min={1000} max={15000} step={500} format={(v) => `${int(v)}/s`} />
      <Slider label="Traffic on one hot key" value={k.hotShare} onChange={set('hotShare')} min={0} max={0.6} step={0.05} format={(v) => `${Math.round(v * 100)}%`} />
      <Toggle label={`Scale out by ${EXTRA_CONSUMERS} at ${SCALE_AT} s`} checked={k.scaleOut} onChange={set('scaleOut')} />
      {k.scaleOut && (
        <Choice
          label="Rebalance protocol"
          value={k.protocol}
          onChange={set('protocol')}
          options={[
            { value: 'eager', label: 'eager (stop the world)' },
            { value: 'cooperative', label: 'cooperative-sticky' },
          ]}
        />
      )}
      <ResetButton onClick={() => setK(DEFAULTS)} />
    </>
  )

  return (
    <ModuleLayout
      controls={panel}
      onPreset={(p) => setK({ ...DEFAULTS, ...(p as Partial<KafkaParams>) })}
      play={
        <>
          <StatRow>
            <Stat label="Lag after 5 minutes" value={int(r.finalLag)} note={r.finalLag ? `${(r.finalLag / k.rate).toFixed(0)} s of traffic behind` : 'keeping up'} />
            <Stat label="Peak lag" value={int(r.maxLag)} note="messages waiting" />
            <Stat label="Idle consumers" value={String(r.idleConsumers)} note={`${consumersNow} consumers, ${k.partitions} partitions`} />
          </StatRow>
          <div className={styles.group} aria-label="Partition assignment">
            {Array.from({ length: Math.min(consumersNow, 15) }, (_, c) => {
              const mine = owner.flatMap((o, p) => (o === c ? [p] : []))
              const load = mine.reduce((a, p) => a + r.inbound[p], 0)
              const over = load > k.capacity
              return (
                <div key={c} className={`${styles.consumer} ${mine.length === 0 ? styles.idle : over ? styles.over : ''}`}>
                  <strong>consumer {c}</strong>
                  <div>{mine.length ? mine.map((p) => <span key={p} className={styles.part}>P{p}</span>) : <em>idle</em>}</div>
                  <small>
                    {int(Math.round(load))}/s of 1,500 {over ? '✗ overloaded' : ''}
                  </small>
                </div>
              )
            })}
          </div>
          <PlotFigure build={build} label="Messages waiting to be consumed, hot partition 0 vs the rest" />
        </>
      }
    />
  )
}
