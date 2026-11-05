import * as Plot from '@observablehq/plot'
import { useCallback, useMemo, useState } from 'react'
import { ResetButton } from '../../components/Controls.tsx'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import PlotFigure from '../../components/PlotFigure.tsx'
import Slider from '../../components/Slider.tsx'
import type { VizTheme } from '../../components/vizTheme.ts'
import { apply, BASE, decompose, type Decomposition } from '../../core/metricTree.ts'
import Flow from '../../visuals/diagram/Flow.tsx'

interface Controls {
  organicSessions: number
  paidSessions: number
  emailSessions: number
  organicConv: number
  paidConv: number
  emailConv: number
  price: number
}
const DEFAULTS: Controls = { organicSessions: 0, paidSessions: 0, emailSessions: 0, organicConv: 0, paidConv: 0, emailConv: 0, price: 0 }

const money = (v: number) => `${v < 0 ? '−' : ''}$${Math.abs(Math.round(v)).toLocaleString('en-US')}`
const signedMoney = (v: number) => `${v >= 0 ? '+' : '−'}$${Math.abs(Math.round(v)).toLocaleString('en-US')}`
const pct = (v: number) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`

function waterfall(d: Decomposition, width: number, t: VizTheme): Plot.PlotOptions {
  const steps = [
    { label: 'last week', delta: d.before.revenue, kind: 'total' },
    { label: 'traffic', delta: d.traffic, kind: 'step' },
    { label: 'channel mix', delta: d.mix, kind: 'step' },
    { label: 'conversion within channels', delta: d.rate, kind: 'step' },
    { label: 'order value', delta: d.aov, kind: 'step' },
    { label: 'this week', delta: d.after.revenue, kind: 'total' },
  ]
  // running totals, so the axis can start just below the lowest point and the steps stay visible
  const levels = [d.before.revenue]
  for (const s of steps.slice(1, -1)) levels.push(levels[levels.length - 1] + s.delta)
  const floor = Math.max(0, Math.min(...levels, d.after.revenue) * 0.85)
  let run = 0
  const data = steps.map((s) => {
    if (s.kind === 'total') {
      run = s.delta
      return { ...s, y1: floor, y2: s.delta, fill: t.neutral }
    }
    const y1 = run
    run += s.delta
    return { ...s, y1, y2: run, fill: s.delta >= 0 ? t.series1 : t.series2 }
  })
  return {
    width,
    height: 260,
    marginBottom: 40,
    x: { domain: steps.map((s) => s.label), label: null, tickFormat: (s: string) => (s.length > 14 ? s.replace(' within ', '\nwithin ') : s) },
    y: { label: '↑ weekly revenue', grid: true, domain: [floor, Math.max(...levels, d.after.revenue) * 1.06], tickFormat: (v: number) => `$${Math.round(v / 1000)}k` },
    marks: [
      Plot.rectY(data, { x: 'label', y1: 'y1', y2: 'y2', fill: 'fill', inset: 6 }),
      Plot.text(data, { x: 'label', y: (x) => Math.max(x.y1, x.y2), dy: -8, text: (x) => (x.kind === 'total' ? money(x.delta) : signedMoney(x.delta)), fill: t.ink, fontSize: 11 }),
    ],
  }
}

export default function MetricTrees() {
  const [c, setC] = useState(DEFAULTS)
  const set = <K extends keyof Controls>(k: K) => (v: Controls[K]) => setC((s) => ({ ...s, [k]: v }))
  const d = useMemo(() => {
    const after = apply(BASE, {
      sessions: { organic: c.organicSessions, paid: c.paidSessions, email: c.emailSessions },
      conversion: { organic: c.organicConv, paid: c.paidConv, email: c.emailConv },
      aov: { organic: c.price, paid: c.price, email: c.price },
    })
    return decompose(BASE, after)
  }, [c])
  const wf = useCallback((w: number, t: VizTheme) => waterfall(d, w, t), [d])

  const node = (id: string, label: string, before: string, after: string, contrib: number | null, col: number, row: number) => ({
    id,
    label: `${label} ${contrib == null ? '' : signedMoney(contrib)}`,
    sub: `${before} → ${after}`,
    col,
    row,
  })
  const b = d.before
  const a = d.after
  const nodes = [
    node('rev', 'Revenue', money(b.revenue), money(a.revenue), a.revenue - b.revenue, 0, 1),
    node('ses', 'Sessions', b.sessions.toLocaleString('en-US'), Math.round(a.sessions).toLocaleString('en-US'), d.traffic, 1, 0),
    node('conv', 'Conversion', `${(b.conversion * 100).toFixed(2)}%`, `${(a.conversion * 100).toFixed(2)}%`, d.mix + d.rate, 1, 1),
    node('aov', 'Order value', `$${b.aov.toFixed(2)}`, `$${a.aov.toFixed(2)}`, d.aov, 1, 2),
    { id: 'mix', label: `Channel mix ${signedMoney(d.mix)}`, sub: 'who arrives', col: 2, row: 1 },
    { id: 'rate', label: `Within-channel ${signedMoney(d.rate)}`, sub: 'how each channel converts', col: 2, row: 2 },
  ]
  const neg = [['rev', a.revenue - b.revenue], ['ses', d.traffic], ['conv', d.mix + d.rate], ['aov', d.aov], ['mix', d.mix], ['rate', d.rate]]
    .filter(([, v]) => (v as number) < -0.5)
    .map(([k]) => k as string)

  const s = (k: keyof Controls, label: string, min = -0.5, max = 1) => <Slider label={label} value={c[k]} onChange={set(k)} min={min} max={max} step={0.05} format={pct} />
  const panel = (
    <>
      <p className="lede" style={{ margin: 0 }}>
        <strong>Sessions</strong>
      </p>
      {s('organicSessions', 'Organic')}
      {s('paidSessions', 'Paid')}
      {s('emailSessions', 'Email')}
      <p className="lede" style={{ margin: 0 }}>
        <strong>Conversion rate</strong>
      </p>
      {s('organicConv', 'Organic (base 3%)', -0.5, 0.5)}
      {s('paidConv', 'Paid (base 1.5%)', -0.5, 0.5)}
      {s('emailConv', 'Email (base 5%)', -0.5, 0.5)}
      {s('price', 'Prices (all channels)', -0.3, 0.3)}
      <ResetButton onClick={() => setC(DEFAULTS)} />
    </>
  )

  return (
    <ModuleLayout
      controls={panel}
      onPreset={(p) => setC({ ...DEFAULTS, ...(p as Partial<Controls>) })}
      play={
        <>
          <Flow
            props={{
              nodes,
              edges: [
                { from: 'rev', to: 'ses' },
                { from: 'rev', to: 'conv' },
                { from: 'rev', to: 'aov' },
                { from: 'conv', to: 'mix' },
                { from: 'conv', to: 'rate' },
              ],
              compact: true,
            }}
            state={{ bad: neg }}
          />
          <PlotFigure build={wf} label="Where this week's revenue change came from (blue up, orange down; the axis starts near the data)" />
        </>
      }
    />
  )
}
