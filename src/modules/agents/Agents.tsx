import * as Plot from '@observablehq/plot'
import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import { ResetButton, SeedControl } from '../../components/Controls.tsx'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import PlotFigure from '../../components/PlotFigure.tsx'
import Slider from '../../components/Slider.tsx'
import { Stat, StatRow } from '../../components/Stat.tsx'
import type { VizTheme } from '../../components/vizTheme.ts'
import { noRecovery, simulateAgents, withRecovery, type AgentParams } from '../../core/ai/agents.ts'
import { mulberry32 } from '../../core/random.ts'
import { pct } from '../../format.ts'
import styles from '../common.module.css'

interface Controls {
  steps: number
  p: number
  detect: number
  slack: number
  seed: number
}

const DEFAULTS: Controls = { steps: 10, p: 0.95, detect: 0, slack: 2, seed: 1 }
const OUTCOMES = ['success', 'silent failure', 'out of budget'] as const

/** Trace of individual runs, call by call: ok, caught-and-retried, or a silent failure. */
function traces(a: AgentParams, n: number, seed: number) {
  const rng = mulberry32(seed)
  const rows: { run: number; call: number; kind: string }[] = []
  for (let r = 0; r < n; r++) {
    let done = 0
    let calls = 0
    while (done < a.steps && calls < a.budget) {
      calls++
      if (rng() < a.p) {
        done++
        rows.push({ run: r, call: calls, kind: 'step ok' })
      } else if (rng() < a.detect) rows.push({ run: r, call: calls, kind: 'error caught, retried' })
      else {
        rows.push({ run: r, call: calls, kind: 'silent error ✗' })
        break
      }
    }
  }
  return rows
}

export default function Agents() {
  const [c, setC] = useState(DEFAULTS)
  const deferred = useDeferredValue(c)
  const stale = deferred !== c
  const set = <K extends keyof Controls>(k: K) => (v: Controls[K]) => setC((s) => ({ ...s, [k]: v }))
  const params = useMemo<AgentParams>(
    () => ({ steps: deferred.steps, p: deferred.p, detect: deferred.detect, budget: Math.ceil(deferred.steps * deferred.slack) }),
    [deferred.steps, deferred.p, deferred.detect, deferred.slack],
  )
  const sim = useMemo(() => simulateAgents(params, 3000, mulberry32(deferred.seed)), [params, deferred.seed])
  const trace = useMemo(() => traces(params, 24, deferred.seed + 1), [params, deferred.seed])

  const buildOutcomes = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const data = [
        { o: 'success', v: sim.success },
        { o: 'silent failure', v: sim.silent },
        { o: 'out of budget', v: sim.budget },
      ]
      return {
        width,
        height: 90,
        marginLeft: 10,
        x: { domain: [0, 1], tickFormat: '.0%', label: 'share of 3,000 runs →' },
        y: { axis: null },
        color: { domain: [...OUTCOMES], range: [t.series3, '#d03b3b', t.series2], legend: true },
        marks: [Plot.barX(data, Plot.stackX({ x: 'v', fill: 'o', tip: { format: { x: '.1%' } }, inset: 1 }))],
      }
    },
    [sim],
  )

  const buildCurve = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const ks = Array.from({ length: 30 }, (_, i) => i + 1)
      const lines = [
        ...[0.9, 0.95, 0.99].map((p) => ({ name: `p = ${p}, no checks`, f: (k: number) => noRecovery(p, k) })),
        { name: `your agent (p = ${deferred.p}, catches ${pct(deferred.detect, 0)})`, f: (k: number) => withRecovery(deferred.p, deferred.detect, k) },
      ]
      const data = lines.flatMap((l) => ks.map((k) => ({ k, s: l.f(k), name: l.name })))
      return {
        width,
        height: 260,
        x: { label: 'steps in the task →' },
        y: { domain: [0, 1], tickFormat: '.0%', label: '↑ tasks completed correctly', grid: true },
        color: { domain: lines.map((l) => l.name), range: [t.neutral, t.series1, t.series3, t.series2], legend: true },
        marks: [
          Plot.ruleX([deferred.steps], { stroke: t.inkSecondary, strokeDasharray: '4 3' }),
          Plot.line(data, { x: 'k', y: 's', stroke: 'name', strokeWidth: (d: { name: string }) => (d.name.startsWith('your') ? 3 : 1.5) }),
          Plot.tip(data, Plot.pointerX({ x: 'k', y: 's', stroke: 'name', format: { y: '.1%' } })),
        ],
      }
    },
    [deferred.p, deferred.detect, deferred.steps],
  )

  const buildTrace = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => ({
      width,
      height: 24 * 14 + 50,
      marginLeft: 40,
      x: { label: 'tool call →', tickFormat: 'd' },
      y: { label: 'run', tickFormat: (d: number) => `#${d + 1}`, domain: Array.from({ length: 24 }, (_, i) => i) },
      color: { domain: ['step ok', 'error caught, retried', 'silent error ✗'], range: [t.series3, t.series2, '#d03b3b'], legend: true },
      marks: [Plot.cell(trace, { x: 'call', y: 'run', fill: 'kind', inset: 1, rx: 2 })],
    }),
    [trace],
  )

  const panel = (
    <>
      <Slider label="Steps in the task" value={c.steps} onChange={set('steps')} min={1} max={30} step={1} format={String} />
      <Slider label="Per-step success (p)" value={c.p} onChange={set('p')} min={0.7} max={0.999} step={0.001} format={(v) => pct(v, 1)} />
      <Slider label="Errors caught and retried" value={c.detect} onChange={set('detect')} min={0} max={1} step={0.05} format={(v) => pct(v, 0)} hint="validators, checking tool results" />
      <Slider label="Step budget" value={c.slack} onChange={set('slack')} min={1} max={3} step={0.1} format={(v) => `${v.toFixed(1)}× the steps`} />
      <SeedControl seed={c.seed} onChange={set('seed')} />
      <ResetButton onClick={() => setC(DEFAULTS)} />
    </>
  )

  return (
    <ModuleLayout
      controls={panel}
      onPreset={(p) => setC({ ...DEFAULTS, ...(p as Partial<Controls>) })}
      play={
        <div className={stale ? styles.stale : undefined}>
          <h3>3,000 runs of the same task</h3>
          <StatRow>
            <Stat label="Tasks completed correctly" value={pct(sim.success, 1)} note={`no-check theory: ${pct(noRecovery(deferred.p, deferred.steps), 1)}`} />
            <Stat label="Tool calls per run" value={sim.meanCalls.toFixed(1)} note={`budget ${params.budget}`} />
            <Stat label="Calls per successful task" value={sim.success ? (sim.meanCalls / sim.success).toFixed(1) : '∞'} note="what you actually pay for" />
          </StatRow>
          <PlotFigure build={buildOutcomes} label="Share of runs that succeed, fail silently or run out of budget" />
          <h3>Reliability compounds</h3>
          <PlotFigure build={buildCurve} label="Task success against number of steps for several per-step reliabilities" />
        </div>
      }
      breakIt={
        <div className={stale ? styles.stale : undefined}>
          <h3>24 runs, call by call</h3>
          <PlotFigure build={buildTrace} label="Trace of individual agent runs" />
          <p className="lede">Green steps move the task forward, orange ones were wrong but caught and retried, and red ones were wrong and nobody noticed. Everything after a red call builds on a bad result.</p>
        </div>
      }
    />
  )
}
