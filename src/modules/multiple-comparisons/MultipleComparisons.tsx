import * as Plot from '@observablehq/plot'
import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import { Choice, ResetButton, SeedControl } from '../../components/Controls.tsx'
import ExplainBack from '../../components/ExplainBack.tsx'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import PlotFigure from '../../components/PlotFigure.tsx'
import Slider from '../../components/Slider.tsx'
import { Stat, StatRow } from '../../components/Stat.tsx'
import type { VizTheme } from '../../components/vizTheme.ts'
import { errorRates, familywise, simulateFamily, type Correction, type FamilyParams } from '../../core/multiple.ts'
import { mulberry32 } from '../../core/random.ts'
import { pct } from '../../format.ts'
import styles from '../common.module.css'

interface Controls extends FamilyParams {
  method: Correction
  seed: number
}

const DEFAULTS: Controls = { m: 20, real: 3, effectZ: 2.8, alpha: 0.05, method: 'none', seed: 1 }
const METHODS: { value: Correction; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'bonferroni', label: 'Bonferroni' },
  { value: 'holm', label: 'Holm' },
  { value: 'bh', label: 'Benjamini–Hochberg' },
]
const LABEL = Object.fromEntries(METHODS.map((m) => [m.value, m.label])) as Record<Correction, string>

function simulate(c: Controls) {
  const family = simulateFamily(c, c.method, mulberry32(c.seed))
  const rates = METHODS.map((m) => ({ method: m.value, ...errorRates(c, m.value, 1500, mulberry32(c.seed + 1)) }))
  return { family, rates }
}

