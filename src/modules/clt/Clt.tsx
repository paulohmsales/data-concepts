import * as Plot from '@observablehq/plot'
import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import { ResetButton, SeedControl, Choice, Toggle } from '../../components/Controls.tsx'
import DataTable from '../../components/DataTable.tsx'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import PlotFigure from '../../components/PlotFigure.tsx'
import Slider from '../../components/Slider.tsx'
import { Stat, StatRow } from '../../components/Stat.tsx'
import Status from '../../components/Status.tsx'
import type { VizTheme } from '../../components/vizTheme.ts'
import { DISTS, draw, predicted, sampleMeans, type DistName } from '../../core/clt.ts'
import { mulberry32 } from '../../core/random.ts'
import { histogram, mean, normalPdf, quantile, sd, skewness } from '../../core/stats.ts'
import { int } from '../../format.ts'
import styles from '../common.module.css'

interface Controls {
  dist: DistName
  n: number
  k: number
  zoom: boolean
  seed: number
}

const DEFAULTS: Controls = { dist: 'exponential', n: 5, k: 2000, zoom: false, seed: 1 }
const SPREAD_NS = [1, 2, 4, 8, 16, 32, 64, 128, 256]
const f3 = (x: number) => (Number.isFinite(x) ? x.toFixed(3) : 'undefined')

function simulate(c: Controls) {
  const d = DISTS[c.dist]
  const rng = mulberry32(c.seed)
  const population = draw(d, 20_000, rng)
  const means = sampleMeans(d, c.n, c.k, rng)
  // Break it: how the spread of the mean shrinks with n (IQR is robust, so it exists for Cauchy too)
  const spreadRng = mulberry32(c.seed + 7)
  const spread = SPREAD_NS.map((n) => {
    const ms = sampleMeans(d, n, 600, spreadRng)
    return { n, iqr: quantile(ms, 0.75) - quantile(ms, 0.25) }
  })
  return { d, population, means, spread }
}

