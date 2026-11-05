import * as Plot from '@observablehq/plot'
import { useCallback } from 'react'
import PlotFigure from '../../../components/PlotFigure.tsx'
import { Stat, StatRow } from '../../../components/Stat.tsx'
import type { VizTheme } from '../../../components/vizTheme.ts'
import { analyticPower } from '../../../core/abtest.ts'
import { approx, compact, int, pct } from '../../../format.ts'
import { N_MAX, N_MIN } from '../constants.ts'
import type { Simulation } from '../simulation.ts'

const LINE = 'Formula (analytic power)'
const DOT = 'Simulated, at current n'

export default function PowerCurve({ sim }: { sim: Simulation }) {
  const { params } = sim

  const build = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const curve = Array.from({ length: 120 }, (_, i) => {
        const n = Math.round(N_MIN * Math.pow(N_MAX / N_MIN, i / 119))
        return { n, power: analyticPower({ ...params, n }) }
      })
      const here = [{ n: params.n, power: sim.shareSignificant }]
      const showReq = Number.isFinite(sim.requiredN) && sim.requiredN <= N_MAX
      return {
        width,
        height: 280,
        marginTop: 24,
        x: { type: 'log', domain: [N_MIN, N_MAX], ticks: [100, 1e3, 1e4, 1e5, 1e6], label: 'Users per arm (log scale) →', tickFormat: compact, grid: true },
        y: { domain: [0, 1], label: '↑ power', tickFormat: (d: number) => pct(d, 0), grid: true },
        color: { domain: [LINE, DOT], range: [t.series1, t.series2], legend: true },
        marks: [
          Plot.ruleY([0.8], { stroke: t.muted }),
          Plot.text([0.8], { y: (d: number) => d, frameAnchor: 'left', dx: 4, dy: -8, text: () => '80% power', fill: t.inkSecondary }),
          ...(showReq
            ? [
                Plot.ruleX([sim.requiredN], { stroke: t.muted }),
                Plot.text([sim.requiredN], { x: (d: number) => d, frameAnchor: 'bottom', dx: 4, dy: -24, textAnchor: 'start', text: () => `80% needs ${approx(sim.requiredN)}`, fill: t.inkSecondary }),
              ]
            : []),
          Plot.line(curve, { x: 'n', y: 'power', stroke: () => LINE, strokeWidth: 2 }),
          Plot.ruleX(curve, Plot.pointerX({ x: 'n', stroke: t.axis })),
          Plot.tip(curve, Plot.pointerX({ x: 'n', y: 'power', format: { x: int, y: (d: number) => pct(d) } })),
          Plot.dot(here, { x: 'n', y: 'power', r: 5, fill: () => DOT, stroke: t.surface, strokeWidth: 2 }),
        ],
      }
    },
    [params, sim.shareSignificant, sim.requiredN],
  )

  return (
    <>
      <h3>View 3: power curve</h3>
      <p className="lede">
        Power is the chance a test detects the lift that is really there. It depends on the lift,
        the baseline, α and n. The dot is the simulated share from view 2; it should sit on the line.
      </p>
      <StatRow>
        <Stat label="Power at current n" value={pct(sim.power)} note={`simulated: ${pct(sim.shareSignificant)}`} />
        <Stat
          label="Users per arm for 80% power"
          value={Number.isFinite(sim.requiredN) ? int(sim.requiredN) : '∞'}
          note={params.lift === 0 ? 'no effect to detect' : `for a ${pct(params.lift)} relative lift`}
        />
      </StatRow>
      <PlotFigure build={build} label={`Power against sample size; ${pct(sim.power)} at ${int(params.n)} users per arm.`} />
    </>
  )
}
