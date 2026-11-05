import * as Plot from '@observablehq/plot'
import { useCallback, useState } from 'react'
import { Choice, ResetButton, Toggle } from '../../components/Controls.tsx'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import PlotFigure from '../../components/PlotFigure.tsx'
import Slider from '../../components/Slider.tsx'
import { Stat, StatRow } from '../../components/Stat.tsx'
import type { VizTheme } from '../../components/vizTheme.ts'
import { latency, monthlyCost, TIERS, type Workload } from '../../core/ai/cost.ts'
import { int, pct } from '../../format.ts'

type TierKey = keyof typeof TIERS
interface Controls extends Workload {
  tier: TierKey
}

const DEFAULTS: Controls = { tier: 'medium', requestsPerDay: 10_000, inputTokens: 3000, outputTokens: 400, cacheHit: 0, cacheDiscount: 0.1, batch: false, routedToSmall: 0 }
const usd = (x: number) => (x >= 10_000 ? `$${(x / 1000).toFixed(0)}k` : x >= 100 ? `$${x.toFixed(0)}` : x >= 1 ? `$${x.toFixed(2)}` : `$${x.toFixed(4)}`)

export default function LlmCost() {
  const [c, setC] = useState(DEFAULTS)
  const set = <K extends keyof Controls>(k: K) => (v: Controls[K]) => setC((s) => ({ ...s, [k]: v }))
  const tier = TIERS[c.tier]
  const cost = monthlyCost(tier, c)
  const lat = latency(tier, c.inputTokens, c.outputTokens, c.cacheHit)

  const buildCost = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const data = [
        { part: 'input tokens', v: cost.input },
        { part: 'cached input', v: cost.cached },
        { part: 'output tokens', v: cost.output },
      ]
      return {
        width,
        height: 90,
        marginLeft: 10,
        x: { label: 'monthly cost (USD) →', tickFormat: (d: number) => usd(d) },
        y: { axis: null },
        color: { domain: data.map((d) => d.part), range: [t.series1, t.series3, t.series2], legend: true },
        marks: [Plot.barX(data, Plot.stackX({ x: 'v', fill: 'part', inset: 1, tip: { format: { x: (d: number) => usd(d) } } }))],
      }
    },
    [cost],
  )

  const buildLatency = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const data = (Object.keys(TIERS) as TierKey[]).flatMap((k) => {
        const l = latency(TIERS[k], c.inputTokens, c.outputTokens, c.cacheHit)
        return [
          { tier: k, part: 'time to first token', v: l.ttft },
          { tier: k, part: 'generating the answer', v: l.total - l.ttft },
        ]
      })
      return {
        width,
        height: 150,
        marginLeft: 70,
        x: { label: 'seconds →', grid: true },
        y: { label: null, domain: Object.keys(TIERS) },
        color: { domain: ['time to first token', 'generating the answer'], range: [t.series1, t.series2], legend: true },
        marks: [Plot.barX(data, Plot.stackX({ y: 'tier', x: 'v', fill: 'part', inset: 1, tip: { format: { x: '.2f' } } }))],
      }
    },
    [c.inputTokens, c.outputTokens, c.cacheHit],
  )

  const buildSweep = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const sizes = [200, 500, 1000, 2000, 5000, 10_000, 30_000, 100_000]
      const data = (Object.keys(TIERS) as TierKey[]).flatMap((k) => sizes.map((s) => ({ tier: k, size: s, cost: monthlyCost(TIERS[k], { ...c, inputTokens: s }).total })))
      return {
        width,
        height: 240,
        x: { type: 'log', label: 'input tokens per request (prompt + context, log) →' },
        y: { type: 'log', label: '↑ monthly cost (log)', grid: true, tickFormat: (d: number) => usd(d) },
        color: { domain: Object.keys(TIERS), range: [t.series3, t.series1, t.series2], legend: true },
        marks: [
          Plot.ruleX([c.inputTokens], { stroke: t.inkSecondary, strokeDasharray: '4 3' }),
          Plot.line(data, { x: 'size', y: 'cost', stroke: 'tier', strokeWidth: 2 }),
          Plot.dot(data, { x: 'size', y: 'cost', fill: 'tier', r: 3, tip: { format: { y: (d: number) => usd(d) } } }),
        ],
      }
    },
    [c],
  )

  const panel = (
    <>
      <Choice
        label="Model tier"
        value={c.tier}
        onChange={set('tier')}
        options={(Object.keys(TIERS) as TierKey[]).map((k) => ({ value: k, label: k }))}
        hint={`$${tier.inPrice} in / $${tier.outPrice} out per M tokens (illustrative)`}
      />
      <Slider label="Requests per day" value={c.requestsPerDay} onChange={set('requestsPerDay')} min={10} max={1_000_000} step={1} log format={int} />
      <Slider label="Input tokens per request" value={c.inputTokens} onChange={set('inputTokens')} min={100} max={200_000} step={1} log format={int} hint="system prompt + history + retrieved context" />
      <Slider label="Output tokens per request" value={c.outputTokens} onChange={set('outputTokens')} min={10} max={4000} step={1} log format={int} />
      <Slider label="Input served from cache" value={c.cacheHit} onChange={set('cacheHit')} min={0} max={0.95} step={0.05} format={(v) => pct(v, 0)} />
      <Slider label="Requests routed to the small model" value={c.routedToSmall} onChange={set('routedToSmall')} min={0} max={1} step={0.05} format={(v) => pct(v, 0)} />
      <Toggle label="Batch (asynchronous, half price)" checked={c.batch} onChange={set('batch')} />
      <ResetButton onClick={() => setC(DEFAULTS)} />
    </>
  )

  return (
    <ModuleLayout
      controls={panel}
      onPreset={(p) => setC({ ...DEFAULTS, ...(p as Partial<Controls>) })}
      play={
        <>
          <StatRow>
            <Stat label="Per month" value={usd(cost.total)} note={`${int(c.requestsPerDay * 30)} requests`} />
            <Stat label="Per request" value={usd(cost.perRequest)} />
            <Stat label="Time to first token" value={`${lat.ttft.toFixed(2)} s`} />
            <Stat label="Full answer" value={`${lat.total.toFixed(1)} s`} note={`${c.outputTokens} tokens at ${tier.outPerSec}/s`} />
          </StatRow>
          <h3>Where the money goes</h3>
          <PlotFigure build={buildCost} label="Monthly cost split into input, cached input and output tokens" />
          <h3>Where the time goes</h3>
          <PlotFigure build={buildLatency} label="Latency split into time to first token and generation, per tier" />
        </>
      }
      breakIt={
        <>
          <h3>Context size drives the bill</h3>
          <PlotFigure build={buildSweep} label="Monthly cost against input tokens per request for each tier" />
          <p className="lede">Cost grows linearly with tokens on every tier; the tiers differ by a constant factor. Stuffing more context into every request is the most common way an LLM feature’s cost explodes.</p>
        </>
      }
    />
  )
}
