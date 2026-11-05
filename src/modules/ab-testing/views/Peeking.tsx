import * as Plot from '@observablehq/plot'
import { useCallback } from 'react'
import PlotFigure from '../../../components/PlotFigure.tsx'
import { Stat, StatRow } from '../../../components/Stat.tsx'
import type { VizTheme } from '../../../components/vizTheme.ts'
import { compact, int, pct, pValue } from '../../../format.ts'
import type { Simulation } from '../simulation.ts'

const SHOWN = 30
const CROSSED = 'Dipped below α at some look'
const NEVER = 'Never dipped below α'

export default function Peeking({ sim }: { sim: Simulation }) {
  const { params, peeks } = sim

  const build = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const data = peeks.slice(0, SHOWN).flatMap((path) =>
        path.points.map((pt) => ({ id: path.id, n: pt.n, p: pt.pValue, kind: path.crossed ? CROSSED : NEVER })),
      )
      return {
        width,
        height: 300,
        marginTop: 24,
        x: { label: 'Users per arm seen so far →', tickFormat: compact, grid: true },
        y: { domain: [0, 1], label: '↑ p-value at this look', grid: true },
        color: { domain: [CROSSED, NEVER], range: [t.series2, t.neutral], legend: true },
        marks: [
          Plot.line(data, { x: 'n', y: 'p', z: 'id', stroke: 'kind', strokeWidth: 1.5, strokeOpacity: 0.8 }),
          Plot.ruleY([params.alpha], { stroke: t.ink, strokeWidth: 1 }),
          Plot.text([params.alpha], { y: (d: number) => d, frameAnchor: 'right', dy: -8, text: () => `α = ${params.alpha}`, fill: t.ink }),
          Plot.tip(
            data,
            Plot.pointer({
              x: 'n',
              y: 'p',
              channels: { test: (d: { id: number }) => `#${d.id + 1}` },
              format: { x: int, y: (d: number) => pValue(d), stroke: false },
            }),
          ),
        ],
      }
    },
    [peeks, params.alpha],
  )

  const inflation = sim.shareEverCrossed / Math.max(sim.shareEndSignificant, 1e-9)

  return (
    <>
      <h3>Peeking</h3>
      <p className="lede">
        Now imagine checking the dashboard {params.looks} times during the test and stopping the first time
        p dips below α. Each line is one experiment ({Math.min(SHOWN, peeks.length)} of {int(peeks.length)} shown).
        A p-value wanders a lot early on, and every look is another chance to catch it on a low.
      </p>
      <StatRow>
        <Stat label="Called a winner by a peeker" value={pct(sim.shareEverCrossed)} note={`p < α at any of ${params.looks} looks`} />
        <Stat label="Significant at the planned end" value={pct(sim.shareEndSignificant)} note="the honest rate" />
        {params.lift === 0 && Number.isFinite(inflation) && (
          <Stat label="False positives inflated" value={`${inflation.toFixed(1)}×`} note={`vs the α = ${params.alpha} you thought you had`} />
        )}
      </StatRow>
      <PlotFigure
        build={build}
        label={`Running p-values for ${Math.min(SHOWN, peeks.length)} experiments; ${pct(sim.shareEverCrossed)} of all experiments dip below alpha at some look.`}
      />
      <p className="try">
        Try this: set <b>true lift to 0%</b>. Every “win” is now a false positive. Compare the two
        numbers above, then raise <b>looks</b> from 1 to 50 and watch the peeker’s rate climb.
      </p>
    </>
  )
}
