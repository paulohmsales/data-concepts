import * as Plot from '@observablehq/plot'
import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import { ResetButton, SeedControl, Toggle } from '../../components/Controls.tsx'
import DataTable from '../../components/DataTable.tsx'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import PlotFigure from '../../components/PlotFigure.tsx'
import Slider from '../../components/Slider.tsx'
import { Stat, StatRow } from '../../components/Stat.tsx'
import Status from '../../components/Status.tsx'
import type { VizTheme } from '../../components/vizTheme.ts'
import { kappa, pairedTest, simulateEval, wilson, type EvalParams } from '../../core/ai/evals.ts'
import { mulberry32 } from '../../core/random.ts'
import { int, pct, pValue, pp } from '../../format.ts'
import styles from '../common.module.css'

interface Controls extends EvalParams {
  seed: number
}

const DEFAULTS: Controls = { n: 50, passA: 0.7, passB: 0.75, judgeAccuracy: 0.85, verbosityBias: 0, positionBias: 0, swap: false, seed: 1 }
const NS = [10, 20, 50, 100, 200, 500, 1000, 2000]

export default function LlmEvals() {
  const [c, setC] = useState(DEFAULTS)
  const deferred = useDeferredValue(c)
  const stale = deferred !== c
  const set = <K extends keyof Controls>(k: K) => (v: Controls[K]) => setC((s) => ({ ...s, [k]: v }))
  const items = useMemo(() => simulateEval(deferred, mulberry32(deferred.seed)), [deferred])
  const count = (f: (i: (typeof items)[number]) => boolean) => items.filter(f).length
  const n = items.length
  const rates = [
    { who: 'humans', prompt: 'A', k: count((i) => i.a) },
    { who: 'humans', prompt: 'B', k: count((i) => i.b) },
    { who: 'LLM judge', prompt: 'A', k: count((i) => i.judgeA) },
    { who: 'LLM judge', prompt: 'B', k: count((i) => i.judgeB) },
  ].map((r) => ({ ...r, rate: r.k / n, ci: wilson(r.k, n), label: `${r.prompt} · ${r.who}` }))
  const humanTest = pairedTest(items)
  const judgeTest = pairedTest(items.map((i) => ({ a: i.judgeA, b: i.judgeB })))
  const k = kappa(items.map((i) => i.a), items.map((i) => i.judgeA))
  const winB = items.reduce((s, i) => s + i.prefersB, 0) / n

  const buildRates = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => ({
      width,
      height: 200,
      marginLeft: 130,
      x: { domain: [0, 1], tickFormat: '.0%', label: 'pass rate with 95% interval →', grid: true },
      y: { domain: rates.map((r) => r.label), label: null },
      color: { domain: ['A', 'B'], range: [t.series1, t.series2] },
      marks: [
        Plot.ruleY(rates, { y: 'label', x1: (r: (typeof rates)[number]) => r.ci[0], x2: (r: (typeof rates)[number]) => r.ci[1], stroke: 'prompt', strokeWidth: 3 }),
        Plot.dot(rates, { y: 'label', x: 'rate', fill: 'prompt', r: 6, stroke: t.surface, strokeWidth: 2, tip: { format: { x: '.1%' } } }),
        Plot.ruleX([deferred.passA], { stroke: t.series1, strokeDasharray: '3 3' }),
        Plot.ruleX([deferred.passB], { stroke: t.series2, strokeDasharray: '3 3' }),
      ],
    }),
    [rates, deferred.passA, deferred.passB],
  )

  const buildN = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const pts = NS.map((m) => {
        const [lo, hi] = wilson(Math.round(m * 0.7), m)
        return { n: m, half: (hi - lo) / 2 }
      })
      return {
        width,
        height: 200,
        x: { type: 'log', label: 'eval items (log) →' },
        y: { tickFormat: '.0%', label: '↑ ± margin on a 70% pass rate', grid: true },
        marks: [
          Plot.axisX(NS, { tickFormat: (d: number) => String(d) }),
          Plot.ruleX([deferred.n], { stroke: t.inkSecondary, strokeDasharray: '4 3' }),
          Plot.line(pts, { x: 'n', y: 'half', stroke: t.series1, strokeWidth: 2 }),
          Plot.dot(pts, { x: 'n', y: 'half', fill: t.series1, r: 4, tip: { format: { y: '.1%' } } }),
        ],
      }
    },
    [deferred.n],
  )

  const panel = (
    <>
      <Slider label="Eval items" value={c.n} onChange={set('n')} min={10} max={2000} step={1} log format={int} />
      <Slider label="True pass rate, prompt A" value={c.passA} onChange={set('passA')} min={0.3} max={0.95} step={0.01} format={(v) => pct(v, 0)} />
      <Slider label="True pass rate, prompt B" value={c.passB} onChange={set('passB')} min={0.3} max={0.95} step={0.01} format={(v) => pct(v, 0)} />
      <strong>The LLM judge</strong>
      <Slider label="Agreement with humans" value={c.judgeAccuracy} onChange={set('judgeAccuracy')} min={0.6} max={1} step={0.01} format={(v) => pct(v, 0)} />
      <Slider label="Verbosity bias (B is wordier)" value={c.verbosityBias} onChange={set('verbosityBias')} min={0} max={0.3} step={0.01} format={(v) => pct(v, 0)} />
      <Slider label="Position bias (prefers first shown)" value={c.positionBias} onChange={set('positionBias')} min={0} max={0.3} step={0.01} format={(v) => pct(v, 0)} />
      <Toggle label="Ask twice, swapping the order" checked={c.swap} onChange={set('swap')} />
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
          <h3>Is B really better than A?</h3>
          <p className="lede">
            Two prompts answered the same {int(n)} eval questions. Dashed lines: the true pass rates, which no real eval knows.
          </p>
          <PlotFigure build={buildRates} label="Pass rates of both prompts by humans and by the LLM judge, with intervals" />
          <StatRow>
            <Stat label="B − A (human labels)" value={pp(humanTest.diff, 1)} note={<>paired p {pValue(humanTest.p)} · {humanTest.discordant} items disagree</>} />
            <Stat label="B − A (LLM judge)" value={pp(judgeTest.diff, 1)} note={<>paired p {pValue(judgeTest.p)}</>} />
            <Stat
              label="Verdict at 5%"
              value={humanTest.p < 0.05 ? <Status level="good">B wins</Status> : <Status level="warn">can’t tell</Status>}
              note={`true gap ${pp(deferred.passB - deferred.passA, 0)}`}
            />
          </StatRow>
          <h3>How many items do you need?</h3>
          <PlotFigure build={buildN} label="Margin of error of a pass rate against the number of eval items" />
        </div>
      }
      breakIt={
        <div className={stale ? styles.stale : undefined}>
          <h3>Can we trust the judge?</h3>
          <DataTable
            caption="Prompt A’s answers: human label vs LLM judge"
            rows={[
              { h: 'human: pass', jp: count((i) => i.a && i.judgeA), jf: count((i) => i.a && !i.judgeA) },
              { h: 'human: fail', jp: count((i) => !i.a && i.judgeA), jf: count((i) => !i.a && !i.judgeA) },
            ]}
            rowKey={(r) => r.h}
            columns={[
              { key: 'h', label: '', render: (r) => r.h },
              { key: 'p', label: 'judge: pass', align: 'right', render: (r) => r.jp },
              { key: 'f', label: 'judge: fail', align: 'right', render: (r) => r.jf },
            ]}
          />
          <StatRow>
            <Stat label="Raw agreement" value={pct(count((i) => i.a === i.judgeA) / n, 0)} />
            <Stat label="Cohen’s κ" value={k.toFixed(2)} note={k > 0.8 ? <Status level="good">strong</Status> : k > 0.6 ? <Status level="warn">moderate</Status> : <Status level="bad">weak</Status>} />
            <Stat label="Pairwise: judge prefers B" value={pct(winB, 0)} note={deferred.swap ? 'order swapped and averaged' : 'A always shown first'} />
          </StatRow>
        </div>
      }
    />
  )
}