export default function MultipleComparisons() {
  const [c, setC] = useState(DEFAULTS)
  const deferred = useDeferredValue(c)
  const sim = useMemo(() => simulate(deferred), [deferred])
  const stale = deferred !== c
  const set = <K extends keyof Controls>(k: K) => (v: Controls[K]) =>
    setC((s) => {
      const next = { ...s, [k]: v }
      return { ...next, real: Math.min(next.real, next.m) }
    })

  const found = sim.family.filter((t) => t.rejected)
  const falsePos = found.filter((t) => !t.real).length
  const truePos = found.length - falsePos

  const buildFamily = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const m = deferred.m
      const a = deferred.alpha
      const sorted = [...sim.family].sort((x, y) => x.p - y.p).map((d, i) => ({
        ...d,
        rank: i + 1,
        truth: d.real ? 'real effect' : 'no effect',
        verdict: d.rejected ? 'flagged significant' : 'not flagged',
      }))
      const thresholds = [
        { name: 'raw α', pts: [[1, a], [m, a]] },
        { name: 'Bonferroni α/m', pts: [[1, a / m], [m, a / m]] },
        { name: 'BH: α·rank/m', pts: Array.from({ length: m }, (_, i) => [i + 1, (a * (i + 1)) / m]) },
      ]
      return {
        width,
        height: 300,
        x: { label: 'tests, sorted by p-value (rank) →', domain: [0.5, m + 0.5] },
        y: { type: 'log', label: '↑ p-value (log)', domain: [Math.min(1e-5, ...sorted.map((d) => d.p)), 1], tickFormat: '~g', grid: true },
        color: { domain: ['real effect', 'no effect'], range: [t.series1, t.series2], legend: true },
        marks: [
          ...thresholds.map((th) =>
            Plot.line(th.pts, { stroke: t.inkSecondary, strokeDasharray: th.name === 'raw α' ? '2 2' : th.name.startsWith('BH') ? '6 3' : undefined, strokeWidth: 1 }),
          ),
          // raw α and BH meet at the last rank, so label raw α on the left
          ...thresholds.map((th) =>
            th.name === 'raw α'
              ? Plot.text([th.pts[0]], { text: () => th.name, textAnchor: 'start', dy: -7, dx: 14, fill: t.inkSecondary })
              : Plot.text([th.pts[th.pts.length - 1]], { text: () => th.name, textAnchor: 'end', dy: th.name.startsWith('BH') ? 12 : -7, fill: t.inkSecondary }),
          ),
          // hollow = not flagged, filled = flagged significant
          Plot.dot(sorted.filter((d) => !d.rejected), { x: 'rank', y: 'p', stroke: 'truth', fill: t.surface, r: 5, strokeWidth: 2, tip: { format: { x: true, y: '.4f', stroke: true }, channels: { verdict: 'verdict' } } }),
          Plot.dot(sorted.filter((d) => d.rejected), { x: 'rank', y: 'p', stroke: 'truth', fill: 'truth', r: 5, strokeWidth: 2, tip: { format: { x: true, y: '.4f', stroke: true, fill: false }, channels: { verdict: 'verdict' } } }),
        ],
      }
    },
    [sim.family, deferred.m, deferred.alpha],
  )

  const buildRates = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const metrics = ['P(any false positive)', 'false discovery rate', 'power (real effects found)']
      const data = sim.rates.flatMap((r) => [
        { method: LABEL[r.method], metric: metrics[0], v: r.fwer },
        { method: LABEL[r.method], metric: metrics[1], v: r.fdr },
        { method: LABEL[r.method], metric: metrics[2], v: r.power },
      ]).filter((d) => Number.isFinite(d.v))
      return {
        width,
        height: 260,
        marginTop: 30,
        fx: { domain: metrics, label: null },
        x: { axis: null, domain: METHODS.map((m) => m.label), paddingInner: 0.1 },
        y: { domain: [0, 1], tickFormat: '.0%', label: '↑ rate over 1,500 families', grid: true },
        color: { domain: METHODS.map((m) => m.label), range: [t.neutral, t.series1, t.series3, t.series2], legend: true },
        marks: [
          Plot.barY(data, { fx: 'metric', x: 'method', y: 'v', fill: 'method', rx: 3, insetLeft: 1, insetRight: 1, tip: { format: { y: '.1%' } } }),
          Plot.ruleY([deferred.alpha], { stroke: t.ink, strokeDasharray: '4 3' }),
          Plot.ruleY([0], { stroke: t.axis }),
        ],
      }
    },
    [sim.rates, deferred.alpha],
  )

  const buildCurve = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const pts = Array.from({ length: 100 }, (_, i) => ({ m: i + 1, p: familywise(i + 1, deferred.alpha) }))
      const here = { m: deferred.m, p: familywise(deferred.m, deferred.alpha) }
      return {
        width,
        height: 220,
        x: { label: 'number of things you test →' },
        y: { domain: [0, 1], tickFormat: '.0%', label: '↑ chance of ≥ 1 false “win”', grid: true },
        marks: [
          Plot.line(pts, { x: 'm', y: 'p', stroke: t.series2, strokeWidth: 2, tip: { format: { y: '.1%' } } }),
          Plot.dot([here], { x: 'm', y: 'p', fill: t.series2, r: 6, stroke: t.surface, strokeWidth: 2 }),
          Plot.text([here], { x: 'm', y: 'p', text: (d: { p: number }) => `${pct(d.p, 0)} at m = ${deferred.m}`, dx: 10, dy: 12, textAnchor: 'start', fill: t.ink }),
        ],
      }
    },
    [deferred.m, deferred.alpha],
  )

  const panel = (
    <>
      <Slider label="Tests in the family (m)" value={c.m} onChange={set('m')} min={1} max={100} step={1} format={String} hint="metrics, segments or variants" />
      <Slider label="Of which have a real effect" value={c.real} onChange={set('real')} min={0} max={c.m} step={1} format={String} />
      <Slider label="Real effect size (z)" value={c.effectZ} onChange={set('effectZ')} min={1} max={5} step={0.1} format={(v) => v.toFixed(1)} hint="2.8 ≈ 80% power per test" />
      <Slider label="α" value={c.alpha} onChange={set('alpha')} min={0.01} max={0.1} step={0.01} format={(v) => v.toFixed(2)} />
      <Choice label="Correction" value={c.method} onChange={set('method')} options={METHODS} />
      <SeedControl seed={c.seed} onChange={set('seed')} />
      <ResetButton onClick={() => setC(DEFAULTS)} />
    </>
  )

  return (
    <ModuleLayout
      title="Multiple comparisons"
      controls={panel}
      intuition={
        <>
          <p>
            A 5% significance level means one test with no real effect fools you 5% of the time. Now
            check 20 metrics, or slice by 20 segments, or ship 20 variants. Each is another 5% lottery
            ticket, and the chance that <em>at least one</em> comes up “significant” by luck is 64%.
          </p>
          <p>
            Corrections raise the bar. <b>Bonferroni</b> tests each at α/m, so the chance of any false
            positive stays under α, at a real cost in power. <b>Holm</b> does the same job a little less
            harshly. <b>Benjamini–Hochberg</b> controls something different: the share of your “wins”
            that are false (the false discovery rate). It is the usual choice when you screen many
            things and can tolerate a few duds.
          </p>
        </>
      }
      play={
        <div className={stale ? styles.stale : undefined}>
          <h3>One family of {deferred.m} tests</h3>
          <p className="lede">
            Each dot is a test, sorted by p-value. Filled means flagged significant under “{LABEL[deferred.method]}”.
            Blue dots have a real effect; orange ones are pure noise.
          </p>
          <StatRow>
            <Stat label="Flagged significant" value={found.length} />
            <Stat label="True discoveries" value={truePos} note={`of ${deferred.real} real effects`} />
            <Stat label="False discoveries" value={falsePos} note={found.length ? `${pct(falsePos / found.length, 0)} of the flags` : 'nothing flagged'} />
          </StatRow>
          <PlotFigure build={buildFamily} label="Sorted p-values with correction thresholds" />
          <h3>Over many families</h3>
          <p className="lede">The same setup rerun 1,500 times, for every correction. Dashed line: α.</p>
          <PlotFigure build={buildRates} label="Family-wise error, false discovery rate and power by correction" />
          <p className="try">
            Try: set real effects to 0. Without a correction, “P(any false positive)” is huge; Bonferroni
            and Holm pull it to α. Then set 30 of 100 real: BH finds far more of them than Bonferroni
            while keeping the false-discovery share below α.
          </p>
        </div>
      }
      breakIt={
        <>
          <h3>The garden of forking paths</h3>
          <p className="lede">
            An experiment “failed” on its main metric, so someone checks revenue, retention, clicks,
            new vs returning users, mobile vs desktop, each country… and reports the one that came out
            significant.
          </p>
          <PlotFigure build={buildCurve} label="Chance of at least one false positive against number of tests" />
          <p>
            At m = {deferred.m} tests with no real effects, at least one fake win turns up{' '}
            {pct(familywise(deferred.m, deferred.alpha), 0)} of the time. The fix is mostly process:
            name one primary metric before the test, treat the rest as exploratory, and correct
            for the ones you do test, or confirm a surprising segment in a fresh experiment.
          </p>
        </>
      }
      explainBack={
        <ExplainBack
          questions={[
            {
              q: 'You test 10 independent metrics at α = 0.05 and none has a real effect. What is the chance at least one is significant?',
              a: '1 − 0.95¹⁰ ≈ 40%.',
            },
            {
              q: 'What is the difference between controlling the family-wise error rate and the false discovery rate?',
              a: 'FWER (Bonferroni, Holm) controls the chance of making even one false claim: strict, good when any false positive is costly. FDR (Benjamini–Hochberg) controls the expected share of false claims among your claims: you accept some duds in exchange for much more power, which suits screening many hypotheses.',
            },
            {
              q: 'Why is Holm never worse than Bonferroni?',
              a: 'It uses α/m only for the smallest p-value, then α/(m−1), α/(m−2)… for the next ones, stopping at the first failure. It still controls the FWER but rejects at least as many hypotheses as Bonferroni.',
            },
            {
              q: 'After a flat test, an analyst finds “B wins for Android users in Brazil, p = 0.01”. What do you do?',
              a: 'Treat it as a hypothesis, not a result: it is one of many slices that could have been reported, so its p-value is not 0.01 in any meaningful sense. Count how many slices were looked at, correct for them, and if it still matters, run a new test targeted at that segment.',
            },
          ]}
        />
      }
    />
  )
}
