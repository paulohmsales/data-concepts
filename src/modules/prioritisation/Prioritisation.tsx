import * as Plot from '@observablehq/plot'
import { useCallback, useMemo, useState } from 'react'
import { Choice, ResetButton } from '../../components/Controls.tsx'
import DataTable from '../../components/DataTable.tsx'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import PlotFigure from '../../components/PlotFigure.tsx'
import Slider from '../../components/Slider.tsx'
import { Stat, StatRow } from '../../components/Stat.tsx'
import type { VizTheme } from '../../components/vizTheme.ts'
import { HORIZON, order, plan, type Order, type Plan } from '../../core/prioritise.ts'
import { int } from '../../format.ts'

interface Controls {
  order: Order
  wip: number
  switchCost: number
}
const DEFAULTS: Controls = { order: 'requested', wip: 1, switchCost: 0.15 }
const ORDERS: { value: Order; label: string }[] = [
  { value: 'requested', label: 'as requested' },
  { value: 'value', label: 'highest value first' },
  { value: 'shortest', label: 'shortest first' },
  { value: 'biggest', label: 'big bets first' },
  { value: 'wsjf', label: 'WSJF (value ÷ weeks)' },
]

function curves(plans: Record<Order, Plan>, sel: Order, width: number, t: VizTheme): Plot.PlotOptions {
  const label = (o: Order) => ORDERS.find((x) => x.value === o)!.label
  const data = ORDERS.flatMap(({ value: o }) => plans[o].curve.map((c) => ({ ...c, o: label(o), sel: o === sel })))
  return {
    width,
    height: 240,
    x: { label: 'week →', domain: [0, HORIZON] },
    y: { label: '↑ value delivered so far ($k)', grid: true },
    marks: [
      Plot.lineY(
        data.filter((d) => !d.sel),
        { x: 'week', y: 'total', z: 'o', stroke: t.neutral, strokeWidth: 1.5 },
      ),
      Plot.text(
        ORDERS.filter((o) => o.value !== sel).map((o) => ({ o: o.label, total: plans[o.value].delivered })),
        { x: HORIZON, y: 'total', text: 'o', textAnchor: 'end', dy: -6, fill: t.muted, fontSize: 10 },
      ),
      Plot.areaY(
        data.filter((d) => d.sel),
        { x: 'week', y: 'total', fill: t.series1, fillOpacity: 0.15 },
      ),
      Plot.lineY(
        data.filter((d) => d.sel),
        { x: 'week', y: 'total', stroke: t.series1, strokeWidth: 2.5 },
      ),
      Plot.tip(data.filter((d) => d.sel), Plot.pointerX({ x: 'week', y: 'total', format: { y: ',.0f' } })),
    ],
  }
}

function gantt(p: Plan, width: number, t: VizTheme): Plot.PlotOptions {
  const data = p.deliveries.map((d) => ({ ...d }))
  return {
    width,
    height: 40 + data.length * 24,
    marginLeft: 190,
    x: { label: 'week →', domain: [0, Math.max(HORIZON, ...data.map((d) => d.finish))], grid: true },
    y: { domain: [...data].sort((a, b) => a.start - b.start || a.finish - b.finish).map((d) => d.name), label: null },
    marks: [
      Plot.ruleX([HORIZON], { stroke: t.axis, strokeDasharray: '4 3' }),
      Plot.barX(data, { x1: 'start', x2: 'finish', y: 'name', fill: t.series1, fillOpacity: 0.85, rx: 3 }),
      Plot.text(data, { x: 'finish', y: 'name', text: (d) => `wk ${d.finish.toFixed(0)}`, dx: 4, textAnchor: 'start', fill: t.inkSecondary, fontSize: 10 }),
      Plot.tip(data, Plot.pointer({ x1: 'start', x2: 'finish', y: 'name', title: (d) => `${d.name}\nweeks ${d.start.toFixed(1)}–${d.finish.toFixed(1)}\nworth $${d.value}k/week once live` })),
    ],
  }
}

export default function Prioritisation() {
  const [c, setC] = useState(DEFAULTS)
  const set = <K extends keyof Controls>(k: K) => (v: Controls[K]) => setC((s) => ({ ...s, [k]: v }))
  const plans = useMemo(() => Object.fromEntries(ORDERS.map(({ value: o }) => [o, plan(o, c.wip, c.switchCost)])) as Record<Order, Plan>, [c.wip, c.switchCost])
  const p = plans[c.order]
  const best = plans.wsjf
  const cv = useCallback((w: number, t: VizTheme) => curves(plans, c.order, w, t), [plans, c.order])
  const gt = useCallback((w: number, t: VizTheme) => gantt(p, w, t), [p])
  const rows = order(c.order).map((x, i) => ({ ...x, rank: i + 1, wsjf: x.value / x.weeks }))

  const panel = (
    <>
      <Choice label="Order the backlog by" value={c.order} onChange={set('order')} options={ORDERS} />
      <Slider label="Projects in flight at once (WIP)" value={c.wip} onChange={set('wip')} min={1} max={8} step={1} format={String} />
      <Slider label="Context-switching cost" value={c.switchCost} onChange={set('switchCost')} min={0} max={0.3} step={0.01} format={(v) => `${Math.round(v * 100)}%`} hint="capacity lost per extra project in flight" />
      <ResetButton onClick={() => setC(DEFAULTS)} />
    </>
  )

  return (
    <ModuleLayout
      controls={panel}
      onPreset={(pp) => setC({ ...DEFAULTS, ...(pp as Partial<Controls>) })}
      play={
        <>
          <StatRow>
            <Stat label="Value delivered this year" value={`$${int(Math.round(p.delivered))}k`} note={c.order === 'wsjf' && c.wip === 1 ? 'the best ordering here' : `WSJF, one at a time: $${int(Math.round(plan('wsjf', 1).delivered))}k`} />
            <Stat label="First thing ships" value={`week ${Math.min(...p.deliveries.map((d) => d.finish)).toFixed(0)}`} note={p.deliveries.reduce((a, d) => (d.finish < a.finish ? d : a)).name} />
            <Stat label="Lost to waiting" value={`$${int(Math.round(p.lost))}k`} note={`vs $${int(Math.round(best.lost))}k with WSJF at this WIP`} />
          </StatRow>
          <PlotFigure build={cv} label="Cumulative value: the selected ordering (blue) vs the others (grey)" />
          <PlotFigure build={gt} label="When each project is worked on and ships (dashed line: end of the year)" />
          <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            caption="The backlog in the selected order"
            columns={[
              { key: 'rank', label: '#', align: 'right', render: (r) => String(r.rank) },
              { key: 'name', label: 'Project', render: (r) => r.name },
              { key: 'value', label: 'Cost of delay ($k/week)', align: 'right', render: (r) => String(r.value) },
              { key: 'weeks', label: 'Weeks', align: 'right', render: (r) => String(r.weeks) },
              { key: 'wsjf', label: 'WSJF', align: 'right', render: (r) => r.wsjf.toFixed(2) },
            ]}
          />
        </>
      }
    />
  )
}
