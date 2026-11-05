import * as Plot from '@observablehq/plot'
import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import { Choice, ResetButton, SeedControl } from '../../components/Controls.tsx'
import ExplainBack from '../../components/ExplainBack.tsx'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import PlotFigure from '../../components/PlotFigure.tsx'
import Slider from '../../components/Slider.tsx'
import { Stat, StatRow } from '../../components/Stat.tsx'
import type { VizTheme } from '../../components/vizTheme.ts'
import { mulberry32 } from '../../core/random.ts'
import { expectedRetest, interventionStudy, MEAN, selectExtreme, simulatePeople } from '../../core/rtm.ts'
import { mean } from '../../core/stats.ts'
import { pct } from '../../format.ts'
import styles from '../common.module.css'

interface Controls {
  reliability: number
  side: 'top' | 'bottom'
  share: number
  effect: number
  seed: number
}

const DEFAULTS: Controls = { reliability: 0.5, side: 'top', share: 0.1, effect: 0, seed: 1 }
const N = 2000
const SEL = 'selected on test 1'
const REST = 'everyone else'
const signed = (x: number) => `${x > 0 ? '+' : ''}${x.toFixed(1)}`

export default function RegressionToMean() {
  const [c, setC] = useState(DEFAULTS)
  const deferred = useDeferredValue(c)
  const stale = deferred !== c
  const set = <K extends keyof Controls>(k: K) => (v: Controls[K]) => setC((s) => ({ ...s, [k]: v }))

  const people = useMemo(() => simulatePeople(N, deferred.reliability, mulberry32(deferred.seed)), [deferred.reliability, deferred.seed])
  const selected = useMemo(() => selectExtreme(people, deferred.share, deferred.side), [people, deferred.share, deferred.side])
  const bottom = useMemo(() => selectExtreme(people, deferred.share, 'bottom'), [people, deferred.share])
  const study = interventionStudy(people, bottom, deferred.effect)
  const sel = [...selected].map((i) => people[i])
  const m1 = mean(sel.map((p) => p.test1))
  const m2 = mean(sel.map((p) => p.test2))

  const buildScatter = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const data = people.map((p, i) => ({ ...p, kind: selected.has(i) ? SEL : REST }))
      const r = deferred.reliability
      return {
        width,
        height: Math.min(460, width * 0.75),
        x: { domain: [40, 160], label: 'test 1 score →' },
        y: { domain: [40, 160], label: '↑ test 2 score', grid: true },
        color: { domain: [SEL, REST], range: [t.series2, t.neutral], legend: true },
        marks: [
          Plot.dot(data.filter((d) => d.kind === REST), { x: 'test1', y: 'test2', fill: 'kind', r: 2, fillOpacity: 0.6 }),
          Plot.dot(data.filter((d) => d.kind === SEL), { x: 'test1', y: 'test2', fill: 'kind', r: 2.5, tip: { format: { x: '.0f', y: '.0f', skill: '.0f', fill: false } }, channels: { skill: 'skill' } }),
          Plot.line([[40, 40], [160, 160]], { stroke: t.inkSecondary, strokeDasharray: '4 3' }),
          Plot.text([[150, 150]], { text: () => 'same score twice', dy: -10, dx: -20, fill: t.inkSecondary }),
          Plot.line([[40, expectedRetest(40, r)], [160, expectedRetest(160, r)]], { stroke: t.series1, strokeWidth: 2 }),
          Plot.text([[45, expectedRetest(45, r)]], { text: () => `best guess for test 2: slope ${r.toFixed(2)}`, dy: -12, textAnchor: 'start', fill: t.series1 }),
        ],
      }
    },
    [people, selected, deferred.reliability],
  )

  const buildStudy = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const data = [
        { group: 'got the intervention', change: study.treatedChange },
        { group: 'control: selected the same way, no intervention', change: study.controlChange },
      ]
      return {
        width,
        height: 170,
        marginLeft: 280,
        x: { label: 'average change from test 1 to test 2 (points) →', grid: true },
        y: { label: null, domain: data.map((d) => d.group) },
        color: { domain: data.map((d) => d.group), range: [t.series2, t.series1] },
        marks: [
          Plot.barX(data, { y: 'group', x: 'change', fill: 'group', rx: 4, tip: { format: { x: '.1f' } } }),
          Plot.text(data, { y: 'group', x: 'change', text: (d: { change: number }) => signed(d.change), dx: 18, fill: t.ink }),
          Plot.ruleX([0], { stroke: t.axis }),
        ],
      }
    },
    [study.treatedChange, study.controlChange],
  )

  const panel = (
    <>
      <Slider label="Reliability (share that is skill)" value={c.reliability} onChange={set('reliability')} min={0} max={1} step={0.05} format={(v) => pct(v, 0)} hint="the test 1–test 2 correlation" />
      <Choice label="Select on test 1" value={c.side} onChange={set('side')} options={[{ value: 'top', label: 'top scorers' }, { value: 'bottom', label: 'bottom scorers' }]} />
      <Slider label="Selected share" value={c.share} onChange={set('share')} min={0.02} max={0.5} step={0.01} format={(v) => pct(v, 0)} />
      <Slider label="Intervention’s true effect" value={c.effect} onChange={set('effect')} min={0} max={10} step={0.5} format={(v) => `+${v}`} hint="used in Break it" />
      <SeedControl seed={c.seed} onChange={set('seed')} />
      <ResetButton onClick={() => setC(DEFAULTS)} />
    </>
  )

  return (
    <ModuleLayout
      title="Regression to the mean"
      controls={panel}
      intuition={
        <>
          <p>
            Any score mixes something stable (skill, true quality) with luck that changes every time.
            The people at the very top of one test are mostly skilled <em>and</em> lucky that day. Test
            them again: the skill stays, the luck is redrawn, and on average they come back toward the
            middle. The bottom scorers rise the same way.
          </p>
          <p>
            Nothing has to change for this to happen. It’s why the rookie of the year has a weaker
            second season, why the worst-performing stores “improve” after a manager visit, and why
            the pages you fixed because they had the worst conversion last week look better this week.
          </p>
          <p>
            How far they fall back depends on how much of the score is luck. With reliability r, the
            best guess for the retest is mean + r × (first score − mean).
          </p>
        </>
      }
      play={
        <div className={stale ? styles.stale : undefined}>
          <h3>{N.toLocaleString('en')} people, tested twice</h3>
          <p className="lede">
            Orange: the {deferred.side} {pct(deferred.share, 0)} on test 1. If scores were pure skill
            they’d sit on the dashed diagonal; the blue line is where they actually land on average.
          </p>
          <StatRow>
            <Stat label={`Selected group, test 1`} value={m1.toFixed(1)} note={`${signed(m1 - MEAN)} vs the mean`} />
            <Stat label="Same people, test 2" value={m2.toFixed(1)} note={`${signed(m2 - MEAN)} vs the mean`} />
            <Stat label="Kept of their lead" value={pct((m2 - MEAN) / (m1 - MEAN), 0)} note={`theory: r = ${pct(deferred.reliability, 0)}`} />
          </StatRow>
          <PlotFigure build={buildScatter} label="Scatter of test 1 against test 2 scores" />
          <p className="try">
            Try: set reliability to 100%: no luck, no regression, everyone sits on the diagonal. At 0%
            the scores are pure luck and the selected group falls all the way back to 100.
          </p>
        </div>
      }
      breakIt={
        <div className={stale ? styles.stale : undefined}>
          <h3>The intervention that “works”</h3>
          <p className="lede">
            Take the bottom {pct(deferred.share, 0)} on test 1 and give half of them a coaching session
            whose true effect is <b>{deferred.effect} points</b>. Retest. Leave the other half alone
            as a control.
          </p>
          <PlotFigure build={buildStudy} label="Average improvement of treated and control groups" />
          <StatRow>
            <Stat label="Naive before/after" value={signed(study.treatedChange)} note="what a report would claim" />
            <Stat label="Treated minus control" value={signed(study.treatedChange - study.controlChange)} note={`true effect ${deferred.effect}`} />
          </StatRow>
          <p>
            With the effect at 0, the coached group still “improves” by several points. Without a
            control group selected the same way, that rise is indistinguishable from a real effect. The
            control rises just as much, and the difference between the two is the honest estimate. Slide
            the true effect up and only the gap moves.
          </p>
        </div>
      }
      explainBack={
        <ExplainBack
          questions={[
            {
              q: 'Why do top performers tend to do worse next time, even if nothing changed?',
              a: 'Being at the top selects for good luck as well as skill. Luck doesn’t persist, so on the next measurement the luck component averages out and their scores move toward the mean. The less reliable the measure, the bigger the drop.',
            },
            {
              q: 'You send a retention offer to the 5% of users with the biggest activity drop last month. Next month they recover. Did the offer work?',
              a: 'You can’t tell: users selected for an unusually bad month will tend to bounce back on their own. You need a holdout of similar users (selected the same way) who don’t get the offer; the effect is the difference between the two groups.',
            },
            {
              q: 'If the test–retest correlation is 0.3 and someone scores 130 (mean 100), what do you expect next time?',
              a: '100 + 0.3 × 30 = 109. Only 30% of their advantage is expected to persist.',
            },
            {
              q: 'Does regression to the mean mean everyone becomes average over time?',
              a: 'No. The overall spread stays the same: on test 2 some new people are lucky and land at the extremes. It is about conditional expectations: given an extreme first score, the second is expected to be less extreme.',
            },
          ]}
        />
      }
    />
  )
}
