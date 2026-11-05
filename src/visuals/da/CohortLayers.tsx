import { area, scaleLinear, interpolateBlues } from 'd3'
import { useState } from 'react'
import { useVizTheme } from '../../components/vizTheme.ts'
import { retentionCurve } from '../../core/cohorts.ts'
import type { VisualProps } from '../index.ts'
import { useWidth } from '../useWidth.ts'
import s from '../visuals.module.css'

const WEEKS = 20

/** Weekly active users as a stack of cohorts: each band is one signup week, shrinking as it ages. */
export default function CohortLayers({ props }: VisualProps) {
  const t = useVizTheme()
  const { ref, width } = useWidth()
  const [worse, setWorse] = useState(Boolean(props.worse ?? false))
  const growth = 1.12
  const active = Array.from({ length: WEEKS }, (_, c) =>
    Array.from({ length: WEEKS }, (_, w) => {
      if (w < c) return 0
      const floor = worse && c >= 10 ? 0.08 : 0.25
      return 1000 * growth ** c * retentionCurve(w - c, floor, 2)
    }),
  )
  const totals = Array.from({ length: WEEKS }, (_, w) => active.reduce((a, row) => a + row[w], 0))
  const h = 280
  const mg = { l: 50, r: 16, t: 12, b: 28 }
  const x = scaleLinear().domain([0, WEEKS - 1]).range([mg.l, width - mg.r])
  const y = scaleLinear().domain([0, Math.max(...totals) * 1.05]).range([h - mg.b, mg.t])
  const bands = active.map((row, c) => {
    const below = (w: number) => active.slice(0, c).reduce((a, r) => a + r[w], 0)
    return area<number>()
      .x((w) => x(w))
      .y0((w) => y(below(w)))
      .y1((w) => y(below(w) + row[w]))(Array.from({ length: WEEKS }, (_, w) => w).filter((w) => w >= c - 1 && w >= 0)) ?? ''
  })

  return (
    <div ref={ref} className={s.wrap}>
      <div className={s.controls}>
        <label>
          <input type="checkbox" checked={worse} onChange={(e) => setWorse(e.target.checked)} /> Product gets worse from week 11 (new users stick a third as much)
        </label>
      </div>
      <svg width={width} height={h} role="img" aria-label="Weekly active users stacked by signup cohort">
        {bands.map((d, c) => (
          <path key={c} d={d} fill={interpolateBlues(0.25 + 0.7 * (c / WEEKS))} stroke={t.surface} strokeWidth={0.5} fillOpacity={worse && c >= 10 ? 1 : 0.9} />
        ))}
        {worse && <line x1={x(10)} x2={x(10)} y1={mg.t} y2={h - mg.b} stroke="#d03b3b" strokeDasharray="4 3" />}
        {[0, 5, 10, 15, 19].map((w) => (
          <text key={w} x={x(w)} y={h - 8} textAnchor="middle" fontSize={11} fill={t.inkSecondary}>
            week {w + 1}
          </text>
        ))}
        {y.ticks(4).map((v) => (
          <text key={v} x={mg.l - 6} y={y(v) + 4} textAnchor="end" fontSize={10} fill={t.inkSecondary}>
            {v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
          </text>
        ))}
        <text x={mg.l + 6} y={mg.t + 12} fontSize={11} fill={t.inkSecondary}>
          weekly active users; each band is one signup cohort (darker = newer)
        </text>
      </svg>
    </div>
  )
}
