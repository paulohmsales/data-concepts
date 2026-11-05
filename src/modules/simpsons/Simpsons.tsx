import * as Plot from '@observablehq/plot'
import { useCallback, useMemo, useState } from 'react'
import { Choice, ResetButton } from '../../components/Controls.tsx'
import DataTable from '../../components/DataTable.tsx'
import ExplainBack from '../../components/ExplainBack.tsx'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import PlotFigure from '../../components/PlotFigure.tsx'
import Slider from '../../components/Slider.tsx'
import { Stat, StatRow } from '../../components/Stat.tsx'
import Status from '../../components/Status.tsx'
import type { VizTheme } from '../../components/vizTheme.ts'
import { KIDNEY_STONES, rate, reverses, summarize, tableFrom, type Arm, type Stratum } from '../../core/simpson.ts'
import { int, pct } from '../../format.ts'
import styles from '../common.module.css'

interface Controls {
  rates: Record<Arm, Record<Stratum, number>>
  hardShare: Record<Arm, number>
}

const k = KIDNEY_STONES
const DEFAULTS: Controls = {
  rates: {
    A: { easy: rate(k.A.easy), hard: rate(k.A.hard) },
    B: { easy: rate(k.B.easy), hard: rate(k.B.hard) },
  },
  hardShare: { A: k.A.hard.n / 350, B: k.B.hard.n / 350 },
}
const ARMS: Arm[] = ['A', 'B']
const NAME: Record<Arm, string> = { A: 'Treatment A', B: 'Treatment B' }
type Third = 'before' | 'after'

