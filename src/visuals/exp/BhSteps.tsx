import { scaleLinear } from 'd3'
import { useVizTheme } from '../../components/vizTheme.ts'
import type { VisualProps } from '../index.ts'
import { useWidth } from '../useWidth.ts'
import s from '../visuals.module.css'

// ten sorted p-values from a screen of 10 hypotheses
const P = [0.001, 0.004, 0.011, 0.021, 0.024, 0.041, 0.089, 0.21, 0.47, 0.73]
const Q = 0.05

/** Benjamini–Hochberg step by step: sort, draw the line q·k/m, find the last p under it, reject up to there. */
export default function BhSteps({ state }: VisualProps) {
  const t = useVizTheme()
  const { ref, width } = useWidth()
  const phase = Number(state?.phase ?? 1)
  const m = P.length
  const h = 240
  const mg = { l: 44, r: 16, t: 14, b: 32 }
  const x = scaleLinear().domain([0.5, m + 0.5]).range([mg.l, width - mg.r])
  const y = scaleLinear().domain([0, 0.1]).range([h - mg.b, mg.t]).clamp(true)
  const lastUnder = Math.max(-1, ...P.map((p, i) => (p <= (Q * (i + 1)) / m ? i : -1)))
  const bonf = Q / m

  return (
    <div ref={ref} className={s.wrap}>
      <svg width={width} height={h} role="img" aria-label={`Benjamini-Hochberg step ${phase}`}>
        {phase >= 2 && <line x1={x(0.5)} x2={x(m + 0.5)} y1={y((Q * 0.5) / m)} y2={y((Q * (m + 0.5)) / m)} stroke={t.series1} strokeWidth={2} />}
        {phase >= 2 && (
          <text x={x(m)} y={y((Q * m) / m) - 6} textAnchor="end" fontSize={11} fill={t.series1}>
            BH line: q·k/m
          </text>
        )}
        {phase >= 4 && <line x1={x(0.5)} x2={x(m + 0.5)} y1={y(bonf)} y2={y(bonf)} stroke={t.series2} strokeDasharray="5 3" />}
        {phase >= 4 && (
          <text x={x(m)} y={y(bonf) + 14} textAnchor="end" fontSize={11} fill={t.series2}>
            Bonferroni: q/m = 0.005
          </text>
        )}
        {P.map((p, i) => {
          const under = p <= (Q * (i + 1)) / m
          const rejected = phase >= 3 && i <= lastUnder
          return (
            <g key={i}>
              <circle cx={x(i + 1)} cy={y(p)} r={6} fill={rejected ? t.series1 : t.surface} stroke={phase >= 2 && under ? t.series1 : t.ink} strokeWidth={2} />
              <text x={x(i + 1)} y={h - mg.b + 16} textAnchor="middle" fontSize={11} fill={t.inkSecondary}>
                {i + 1}
              </text>
              {p > 0.1 && (
                <text x={x(i + 1)} y={mg.t + 4} textAnchor="middle" fontSize={10} fill={t.inkSecondary}>
                  ↑ {p}
                </text>
              )}
            </g>
          )
        })}
        {phase >= 3 && lastUnder >= 0 && (
          <rect x={x(0.6)} width={x(lastUnder + 1.4) - x(0.6)} y={mg.t} height={h - mg.t - mg.b} fill={t.series1} fillOpacity={0.08} rx={6} />
        )}
        {[0, 0.025, 0.05, 0.075, 0.1].map((v) => (
          <text key={v} x={mg.l - 6} y={y(v) + 4} textAnchor="end" fontSize={10} fill={t.inkSecondary}>
            {v}
          </text>
        ))}
        <text x={width - mg.r} y={h - 4} textAnchor="end" fontSize={11} fill={t.inkSecondary}>
          rank k (p-values sorted) →
        </text>
      </svg>
    </div>
  )
}
