import * as Plot from '@observablehq/plot'
import { useCallback, useMemo, useState } from 'react'
import { Choice, ResetButton } from '../../components/Controls.tsx'
import ExplainBack from '../../components/ExplainBack.tsx'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import PlotFigure from '../../components/PlotFigure.tsx'
import Slider from '../../components/Slider.tsx'
import { Stat, StatRow } from '../../components/Stat.tsx'
import Status from '../../components/Status.tsx'
import type { VizTheme } from '../../components/vizTheme.ts'
import { descend, maxStableLr, surface, type Surface } from '../../core/ml/gd.ts'
import styles from '../common.module.css'

interface Controls {
  surface: Surface
  kappa: number
  lr: number
  momentum: number
  steps: number
  start1: number
  start2: number
}

const DEFAULTS: Controls = { surface: 'bowl', kappa: 10, lr: 0.17, momentum: 0, steps: 100, start1: -2, start2: 4 }
const lrFmt = (v: number) => (v < 0.01 ? v.toFixed(4) : v < 0.1 ? v.toFixed(3) : v.toFixed(2))

const PRESETS: { label: string; bug?: boolean; c: Partial<Controls> }[] = [
  { label: 'Step too big: diverges', bug: true, c: { surface: 'bowl', kappa: 10, lr: 0.21, momentum: 0, steps: 30, start1: -2, start2: 4 } },
  { label: 'Narrow valley: zig-zag', bug: true, c: { surface: 'bowl', kappa: 50, lr: 0.038, momentum: 0, steps: 150, start1: -2, start2: 4 } },
  { label: 'Same valley + momentum', c: { surface: 'bowl', kappa: 50, lr: 0.038, momentum: 0.8, steps: 150, start1: -2, start2: 4 } },
  { label: 'Scaled features (κ = 1)', c: { surface: 'bowl', kappa: 1, lr: 0.9, momentum: 0, steps: 30, start1: -2, start2: 4 } },
  { label: 'Wrong valley', bug: true, c: { surface: 'valleys', lr: 0.05, momentum: 0, steps: 120, start1: 1.6, start2: 1.2 } },
]