export default function Simpsons() {
  const [c, setC] = useState(DEFAULTS)
  const [third, setThird] = useState<Third>('before')
  const table = useMemo(() => tableFrom(c.rates, c.hardShare, 350), [c])
  const s = summarize(table)
  const paradox = reverses(table)
  const setRate = (a: Arm, st: Stratum) => (v: number) => setC((x) => ({ ...x, rates: { ...x.rates, [a]: { ...x.rates[a], [st]: v } } }))
  const setShare = (a: Arm) => (v: number) => setC((x) => ({ ...x, hardShare: { ...x.hardShare, [a]: v } }))

  const buildBars = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const groups = ['Easy cases', 'Hard cases', 'All patients']
      const data = ARMS.flatMap((a) => [
        { group: groups[0], arm: NAME[a], rate: s[a].easy },
        { group: groups[1], arm: NAME[a], rate: s[a].hard },
        { group: groups[2], arm: NAME[a], rate: s[a].overall },
      ])
      return {
        width,
        height: 280,
        marginTop: 30,
        fx: { domain: groups, label: null },
        x: { axis: null, domain: ARMS.map((a) => NAME[a]), paddingInner: 0.1 },
        y: { domain: [0, 1], tickFormat: '.0%', label: '↑ success rate', grid: true },
        color: { domain: ARMS.map((a) => NAME[a]), range: [t.series1, t.series2], legend: true },
        marks: [
          Plot.barY(data, { fx: 'group', x: 'arm', y: 'rate', fill: 'arm', rx: 4, insetLeft: 1, insetRight: 1, tip: { format: { y: '.1%' } } }),
          Plot.text(data, { fx: 'group', x: 'arm', y: 'rate', text: (d: { rate: number }) => pct(d.rate, 0), dy: -8, fill: t.ink }),
          Plot.ruleY([0], { stroke: t.axis }),
        ],
      }
    },
    [s],
  )

  const buildMix = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const lines = ARMS.flatMap((a) => [
        { arm: NAME[a], share: 0, rate: s[a].easy },
        { arm: NAME[a], share: 1, rate: s[a].hard },
      ])
      const actual = ARMS.map((a) => ({ arm: NAME[a], share: s[a].hardShare, rate: s[a].overall }))
      return {
        width,
        height: 280,
        x: { domain: [0, 1], tickFormat: '.0%', label: 'share of the arm’s patients who are hard cases →' },
        y: { domain: [0.3, 1], tickFormat: '.0%', label: '↑ pooled success rate', grid: true },
        color: { domain: ARMS.map((a) => NAME[a]), range: [t.series1, t.series2], legend: true },
        marks: [
          Plot.line(lines, { x: 'share', y: 'rate', stroke: 'arm', z: 'arm', strokeWidth: 2 }),
          Plot.ruleX(actual, { x: 'share', y1: 0.3, y2: 'rate', stroke: 'arm', strokeDasharray: '3 3' }),
          Plot.dot(actual, { x: 'share', y: 'rate', fill: 'arm', r: 6, stroke: t.surface, strokeWidth: 2, tip: { format: { x: '.0%', y: '.1%' } } }),
          Plot.text(actual, { x: 'share', y: 'rate', text: (d: { arm: string; rate: number }) => `${d.arm}: ${pct(d.rate, 0)}`, dy: -14, fill: t.ink }),
        ],
      }
    },
    [s],
  )

  const panel = (
    <>
      <strong>Success rate inside each group</strong>
      {ARMS.flatMap((a) =>
        (['easy', 'hard'] as const).map((st) => (
          <Slider key={a + st} label={`${a}, ${st} cases`} value={c.rates[a][st]} onChange={setRate(a, st)} min={0.3} max={1} step={0.01} format={(v) => pct(v, 0)} />
        )),
      )}
      <strong>Who gets which treatment</strong>
      {ARMS.map((a) => (
        <Slider key={a} label={`Hard cases among ${a}`} value={c.hardShare[a]} onChange={setShare(a)} min={0} max={1} step={0.01} format={(v) => pct(v, 0)} />
      ))}
      <ResetButton onClick={() => setC(DEFAULTS)} />
      <small className="lede">Reset loads the real kidney-stone data (Charig et al., 1986).</small>
    </>
  )

  return (
    <ModuleLayout
      title="Simpson’s paradox"
      controls={panel}
      intuition={
        <>
          <p>
            A hospital compares two kidney-stone treatments. Treatment A succeeds more often for small
            stones <em>and</em> for large stones. Yet across all patients, B has the higher success
            rate. Nobody made an arithmetic mistake.
          </p>
          <p>
            The catch is <b>who got which treatment</b>. Doctors gave A, the stronger option, mostly to
            hard cases, and hard cases fail more often whatever you do. So A’s pooled rate is dragged
            down by its tough patient mix, not by the treatment. A pooled rate is a weighted average of
            the group rates, and the weights here differ between the arms.
          </p>
          <p>
            Which answer is right depends on <em>why</em> the groups differ, not on the numbers. That
            is a question about cause, and Section 3 makes you answer it.
          </p>
        </>
      }
      play={
        <>
          <StatRow>
            <Stat label="Easy cases" value={s.A.easy > s.B.easy ? 'A wins' : s.A.easy < s.B.easy ? 'B wins' : 'tie'} note={`${pct(s.A.easy)} vs ${pct(s.B.easy)}`} />
            <Stat label="Hard cases" value={s.A.hard > s.B.hard ? 'A wins' : s.A.hard < s.B.hard ? 'B wins' : 'tie'} note={`${pct(s.A.hard)} vs ${pct(s.B.hard)}`} />
            <Stat label="All patients pooled" value={s.A.overall > s.B.overall ? 'A wins' : s.A.overall < s.B.overall ? 'B wins' : 'tie'} note={`${pct(s.A.overall)} vs ${pct(s.B.overall)}`} />
            <Stat label="Paradox?" value={paradox ? <Status level="bad">reversed</Status> : <Status level="good">consistent</Status>} note={`same mix for both: A ${pct(s.adjustedA)} vs B ${pct(s.adjustedB)}`} />
          </StatRow>
          <PlotFigure build={buildBars} label="Success rates by group and pooled, for each treatment" />
          <h3>Why: the pooled rate slides along a line</h3>
          <p className="lede">
            Each arm’s pooled rate sits on the line between its easy-case rate (left) and its hard-case
            rate (right), at its own share of hard cases. A’s line is higher everywhere, but A sits far
            to the right.
          </p>
          <PlotFigure build={buildMix} label="Pooled rate as a weighted average of group rates" />
          <p className="try">
            Drag both “hard cases among” sliders to the same value. The dots line up vertically and
            the paradox disappears. Then give B most of the hard cases instead and watch B look
            terrible.
          </p>
        </>
      }
      breakIt={
        <>
          <h3>Same numbers, opposite right answer</h3>
          <p className="lede">
            Keep the numbers above, but change what the “easy/hard” split actually is. Which comparison
            should decide?
          </p>
          <Choice
            label="The split is…"
            value={third}
            onChange={setThird}
            options={[
              { value: 'before', label: 'Stone size, measured before treatment' },
              { value: 'after', label: 'Blood pressure, measured after treatment' },
            ]}
          />
          <div className={styles.card}>
            {third === 'before' ? (
              <>
                <h4>Compare within groups: {s.A.easy > s.B.easy && s.A.hard > s.B.hard ? 'A' : 'the within-group winner'}</h4>
                <p>
                  Stone size existed before anyone chose a treatment, and it influenced both the choice
                  (doctors gave A to hard cases) and the outcome. It is a <b>confounder</b>. Comparing
                  within sizes, or standardising both arms to the same mix (A {pct(s.adjustedA)} vs B{' '}
                  {pct(s.adjustedB)}), removes its effect. The pooled number mixes the treatment with
                  the patient mix.
                </p>
              </>
            ) : (
              <>
                <h4>Compare pooled: {s.A.overall > s.B.overall ? 'A' : 'B'}</h4>
                <p>
                  Now the split is something the treatment itself <em>causes</em>: a <b>mediator</b>.
                  If a treatment works partly by lowering blood pressure, splitting by blood pressure
                  hides exactly that part of its effect. You should not adjust for consequences of the
                  treatment. The pooled comparison is the honest one here.
                </p>
              </>
            )}
          </div>
          <p>
            The data can’t tell you which story is true. Only knowing how the variable came about (a
            causal diagram, or randomisation, which makes the mix equal by design) can. That is why A/B
            tests randomise.
          </p>
          <DataTable
            caption="Counts behind the charts (350 patients per arm)"
            rows={ARMS.flatMap((a) => (['easy', 'hard'] as const).map((st) => ({ a, st, cell: table[a][st] })))}
            rowKey={(r) => r.a + r.st}
            columns={[
              { key: 'a', label: 'Treatment', render: (r) => r.a },
              { key: 's', label: 'Group', render: (r) => r.st },
              { key: 'n', label: 'Patients', align: 'right', render: (r) => int(r.cell.n) },
              { key: 'k', label: 'Successes', align: 'right', render: (r) => int(r.cell.successes) },
              { key: 'r', label: 'Rate', align: 'right', render: (r) => pct(r.cell.successes / r.cell.n) },
            ]}
          />
        </>
      }
      explainBack={
        <ExplainBack
          questions={[
            {
              q: 'How can A beat B in every subgroup and still lose overall?',
              a: 'The overall rate is a weighted average of subgroup rates, and each arm has its own weights. If A is used mostly on the hard subgroup (which has low rates for everyone), its average is pulled toward the hard-case rate even though it beats B inside each subgroup.',
            },
            {
              q: 'A dashboard shows conversion rose overall, but fell in every country. What happened, and is it good news?',
              a: 'The traffic mix shifted toward countries that convert well (or away from ones that convert badly). Conversion within each country, which is what product changes act on, fell. Probably bad news, plus a mix shift worth explaining.',
            },
            {
              q: 'When should you not stratify by a third variable?',
              a: 'When it is caused by the treatment (a mediator) or by both treatment and outcome (a collider). Adjusting for it removes or distorts the effect you are trying to measure. Adjust for confounders (common causes that exist before treatment), not for consequences.',
            },
            {
              q: 'Why does randomisation make Simpson’s paradox (by confounding) impossible in expectation?',
              a: 'Random assignment gives both arms the same expected mix of every pre-existing variable, so the weights are equal and the pooled comparison equals the standardised one, up to chance imbalance.',
            },
          ]}
        />
      }
    />
  )
}
