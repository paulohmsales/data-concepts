import * as Plot from '@observablehq/plot'
import { useCallback } from 'react'
import PlotFigure from '../../components/PlotFigure.tsx'
import type { VizTheme } from '../../components/vizTheme.ts'
import type { SnapRow } from '../../core/loads.ts'
import { PLANS } from './sandbox.ts'

interface Props {
  snaps: SnapRow[]
  now: number
  asOf: number
  snapshotTicks: number[]
}

/** SCD2 history as bars: one row per key, one bar per version (valid_from → valid_to). */
export default function Timeline({ snaps, now, asOf, snapshotTicks }: Props) {
  const build = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const keys = [...new Set(snaps.map((s) => `#${s.id} ${s.name}`))]
      const data = snaps.map((s) => ({
        key: `#${s.id} ${s.name}`,
        plan: s.plan,
        from: s.valid_from,
        to: s.valid_to ?? now,
        open: s.valid_to === null,
        valid_to: s.valid_to === null ? 'NULL (current)' : String(s.valid_to),
      }))
      return {
        width,
        height: Math.max(120, keys.length * 30 + 70),
        marginLeft: 90,
        marginTop: 28,
        x: { domain: [1, Math.max(now, 2)], label: 'Tick →', grid: true, tickFormat: 'd' },
        y: { domain: keys, label: null },
        color: { domain: [...PLANS], range: [t.series1, t.series2, t.series3], legend: true },
        marks: [
          // when the snapshot job ran: faint verticals
          Plot.ruleX(snapshotTicks, { stroke: t.muted, strokeOpacity: 0.35 }),
          Plot.barX(data, {
            x1: 'from',
            x2: 'to',
            y: 'key',
            fill: 'plan',
            insetTop: 7,
            insetBottom: 7,
            insetLeft: 1,
            insetRight: 1,
            rx: 3,
            channels: { valid_from: 'from', valid_to: 'valid_to' },
            tip: { format: { x1: false, x2: false, y: true, fill: true } },
          }),
          Plot.ruleX([asOf], { stroke: t.ink, strokeWidth: 1.5 }),
          Plot.text([asOf], { x: (d: number) => d, frameAnchor: 'top', dy: -16, text: () => `T = ${asOf}`, fill: t.ink }),
        ],
      }
    },
    [snaps, now, asOf, snapshotTicks],
  )

  if (snaps.length === 0) return <p className="lede">No snapshots yet: run the SCD2 snapshot job.</p>
  return (
    <PlotFigure
      build={build}
      label={`SCD2 history for ${new Set(snaps.map((s) => s.id)).size} customers, ${snaps.length} versions.`}
    />
  )
}
