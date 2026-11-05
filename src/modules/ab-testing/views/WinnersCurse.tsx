import * as Plot from '@observablehq/plot'
import { useCallback } from 'react'
import PlotFigure from '../../../components/PlotFigure.tsx'
import { Stat, StatRow } from '../../../components/Stat.tsx'
import type { VizTheme } from '../../../components/vizTheme.ts'
import { winnersCurse } from '../../../core/abtest.ts'
import { int, pct, signedPct } from '../../../format.ts'
import type { Simulation } from '../simulation.ts'

const WIN = 'Significant winner'
const REST = 'Everything else'

export default function WinnersCurse({ sim }: { sim: Simulation }) {
  const { params, results } = sim
  const { meanLift, count } = winnersCurse(results)

  const build = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const data = results
        .filter((r) => Number.isFinite(r.relLift))
        .map((r) => ({ lift: r.relLift, kind: r.significant && r.diff > 0 ? WIN : REST }))
      const lines = [{ x: params.lift, label: `true ${signedPct(params.lift)}` }]
      if (Number.isFinite(meanLift)) lines.push({ x: meanLift, label: `winners avg ${signedPct(meanLift)}` })
      return {
        width,
        height: 260,
        marginTop: 30,
        x: { label: 'Estimated relative lift →', tickFormat: (d: number) => signedPct(d, 0), grid: true },
        y: { label: '↑ tests', grid: true },
        color: { domain: [WIN, REST], range: [t.series1, t.neutral], legend: true },
        marks: [
          Plot.rectY(data, Plot.binX<Plot.RectYOptions>({ y: 'count' }, { x: 'lift', fill: 'kind', thresholds: 40, insetLeft: 1, insetRight: 1, tip: true })),
          Plot.ruleY([0], { stroke: t.axis }),
          Plot.ruleX(lines, { x: 'x', stroke: t.ink, strokeWidth: 1 }),
          // staggered so the two labels don't collide when the lines are close
          ...lines.map((l, i) =>
            Plot.text([l], { x: 'x', text: 'label', frameAnchor: 'top', dy: i === 0 ? -22 : -8, fill: t.inkSecondary }),
          ),
        ],
      }
    },
    [results, params.lift, meanLift],
  )

  const ratio = meanLift / params.lift

  return (
    <>
      <h3>The winner’s curse</h3>
      <p className="lede">
        Each test estimates the lift with noise. When power is low, only the tests that got lucky
        and overshot clear the significance bar, so “the winners” overstate the truth.
      </p>
      <StatRow>
        <Stat label="True lift" value={signedPct(params.lift)} />
        <Stat label="Average lift among winners" value={signedPct(meanLift)} note={`${int(count)} significant positive tests`} />
        {params.lift > 0 && Number.isFinite(ratio) && (
          <Stat label="Exaggeration" value={`${ratio.toFixed(1)}×`} note={`at ${pct(sim.power, 0)} power`} />
        )}
      </StatRow>
      <PlotFigure
        build={build}
        label={`Histogram of estimated lifts; significant winners average ${signedPct(meanLift)} vs a true lift of ${signedPct(params.lift)}.`}
      />
      <p className="try">
        Try this: set <b>true lift to 5%</b> and <b>users per arm to 2,000</b> (power under 10%). The
        winners claim several times the real lift. Now raise n until power is 80% or more and watch
        the gap close.
      </p>
    </>
  )
}
