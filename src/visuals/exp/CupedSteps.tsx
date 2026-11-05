import { scaleLinear } from 'd3'
import { useMemo } from 'react'
import { useVizTheme } from '../../components/vizTheme.ts'
import { mulberry32, normal } from '../../core/random.ts'
import type { VisualProps } from '../index.ts'
import { useWidth } from '../useWidth.ts'
import s from '../visuals.module.css'

/** CUPED in three moves: outcomes alone, against last month, then minus the predictable part. */
export default function CupedSteps({ state }: VisualProps) {
  const t = useVizTheme()
  const { ref, width } = useWidth()
  const phase = Number(state?.phase ?? 1)
  const pts = useMemo(() => {
    const rng = mulberry32(8)
    return Array.from({ length: 160 }, (_, i) => {
      const x = normal(rng)
      const treated = i % 2 === 1
      return { x, y: 0.8 * x + 0.6 * normal(rng) + (treated ? 0.35 : 0), treated }
    })
  }, [])
  const theta = 0.8
  const yAdj = (p: (typeof pts)[number]) => p.y - theta * p.x
  const h = 280
  const mg = { l: 30, r: 120, t: 14, b: 30 }
  const xs = scaleLinear().domain([-3, 3]).range([mg.l, width - mg.r])
  const ys = scaleLinear().domain([-3, 3]).range([h - mg.b, mg.t])
  const sd = (v: number[]) => {
    const m = v.reduce((a, b) => a + b, 0) / v.length
    return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1))
  }
  const shown = (p: (typeof pts)[number]) => (phase >= 3 ? yAdj(p) : p.y)
  const px = (p: (typeof pts)[number]) => (phase === 1 ? width - mg.r - 60 + (p.treated ? 24 : 0) : xs(p.x))
  const sdNow = sd(pts.map(shown))

  return (
    <div ref={ref} className={s.wrap}>
      <div className={s.readout}>
        <span>
          Spread of the outcome <b>{sdNow.toFixed(2)}</b>
        </span>
        {phase >= 3 && (
          <span>
            was <b>{sd(pts.map((p) => p.y)).toFixed(2)}</b>: variance kept ≈ <b>{((sdNow / sd(pts.map((p) => p.y))) ** 2 * 100).toFixed(0)}%</b>
          </span>
        )}
      </div>
      <svg width={width} height={h} role="img" aria-label={`CUPED step ${phase}`}>
        {phase === 2 && <line x1={xs(-3)} x2={xs(3)} y1={ys(-3 * theta + 0.17)} y2={ys(3 * theta + 0.17)} stroke={t.ink} strokeWidth={2} />}
        {pts.map((p, i) => (
          <circle key={i} cx={px(p)} cy={ys(shown(p))} r={3} fill={p.treated ? t.series2 : t.series1} fillOpacity={0.7} style={{ transition: 'cx 0.6s, cy 0.6s' }} />
        ))}
        {phase >= 2 && (
          <text x={xs(0)} y={h - 6} textAnchor="middle" fontSize={11} fill={t.inkSecondary}>
            last month’s value (before the test) →
          </text>
        )}
        <text x={mg.l} y={mg.t + 4} fontSize={11} fill={t.inkSecondary}>
          {phase >= 3 ? '↑ outcome minus θ·(last month)' : '↑ outcome during the test'}
        </text>
        <g transform={`translate(${width - mg.r + 10}, ${mg.t + 20})`}>
          <circle r={5} cx={5} cy={-4} fill={t.series1} />
          <text x={14} fontSize={11} fill={t.inkSecondary}>
            control
          </text>
          <circle r={5} cx={5} cy={14} fill={t.series2} />
          <text x={14} y={18} fontSize={11} fill={t.inkSecondary}>
            treatment
          </text>
        </g>
      </svg>
    </div>
  )
}
