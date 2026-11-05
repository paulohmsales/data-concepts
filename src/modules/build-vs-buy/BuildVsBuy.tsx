import * as Plot from '@observablehq/plot'
import { useCallback, useMemo, useState } from 'react'
import { ResetButton } from '../../components/Controls.tsx'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import PlotFigure from '../../components/PlotFigure.tsx'
import Slider from '../../components/Slider.tsx'
import { Stat, StatRow } from '../../components/Stat.tsx'
import type { VizTheme } from '../../components/vizTheme.ts'
import { DEFAULTS, MONTHS, simulate, type BuildBuyParams, type BuildBuyResult } from '../../core/buildBuy.ts'

const k = (v: number) => `${v < 0 ? '−' : ''}$${Math.round(Math.abs(v) / 1000).toLocaleString('en-US')}k`

function chart(r: BuildBuyResult, p: BuildBuyParams, width: number, t: VizTheme): Plot.PlotOptions {
  const data = r.months.flatMap((m) => [
    { month: m.month, v: m.build, option: 'build' },
    { month: m.month, v: m.buy, option: 'buy' },
  ])
  return {
    width,
    height: 280,
    x: { label: 'month →', domain: [0, MONTHS], ticks: [0, 6, 12, 18, 24, 30, 36] },
    y: { label: '↑ cumulative value minus cost', grid: true, tickFormat: (v: number) => k(v) },
    color: { domain: ['build', 'buy'], range: [t.series2, t.series1], legend: true },
    marks: [
      Plot.ruleY([0], { stroke: t.ink }),
      Plot.ruleX([p.buildMonths], { stroke: t.series2, strokeDasharray: '3 3', strokeOpacity: 0.7 }),
      Plot.text([p.buildMonths], { x: (d: number) => d, frameAnchor: 'bottom', dx: 4, dy: -4, textAnchor: 'start', text: () => 'build goes live', fill: t.inkSecondary, fontSize: 10 }),
      Plot.lineY(data, { x: 'month', y: 'v', stroke: 'option', strokeWidth: 2.5 }),
      ...(r.crossover ? [Plot.dot([r.crossover], { x: (d: number) => d, y: () => r.months[r.crossover!].build, r: 6, stroke: t.ink, fill: t.surface })] : []),
      Plot.tip(data, Plot.pointerX({ x: 'month', y: 'v', stroke: 'option', format: { y: (v: number) => k(v) } })),
    ],
  }
}

export default function BuildVsBuy() {
  const [c, setC] = useState(DEFAULTS)
  const set = <K extends keyof BuildBuyParams>(key: K) => (v: BuildBuyParams[K]) => setC((s) => ({ ...s, [key]: v }))
  const r = useMemo(() => simulate(c), [c])
  const build = useCallback((w: number, t: VizTheme) => chart(r, c, w, t), [r, c])
  const winner = r.buildNet > r.buyNet ? 'build' : 'buy'

  const money = (key: keyof BuildBuyParams, label: string, min: number, max: number, step: number, hint?: string) => (
    <Slider label={label} value={c[key]} onChange={set(key)} min={min} max={max} step={step} format={(v) => `$${(v / 1000).toFixed(0)}k`} hint={hint} />
  )
  const panel = (
    <>
      {money('valuePerMonth', 'Value per month once live', 0, 150_000, 5_000)}
      <p className="lede" style={{ margin: 0 }}>
        <strong>Build</strong>
      </p>
      <Slider label="Team" value={c.buildTeam} onChange={set('buildTeam')} min={1} max={8} step={1} format={(v) => `${v} engineers`} />
      <Slider label="Time to build" value={c.buildMonths} onChange={set('buildMonths')} min={1} max={18} step={1} format={(v) => `${v} months`} />
      <Slider label="Maintenance after launch" value={c.maintFte} onChange={set('maintFte')} min={0} max={4} step={0.25} format={(v) => `${v} FTE`} />
      <p className="lede" style={{ margin: 0 }}>
        <strong>Buy</strong>
      </p>
      {money('licencePerMonth', 'Licence per month (today)', 1_000, 40_000, 1_000)}
      <Slider label="Usage growth" value={c.usageGrowth} onChange={set('usageGrowth')} min={0} max={1.5} step={0.05} format={(v) => `${Math.round(v * 100)}% / year`} hint="usage-based pricing grows with you" />
      <Slider label="Vendor price rises" value={c.priceRise} onChange={set('priceRise')} min={0} max={0.3} step={0.01} format={(v) => `${Math.round(v * 100)}% / year`} />
      {money('engineerMonth', 'Engineer, fully loaded', 5_000, 30_000, 1_000, 'per month')}
      {money('opportunity', 'Opportunity cost', 0, 60_000, 5_000, 'value an engineer-month would create elsewhere')}
      <ResetButton onClick={() => setC(DEFAULTS)} />
    </>
  )

  return (
    <ModuleLayout
      controls={panel}
      onPreset={(p) => setC({ ...DEFAULTS, ...(p as Partial<BuildBuyParams>) })}
      play={
        <>
          <StatRow>
            <Stat label="After 3 years, build" value={k(r.buildNet)} note={`costs ${k(r.buildCost)}`} />
            <Stat label="After 3 years, buy" value={k(r.buyNet)} note={`costs ${k(r.buyCost)}`} />
            <Stat label="Better option" value={winner === 'build' ? 'Build' : 'Buy'} note={r.crossover ? `build overtakes buy in month ${r.crossover}` : winner === 'buy' ? 'buy leads the whole time' : 'build leads from early on'} />
          </StatRow>
          <PlotFigure build={build} label="Cumulative value delivered minus everything spent, month by month" />
        </>
      }
    />
  )
}
