import * as Plot from '@observablehq/plot'
import { useCallback } from 'react'
import PlotFigure from '../../../components/PlotFigure.tsx'
import { Stat, StatRow } from '../../../components/Stat.tsx'
import type { VizTheme } from '../../../components/vizTheme.ts'
import { rateB } from '../../../core/abtest.ts'
import { int, pct, pp, pValue } from '../../../format.ts'
import type { Simulation } from '../simulation.ts'

export default function SingleTest({ sim }: { sim: Simulation }) {
  const r = sim.results[0]
  const { params } = sim
  const trueDiff = rateB(params) - params.baseline
  const level = 1 - params.alpha

  const build = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const row = [{ label: 'B − A', diff: r.diff, lo: r.ci[0], hi: r.ci[1] }]
      const span = Math.max(Math.abs(r.ci[0]), Math.abs(r.ci[1]), Math.abs(trueDiff)) * 1.15 || 0.01
      return {
        width,
        height: 130,
        marginLeft: 50,
        marginTop: 30,
        x: {
          domain: [-span, span],
          label: 'Difference in conversion rate (B − A) →',
          tickFormat: (d: number) => pp(d, 1),
          grid: true,
        },
        y: { label: null },
        marks: [
          Plot.ruleX([0], { stroke: t.axis }),
          Plot.ruleX([trueDiff], { stroke: t.ink, strokeWidth: 1 }),
          Plot.text([trueDiff], {
            x: (d: number) => d,
            frameAnchor: 'top',
            dy: -18,
            text: () => `true difference ${pp(trueDiff)}`,
            fill: t.inkSecondary,
          }),
          Plot.ruleY(row, { x1: 'lo', x2: 'hi', y: 'label', stroke: t.series1, strokeWidth: 2 }),
          Plot.dot(row, {
            x: 'diff',
            y: 'label',
            r: 5,
            fill: t.series1,
            stroke: t.surface,
            strokeWidth: 2,
            channels: { 'CI low': 'lo', 'CI high': 'hi' },
            tip: { format: { x: (d: number) => pp(d), 'CI low': (d: number) => pp(d), 'CI high': (d: number) => pp(d), y: false } },
          }),
        ],
      }
    },
    [r, trueDiff],
  )

  return (
    <>
      <h3>View 1: one test</h3>
      <p className="lede">
        One experiment with {int(params.n)} users per arm. Change the seed to rerun it
        with fresh luck.
      </p>
      <StatRow>
        <Stat label="A converted" value={pct(r.rateA, 2)} note={`${int(r.convA)} of ${int(r.nA)}`} />
        <Stat label="B converted" value={pct(r.rateB, 2)} note={`${int(r.convB)} of ${int(r.nB)}`} />
        <Stat label="Observed B − A" value={pp(r.diff)} note={`${Math.round(level * 100)}% CI ${pp(r.ci[0])} to ${pp(r.ci[1])}`} />
        <Stat
          label="p-value"
          value={pValue(r.pValue)}
          note={r.significant ? `below α = ${params.alpha}: “significant”` : `not below α = ${params.alpha}`}
        />
      </StatRow>
      <PlotFigure
        build={build}
        label={`Observed difference ${pp(r.diff)} with confidence interval ${pp(r.ci[0])} to ${pp(r.ci[1])}; true difference ${pp(trueDiff)}.`}
      />
    </>
  )
}
