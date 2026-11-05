import * as Plot from '@observablehq/plot'
import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import { ResetButton, SeedControl, Toggle } from '../../components/Controls.tsx'
import ExplainBack from '../../components/ExplainBack.tsx'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import PlotFigure from '../../components/PlotFigure.tsx'
import Slider from '../../components/Slider.tsx'
import { Stat, StatRow } from '../../components/Stat.tsx'
import type { VizTheme } from '../../components/vizTheme.ts'
import { crossValidate, freshAccuracy, makeData, type LeakParams } from '../../core/ml/leakage.ts'
import { mulberry32 } from '../../core/random.ts'
import { int, pct } from '../../format.ts'
import styles from '../common.module.css'

interface Controls {
  n: number
  p: number
  k: number
  informative: number
  targetLeak: boolean
  seed: number
}

const DEFAULTS: Controls = { n: 60, p: 1000, k: 20, informative: 0, targetLeak: false, seed: 1 }
const RUNS = 10
const KINDS = ['select on all data, then CV', 'select inside each fold', 'brand-new data (production)'] as const

function simulate(c: Controls) {
  const params: LeakParams = { n: c.n, p: c.p, informative: Math.min(c.informative, c.p), signal: 0.8, targetLeak: c.targetLeak, k: Math.min(c.k, c.p), folds: 5 }
  const runs = Array.from({ length: RUNS }, (_, r) => {
    const rng = mulberry32(c.seed * 1000 + r)
    const d = makeData(params, rng)
    // in production the leaked column doesn't exist yet: fill it with noise
    const fresh = makeData({ ...params, n: 400, targetLeak: false }, rng)
    if (c.targetLeak) fresh.X.forEach((row) => row.push(0.5 * (rng() - 0.5)))
    return {
      run: r,
      leaky: crossValidate(d, params.k, 5, 'leaky'),
      proper: crossValidate(d, params.k, 5, 'proper'),
      fresh: freshAccuracy(d, fresh, params.k),
    }
  })
  return { runs }
}

