import * as Plot from '@observablehq/plot'
import { useCallback } from 'react'
import PlotFigure from '../../../components/PlotFigure.tsx'
import { Stat, StatRow } from '../../../components/Stat.tsx'
import type { VizTheme } from '../../../components/vizTheme.ts'
import { int, pct } from '../../../format.ts'
import type { Simulation } from '../simulation.ts'

const BIN = 0.025
const SIG = 'p < α (significant)'
const NOT = 'p ≥ α'

export default function ManyTests({ sim }: { sim: Simulation }) {
  const { params, results } = sim
  const noEffect = params.lift === 0

  const build = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const data = results.map((r) => ({ p: r.pValue, kind: r.significant ? SIG : NOT }))
      const flat = results.length * BIN
      return {
        width,
        height: 260,
        marginTop: 24,
        x: { domain: [0, 1], label: 'p-value →' },
        y: { label: '↑ tests', grid: true },
        color: { domain: [SIG, NOT], range: [t.series1, t.neutral], legend: true },
        marks: [
          Plot.rectY(
            data,
            Plot.binX<Plot.RectYOptions>(
              { y: 'count' },
              {
                x: 'p',
                fill: 'kind',
                // bin edges at α as well, so no bar straddles the cut-off
                thresholds: [...new Set([params.alpha, ...Array.from({ length: 1 / BIN + 1 }, (_, i) => i * BIN)])]
                  .filter((x) => x <= 1)
                  .sort((a, b) => a - b),
                insetLeft: 1,
                insetRight: 1,
                tip: true,
              },
            ),
          ),
          Plot.ruleY([0], { stroke: t.axis }),
          Plot.ruleY([flat], { stroke: t.ink, strokeWidth: 1 }),
          Plot.text([flat], {
            y: (d: number) => d,
            frameAnchor: 'right',
            dy: -8,
            text: () => 'height if there were no effect (flat)',
            fill: t.inkSecondary,
          }),
        ],
      }
    },
    [results, params.alpha],
  )

  return (
    <>
      <h3>View 2: many tests</h3>
      <p className="lede">
        The same experiment rerun {int(results.length)} times. With no real effect,
        p-values are spread evenly from 0 to 1, so a share α of them land below α by pure chance.
        A real effect piles them up near 0.
      </p>
      <StatRow>
        <Stat label="Came out significant" value={pct(sim.shareSignificant)} note={`${int(results.filter((r) => r.significant).length)} of ${int(results.length)} tests`} />
        <Stat
          label={noEffect ? 'Theory: false-positive rate' : 'Theory: power'}
          value={pct(sim.power)}
          note={noEffect ? 'equals α when there is no effect' : 'chance a test detects this lift'}
        />
      </StatRow>
      <PlotFigure
        build={build}
        label={`Histogram of ${results.length} p-values; ${pct(sim.shareSignificant)} are below alpha.`}
      />
    </>
  )
}