export default function Clt() {
  const [c, setC] = useState(DEFAULTS)
  const deferred = useDeferredValue(c)
  const sim = useMemo(() => simulate(deferred), [deferred])
  const stale = deferred !== c
  const set = <K extends keyof Controls>(k: K) => (v: Controls[K]) => setC((s) => ({ ...s, [k]: v }))

  const { d, population, means } = sim
  const p = predicted(d, deferred.n)
  const finite = Number.isFinite(d.mu)

  const buildPop = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const h = histogram(population, d.range[0], d.range[1], 40)
      return {
        width,
        height: 200,
        x: { domain: d.range, label: 'one draw →' },
        y: { label: '↑ density', grid: true },
        marks: [
          Plot.rectY(h.bins, { x1: 'x0', x2: 'x1', y: 'density', fill: t.neutral, insetLeft: 1, insetRight: 1, tip: true }),
          Plot.ruleY([0], { stroke: t.axis }),
          ...(Number.isFinite(d.mu) ? [Plot.ruleX([d.mu], { stroke: t.ink, strokeDasharray: '4 3' })] : []),
        ],
      }
    },
    [population, d],
  )

  const buildMeans = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const fit = deferred.zoom && Number.isFinite(p.se)
      const lo = fit ? p.mean - 4.5 * p.se : d.range[0]
      const hi = fit ? p.mean + 4.5 * p.se : d.range[1]
      const h = histogram(means, lo, hi, 50)
      const curve = Number.isFinite(p.se)
        ? Array.from({ length: 201 }, (_, i) => {
            const x = lo + ((hi - lo) * i) / 200
            return { x, y: normalPdf(x, p.mean, p.se) }
          })
        : []
      return {
        width,
        height: 260,
        x: { domain: [lo, hi], label: `mean of ${deferred.n} draws →` },
        y: { label: '↑ density', grid: true },
        color: { domain: ['sample means', 'normal the CLT predicts'], range: [t.series1, t.series2], legend: curve.length > 0 },
        marks: [
          Plot.rectY(h.bins, { x1: 'x0', x2: 'x1', y: 'density', fill: () => 'sample means', insetLeft: 1, insetRight: 1, tip: true }),
          Plot.line(curve, { x: 'x', y: 'y', stroke: () => 'normal the CLT predicts', strokeWidth: 2 }),
          Plot.ruleY([0], { stroke: t.axis }),
        ],
      }
    },
    [means, d, p.mean, p.se, deferred.n, deferred.zoom],
  )

  const buildSpread = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const theory = Number.isFinite(d.sigma)
        ? SPREAD_NS.map((n) => ({ n, iqr: (1.349 * d.sigma) / Math.sqrt(n) }))
        : []
      return {
        width,
        height: 240,
        x: { type: 'log', label: 'sample size n (log) →' },
        y: { type: 'log', label: '↑ spread of the mean (IQR, log)', grid: true, tickFormat: '~g' },
        color: { domain: ['simulated', 'if the CLT holds: ∝ 1/√n'], range: [t.series1, t.series2], legend: true },
        marks: [
          Plot.axisX(SPREAD_NS, { tickFormat: (d: number) => String(d) }),
          Plot.line(theory, { x: 'n', y: 'iqr', stroke: () => 'if the CLT holds: ∝ 1/√n', strokeWidth: 2, strokeDasharray: '5 3' }),
          Plot.line(sim.spread, { x: 'n', y: 'iqr', stroke: () => 'simulated', strokeWidth: 2 }),
          Plot.dot(sim.spread, { x: 'n', y: 'iqr', fill: () => 'simulated', r: 4, tip: true }),
        ],
      }
    },
    [sim.spread, d],
  )

  const skewRows = Object.values(DISTS).map((x) => ({ d: x, at30: x.skew / Math.sqrt(30) }))

  const panel = (
    <>
      <Choice
        label="Population"
        value={c.dist}
        onChange={set('dist')}
        options={Object.values(DISTS).map((x) => ({ value: x.name, label: x.label }))}
      />
      <Slider label="Sample size n" value={c.n} onChange={set('n')} min={1} max={500} step={1} log format={int} />
      <Slider label="Number of samples" value={c.k} onChange={set('k')} min={200} max={5000} step={100} format={int} />
      <Toggle label="Zoom the means chart to fit" checked={c.zoom} onChange={set('zoom')} />
      <SeedControl seed={c.seed} onChange={set('seed')} />
      <ResetButton onClick={() => setC(DEFAULTS)} />
    </>
  )

  return (
    <ModuleLayout
      onPreset={(p) => setC({ ...DEFAULTS, ...(p as Partial<Controls>) })}
      controls={panel}
      play={
        <div className={stale ? styles.stale : undefined}>
          <h3>The population</h3>
          <p className="lede">
            20,000 single draws from “{d.label}”.{' '}
            {finite ? `True mean μ = ${f3(d.mu)} (dashed), σ = ${f3(d.sigma)}.` : 'It has no mean and no standard deviation.'}
          </p>
          <PlotFigure build={buildPop} label={`Histogram of the ${d.label} population`} />
          <h3>Averages of samples</h3>
          <p className="lede">
            {int(deferred.k)} samples of n = {int(deferred.n)}, one bar per range of sample means. The
            orange curve is the normal the CLT predicts: centred on μ, spread σ/√n.
          </p>
          <StatRow>
            <Stat label="Mean of the means" value={f3(mean(means))} note={`μ = ${f3(p.mean)}`} />
            <Stat label="SD of the means (standard error)" value={f3(sd(means))} note={`σ/√n = ${f3(p.se)}`} />
            <Stat label="Skewness of the means" value={f3(skewness(means))} note={`normal = 0; predicted ${f3(p.skew)}`} />
          </StatRow>
          <PlotFigure build={buildMeans} label="Histogram of sample means with the predicted normal curve" />
        </div>
      }
      breakIt={
        <div className={stale ? styles.stale : undefined}>
          <h3>Heavy tails: when averaging stops helping</h3>
          <p className="lede">
            Spread of the sample mean against n, on log scales. Under the CLT it falls along a straight
            line with slope −½ (every 4× the data halves the spread). Pick <b>Cauchy</b>: the line goes
            flat. One extreme draw can drag any average anywhere, so 256 draws are no more precise
            than one.
          </p>
          <PlotFigure build={buildSpread} label="Spread of the sample mean versus sample size, log-log" />
          <h3>The “n = 30 is enough” myth</h3>
          <p className="lede">
            How skewed the sample mean still is at n = 30 (population skew ÷ √30). Above about 0.5 the
            normal approximation is visibly off, so intervals and p-values are off too.
          </p>
          <DataTable
            rows={skewRows}
            rowKey={(r) => r.d.name}
            rowClass={(r) => (r.d.name === deferred.dist ? 'hl' : undefined)}
            columns={[
              { key: 'd', label: 'Population', render: (r) => r.d.label },
              { key: 's', label: 'Skew of one draw', align: 'right', render: (r) => f3(r.d.skew) },
              { key: 'a', label: 'Skew of mean at n = 30', align: 'right', render: (r) => f3(r.at30) },
              {
                key: 'v',
                label: 'Normal yet?',
                render: (r) =>
                  !Number.isFinite(r.at30) ? (
                    <Status level="bad">never</Status>
                  ) : Math.abs(r.at30) < 0.25 ? (
                    <Status level="good">yes</Status>
                  ) : Math.abs(r.at30) < 0.5 ? (
                    <Status level="warn">roughly</Status>
                  ) : (
                    <Status level="bad">no</Status>
                  ),
              },
            ]}
          />
        </div>
      }
    />
  )
}