export default function GradientDescent() {
  const [c, setC] = useState(DEFAULTS)
  const set = <K extends keyof Controls>(k: K) => (v: Controls[K]) => setC((s) => ({ ...s, [k]: v }))
  const s = useMemo(() => surface(c.surface, c.kappa), [c.surface, c.kappa])
  const run = useMemo(() => descend(s, [c.start1, c.start2], c.lr, c.steps, c.momentum), [s, c.start1, c.start2, c.lr, c.steps, c.momentum])
  const fMin = s.f(s.minimum)
  const last = run.path[run.path.length - 1]
  const limit = c.surface === 'bowl' ? maxStableLr(c.kappa) * (1 + c.momentum) : NaN

  const buildContour = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const { x, y } = s.domain
      const shown = run.path.filter((p) => p.w1 >= x[0] - 1 && p.w1 <= x[1] + 1 && p.w2 >= y[0] - 1 && p.w2 <= y[1] + 1)
      return {
        width,
        height: Math.min(440, width * 0.7),
        x: { domain: x, label: 'w₁ →' },
        y: { domain: y, label: '↑ w₂' },
        marks: [
          Plot.contour({
            x1: x[0],
            x2: x[1],
            y1: y[0],
            y2: y[1],
            fill: (a: number, b: number) => Math.log1p(s.f([a, b]) - fMin + 0.01),
            stroke: t.axis,
            strokeWidth: 0.6,
            thresholds: 18,
          }),
          Plot.line(shown, { x: 'w1', y: 'w2', stroke: t.series2, strokeWidth: 2, clip: true }),
          Plot.dot(shown, { x: 'w1', y: 'w2', fill: t.series2, r: 3, stroke: t.surface, strokeWidth: 1, clip: true, tip: { format: { x: '.3f', y: '.3f' }, channels: { step: 'step', loss: 'loss' } } }),
          Plot.dot([s.minimum], { x: (d: number[]) => d[0], y: (d: number[]) => d[1], symbol: 'star', r: 8, fill: t.ink }),
          Plot.dot([[c.start1, c.start2]], { x: (d: number[]) => d[0], y: (d: number[]) => d[1], r: 6, stroke: t.ink, strokeWidth: 2, fill: 'none' }),
        ],
        color: { type: 'sequential', range: [t.surface, t.neutral] },
      }
    },
    [s, fMin, run.path, c.start1, c.start2],
  )

  const buildLoss = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const data = run.path.map((p) => ({ step: p.step, gap: Math.max(1e-12, p.loss - fMin) })).filter((d) => Number.isFinite(d.gap))
      return {
        width,
        height: 200,
        x: { label: 'step →' },
        y: { type: 'log', label: '↑ loss above the best (log)', tickFormat: '~g', grid: true },
        marks: [Plot.line(data, { x: 'step', y: 'gap', stroke: t.series2, strokeWidth: 2, tip: true })],
      }
    },
    [run.path, fMin],
  )

  const panel = (
    <>
      <Choice label="Loss surface" value={c.surface} onChange={set('surface')} options={[{ value: 'bowl', label: 'bowl (convex)' }, { value: 'valleys', label: 'two valleys' }]} />
      {c.surface === 'bowl' && <Slider label="Stretch κ (curvature ratio)" value={c.kappa} onChange={set('kappa')} min={1} max={100} step={1} log format={String} hint="1 = round bowl; big = unscaled features" />}
      <Slider label="Learning rate" value={c.lr} onChange={set('lr')} min={0.001} max={2} step={0.001} log format={lrFmt} hint={c.surface === 'bowl' ? `stable below ${lrFmt(limit)}` : undefined} />
      <Slider label="Momentum β" value={c.momentum} onChange={set('momentum')} min={0} max={0.95} step={0.05} format={(v) => v.toFixed(2)} />
      <Slider label="Steps" value={c.steps} onChange={set('steps')} min={5} max={500} step={5} format={String} />
      <Slider label="Start w₁" value={c.start1} onChange={set('start1')} min={s.domain.x[0]} max={s.domain.x[1]} step={0.1} format={(v) => v.toFixed(1)} />
      <Slider label="Start w₂" value={c.start2} onChange={set('start2')} min={s.domain.y[0]} max={s.domain.y[1]} step={0.1} format={(v) => v.toFixed(1)} />
      <ResetButton onClick={() => setC(DEFAULTS)} />
    </>
  )

  return (
    <ModuleLayout
      title="Gradient descent"
      controls={panel}
      intuition={
        <>
          <p>
            Training a model means finding the parameters with the lowest loss. Picture the loss as a
            landscape over the parameters. You can’t see the whole landscape, only the slope under your feet
            (the <b>gradient</b>). Gradient descent repeats one move: take a step downhill, sized by the{' '}
            <b>learning rate</b>.
          </p>
          <p>
            Too small a step and you crawl. Too big and you overshoot the valley floor, land higher on the
            other side, and bounce out. When the valley is much steeper one way than the other (features on
            very different scales), the step that is safe for the steep direction is tiny for the shallow
            one, and the path zig-zags. <b>Momentum</b> keeps a running velocity so the zig-zags cancel and
            the steady direction builds up. And when the landscape has several valleys, where you start
            decides where you end.
          </p>
        </>
      }
      play={
        <>
          <PlotFigure build={buildContour} label="Loss contours with the gradient descent path" />
          <StatRow>
            <Stat label="Status" value={run.diverged ? <Status level="bad">diverged</Status> : Number.isNaN(run.convergedAt) ? <Status level="warn">not there yet</Status> : <Status level="good">converged</Status>} note={Number.isNaN(run.convergedAt) ? `${c.steps} steps` : `at step ${run.convergedAt}`} />
            <Stat label="Final w" value={run.diverged ? '∞' : `(${last.w1.toFixed(2)}, ${last.w2.toFixed(2)})`} note={`best (${s.minimum[0]}, ${s.minimum[1]})`} />
            <Stat label="Loss above best" value={run.diverged ? '∞' : (last.loss - fMin).toExponential(1)} />
          </StatRow>
          <PlotFigure build={buildLoss} label="Loss gap over steps" />
          <p className="try">
            On the bowl with κ = 10, slide the learning rate up slowly. Below {lrFmt(maxStableLr(c.kappa))} it settles;
            above it the path flies off. Then set κ = 1: a round bowl, where a single big step lands almost on the
            star.
          </p>
        </>
      }
      breakIt={
        <>
          <div className={styles.buttons}>
            {PRESETS.map((p) => (
              <button key={p.label} type="button" onClick={() => setC((s) => ({ ...s, ...p.c }))}>
                {p.bug ? '✗ ' : ''}
                {p.label}
              </button>
            ))}
          </div>
          <ul>
            <li>
              <b>Step too big:</b> each step overshoots by more than it gains, so the loss grows exponentially. In
              practice: loss goes to NaN in the first epochs. Lower the learning rate (or use a warm-up).
            </li>
            <li>
              <b>Narrow valley:</b> the steep direction caps the learning rate, so progress along the shallow
              direction takes hundreds of steps. Standardising features makes the bowl round (κ → 1); momentum
              or adaptive methods (Adam) help when you can’t.
            </li>
            <li>
              <b>Wrong valley:</b> on the two-valley surface, starting right ends in the shallower minimum, which is a
              local optimum. Gradient descent only knows “downhill from here”. Random restarts, noise (SGD) and
              better initialisation are the usual answers.
            </li>
          </ul>
        </>
      }
      explainBack={
        <ExplainBack
          questions={[
            {
              q: 'Describe one step of gradient descent.',
              a: 'Compute the gradient of the loss with respect to the parameters (the direction of steepest increase), then move the parameters a small amount in the opposite direction: w ← w − η·∇L(w).',
            },
            {
              q: 'Why does a too-large learning rate diverge rather than just converge faster?',
              a: 'Along a direction with curvature c, a step multiplies the distance to the minimum by (1 − η·c). If η > 2/c that factor is below −1: each step overshoots to a point further away than before, so the error grows.',
            },
            {
              q: 'Why does feature scaling speed up training of linear models?',
              a: 'Features on different scales make the loss surface a stretched valley (high condition number). The learning rate must suit the steepest direction, so the shallow directions move very slowly. Scaling makes curvatures similar, allowing a larger effective step everywhere.',
            },
            {
              q: 'What does momentum do?',
              a: 'It accumulates a velocity: each update is the gradient step plus a fraction β of the previous update. Oscillating components cancel and consistent ones add up, which speeds progress along shallow, consistent directions and damps zig-zags.',
            },
          ]}
        />
      }
    />
  )
}