export default function Leakage() {
  const [c, setC] = useState(DEFAULTS)
  const deferred = useDeferredValue(c)
  const sim = useMemo(() => simulate(deferred), [deferred])
  const stale = deferred !== c
  const set = <K extends keyof Controls>(k: K) => (v: Controls[K]) => setC((s) => ({ ...s, [k]: v }))
  const avg = (key: 'leaky' | 'proper' | 'fresh') => sim.runs.reduce((s, r) => s + r[key], 0) / RUNS

  const build = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const data = sim.runs.flatMap((r) => [
        { kind: KINDS[0], acc: r.leaky, run: r.run },
        { kind: KINDS[1], acc: r.proper, run: r.run },
        { kind: KINDS[2], acc: r.fresh, run: r.run },
      ])
      const means = KINDS.map((k) => ({ kind: k, acc: data.filter((d) => d.kind === k).reduce((s, d) => s + d.acc, 0) / RUNS }))
      // numeric rows with a little vertical jitter per run, labelled with the method names
      const row = (k: (typeof KINDS)[number]) => KINDS.indexOf(k)
      return {
        width,
        height: 240,
        marginLeft: 200,
        x: { domain: [0.2, 1], tickFormat: '.0%', label: 'accuracy →', grid: true },
        y: { domain: [2.6, -0.6], ticks: [0, 1, 2], tickFormat: (i: number) => KINDS[i], label: null },
        color: { domain: [...KINDS], range: [t.series2, t.series1, t.series3] },
        marks: [
          Plot.ruleX([0.5], { stroke: t.ink, strokeDasharray: '4 3' }),
          Plot.text([0.5], { x: (d: number) => d, frameAnchor: 'top', dy: -4, text: () => 'coin flip', fill: t.inkSecondary }),
          Plot.dot(data, { x: 'acc', y: (d: { kind: (typeof KINDS)[number]; run: number }) => row(d.kind) + (d.run - (RUNS - 1) / 2) * 0.04, fill: 'kind', r: 4, fillOpacity: 0.6 }),
          Plot.ruleX(means, { x: 'acc', y1: (d: { kind: (typeof KINDS)[number] }) => row(d.kind) - 0.3, y2: (d: { kind: (typeof KINDS)[number] }) => row(d.kind) + 0.3, stroke: t.ink, strokeWidth: 3 }),
          Plot.text(means, { x: 'acc', y: (d: { kind: (typeof KINDS)[number] }) => row(d.kind) - 0.42, text: (d: { acc: number }) => pct(d.acc, 0), fill: t.ink }),
        ],
      }
    },
    [sim.runs],
  )

  const panel = (
    <>
      <Slider label="Rows (people)" value={c.n} onChange={set('n')} min={40} max={400} step={10} format={int} />
      <Slider label="Candidate features" value={c.p} onChange={set('p')} min={10} max={2000} step={1} log format={int} />
      <Slider label="Features kept by selection" value={c.k} onChange={set('k')} min={1} max={50} step={1} format={String} />
      <Slider label="Features with real signal" value={c.informative} onChange={set('informative')} min={0} max={20} step={1} format={String} />
      <Toggle label="Add a column derived from the label" checked={c.targetLeak} onChange={set('targetLeak')} />
      <SeedControl seed={c.seed} onChange={set('seed')} />
      <ResetButton onClick={() => setC(DEFAULTS)} />
    </>
  )

  return (
    <ModuleLayout
      title="Train/test leakage"
      controls={panel}
      intuition={
        <>
          <p>
            A test set is a rehearsal for the future: data the model has never seen. <b>Leakage</b> is any way
            information from that “future” sneaks into training, so the rehearsal is rigged. The score looks
            great; production doesn’t.
          </p>
          <p>
            The obvious leak is training on test rows. The common ones are subtler: choosing features,
            scaling, imputing or tuning on the <em>whole</em> dataset before splitting; random splits of
            data where time matters; the same customer in both train and test; and features that are only known{' '}
            <em>because</em> of the outcome (a “refund issued” flag when predicting fraud). The rule: anything
            learned from data must be learned inside the training fold only.
          </p>
        </>
      }
      play={
        <div className={stale ? styles.stale : undefined}>
          <h3>
            {deferred.informative ? 'Mostly noise' : 'Pure noise'}: {int(deferred.p)} features, {int(deferred.n)} people
          </h3>
          <p className="lede">
            The label is a coin flip and no feature carries any signal ({deferred.informative === 0 ? 'right now' : `except ${deferred.informative} real ones`}). The pipeline keeps
            the {Math.min(deferred.k, deferred.p)} features most correlated with the label, then scores a simple classifier with
            5-fold cross-validation. Each dot is one of {RUNS} datasets; the black tick is the average.
          </p>
          <PlotFigure build={build} label="Cross-validated accuracy with leaky and proper feature selection" />
          <StatRow>
            <Stat label="Leaky CV accuracy" value={pct(avg('leaky'), 0)} note="what the notebook reports" />
            <Stat label="Proper CV accuracy" value={pct(avg('proper'), 0)} note="selection redone in each fold" />
            <Stat label="On brand-new data" value={pct(avg('fresh'), 0)} note="what production will see" />
          </StatRow>
          <p>
            With 1,000 random features, some correlate with a 60-row label by pure chance. Selecting them on
            all rows means the selection already “saw” the test folds, so those features look predictive in
            every fold. Redo the selection inside each fold and the illusion disappears.
          </p>
        </div>
      }
      breakIt={
        <div className={stale ? styles.stale : undefined}>
          <ul>
            <li>
              <b>Fewer candidates:</b> drop the candidate features to 20. The leak shrinks, because there are fewer chances
              for a lucky correlation. Raise them to 2,000 and it gets worse. Wide data (genomics, text, many
              engineered features) is where this bites.
            </li>
            <li>
              <b>Real signal:</b> add 10 informative features. The proper pipeline finds them and agrees with
              brand-new data; the leaky one is still inflated on top of the real signal.
            </li>
            <li>
              <b>A column derived from the label:</b> turn it on. Both CV numbers jump to almost 100%, because the
              feature is the answer. On new data, where that column isn’t filled in yet at prediction time, accuracy falls
              back. No split strategy catches this. Ask, for every feature: would I know this at the moment
              I need the prediction?
            </li>
          </ul>
        </div>
      }
      explainBack={
        <ExplainBack
          questions={[
            {
              q: 'What is data leakage, in one sentence?',
              a: 'Information that wouldn’t be available at prediction time (from the test set, the future, or the label itself) influencing the model or its evaluation, so the measured performance is better than real performance.',
            },
            {
              q: 'Why does feature selection before the train/test split leak, even if the model never trains on test rows?',
              a: 'Choosing features by their correlation with the label on all rows uses the test labels. With many candidate features, you pick ones that happen to fit those test labels, so the test score is optimistic. Selection (and scaling, imputation, tuning) must be fit inside each training fold, e.g. with a pipeline.',
            },
            {
              q: 'You predict churn next month. Why is a random train/test split risky, and what do you use instead?',
              a: 'Random splits put future rows in training and past rows in test, letting the model learn from information that comes after the prediction point (and from trends). Use a time-based split: train on earlier periods, test on later ones, with features computed only from data before each prediction date.',
            },
            {
              q: 'A model gets 99% AUC on the first try. What do you check?',
              a: 'Leakage first: features that encode the label or come after the outcome, IDs or timestamps that correlate with the label, duplicates of the same entity across train and test, and preprocessing done before the split. Look at feature importances: one dominant feature is a classic sign.',
            },
          ]}
        />
      }
    />
  )
}
