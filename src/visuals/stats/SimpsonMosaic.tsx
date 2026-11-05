import { useState } from 'react'
import { useVizTheme } from '../../components/vizTheme.ts'
import type { VisualProps } from '../index.ts'
import { useWidth } from '../useWidth.ts'
import s from '../visuals.module.css'

/**
 * Each treatment is a unit square split into easy and hard patients (column widths = the mix),
 * filled up to each group's success rate. The pooled rate is the filled share of the square:
 * a mix-weighted average of the two group rates.
 */
export default function SimpsonMosaic({ props }: VisualProps) {
  const t = useVizTheme()
  const { ref, width } = useWidth()
  const [shareA, setShareA] = useState(Number(props.hardA ?? 0.75))
  const [shareB, setShareB] = useState(Number(props.hardB ?? 0.23))
  const arms = [
    { arm: 'A', hardShare: shareA, easyRate: 0.93, hardRate: 0.73, color: t.series1 },
    { arm: 'B', hardShare: shareB, easyRate: 0.87, hardRate: 0.69, color: t.series2 },
  ]
  const side = Math.min(240, (width - 70) / 2)
  const h = side + 64

  return (
    <div ref={ref} className={s.wrap}>
      <div className={s.controls}>
        <label>
          Hard cases among A <input type="range" min={0} max={1} step={0.01} value={shareA} onChange={(e) => setShareA(Number(e.target.value))} /> <b>{Math.round(shareA * 100)}%</b>
        </label>
        <label>
          Hard cases among B <input type="range" min={0} max={1} step={0.01} value={shareB} onChange={(e) => setShareB(Number(e.target.value))} /> <b>{Math.round(shareB * 100)}%</b>
        </label>
      </div>
      <svg width={width} height={h} role="img" aria-label="Mosaic: success by group and treatment, pooled rate as filled area">
        {arms.map((a, i) => {
          const x0 = 20 + i * (side + 40)
          const easyW = side * (1 - a.hardShare)
          const pooled = (1 - a.hardShare) * a.easyRate + a.hardShare * a.hardRate
          return (
            <g key={a.arm} transform={`translate(${x0}, 26)`}>
              <text x={side / 2} y={-9} textAnchor="middle" fontWeight={700} fontSize={13} fill={t.ink}>
                Treatment {a.arm}: pooled {(pooled * 100).toFixed(1)}%
              </text>
              <rect width={side} height={side} fill={t.surface} stroke={t.axis} />
              <rect x={0} y={side * (1 - a.easyRate)} width={easyW} height={side * a.easyRate} fill={a.color} fillOpacity={0.4} />
              <rect x={easyW} y={side * (1 - a.hardRate)} width={side - easyW} height={side * a.hardRate} fill={a.color} fillOpacity={0.85} />
              <line x1={easyW} x2={easyW} y1={0} y2={side} stroke={t.surface} strokeWidth={3} />
              <line x1={-6} x2={side + 6} y1={side * (1 - pooled)} y2={side * (1 - pooled)} stroke={t.ink} strokeWidth={2} strokeDasharray="5 3" />
              {easyW > 46 && (
                <text x={easyW / 2} y={side + 16} textAnchor="middle" fontSize={11} fill={t.inkSecondary}>
                  easy: {(a.easyRate * 100).toFixed(0)}%
                </text>
              )}
              {side - easyW > 46 && (
                <text x={easyW + (side - easyW) / 2} y={side + 16} textAnchor="middle" fontSize={11} fill={t.inkSecondary}>
                  hard: {(a.hardRate * 100).toFixed(0)}%
                </text>
              )}
              <text x={side + 8} y={side * (1 - pooled) + 4} fontSize={11} fill={t.ink}>
                {(pooled * 100).toFixed(0)}%
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
