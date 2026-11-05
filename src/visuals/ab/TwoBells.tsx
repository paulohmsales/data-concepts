import { area, line, scaleLinear } from 'd3'
import { useState } from 'react'
import { normalCdf, normalQuantile } from '../../core/abtest.ts'
import { normalPdf } from '../../core/stats.ts'
import { useVizTheme } from '../../components/vizTheme.ts'
import type { VisualProps } from '../index.ts'
import { useWidth } from '../useWidth.ts'
import s from '../visuals.module.css'

/** H0 and H1 sampling distributions of the estimate (in SE units), with α and power shaded. */
export default function TwoBells({ props }: VisualProps) {
  const t = useVizTheme()
  const { ref, width } = useWidth()
  const [delta, setDelta] = useState(Number(props.effectSe ?? 2.5))
  const [alpha, setAlpha] = useState(Number(props.alpha ?? 0.05))
  const h = 260
  const m = { l: 16, r: 16, t: 18, b: 34 }
  const x = scaleLinear().domain([-4, 8]).range([m.l, width - m.r])
  const y = scaleLinear().domain([0, 0.42]).range([h - m.b, m.t])
  const crit = normalQuantile(1 - alpha / 2)
  const xs = Array.from({ length: 241 }, (_, i) => -4 + (12 * i) / 240)
  const curve = (mu: number) => line<number>().x((v) => x(v)).y((v) => y(normalPdf(v, mu)))(xs) ?? ''
  const shade = (mu: number, from: number, to: number) =>
    area<number>()
      .x((v) => x(v))
      .y0(y(0))
      .y1((v) => y(normalPdf(v, mu)))(xs.filter((v) => v >= from && v <= to)) ?? ''
  const power = 1 - normalCdf(crit - delta) + normalCdf(-crit - delta)

  return (
    <div ref={ref} className={s.wrap}>
      <div className={s.controls}>
        <label>
          True effect (in standard errors) <input type="range" min={0} max={5} step={0.1} value={delta} onChange={(e) => setDelta(Number(e.target.value))} /> <b>{delta.toFixed(1)}</b>
        </label>
        <label>
          α <input type="range" min={0.01} max={0.2} step={0.01} value={alpha} onChange={(e) => setAlpha(Number(e.target.value))} /> <b>{alpha.toFixed(2)}</b>
        </label>
      </div>
      <div className={s.readout}>
        <span>
          Critical value ±<b>{crit.toFixed(2)}</b>
        </span>
        <span style={{ color: '#d03b3b' }}>
          False positives (α) <b>{(alpha * 100).toFixed(0)}%</b>
        </span>
        <span style={{ color: t.series1 }}>
          Power <b>{(power * 100).toFixed(0)}%</b>
        </span>
      </div>
      <svg width={width} height={h} role="img" aria-label={`Two sampling distributions; power ${(power * 100).toFixed(0)} percent`}>
        <path d={shade(delta, crit, 8)} fill={t.series1} fillOpacity={0.3} />
        <path d={shade(0, crit, 8)} fill="#d03b3b" fillOpacity={0.55} />
        <path d={shade(0, -4, -crit)} fill="#d03b3b" fillOpacity={0.55} />
        <path d={curve(0)} fill="none" stroke={t.muted} strokeWidth={2} />
        <path d={curve(delta)} fill="none" stroke={t.series1} strokeWidth={2.5} />
        {[crit, -crit].map((c) => (
          <line key={c} x1={x(c)} x2={x(c)} y1={m.t - 6} y2={h - m.b} stroke={t.ink} strokeDasharray="4 3" />
        ))}
        <line x1={m.l} x2={width - m.r} y1={y(0)} y2={y(0)} stroke={t.axis} />
        {[-3, 0, 3, 6].map((v) => (
          <text key={v} x={x(v)} y={h - m.b + 16} textAnchor="middle" fontSize={11} fill={t.inkSecondary}>
            {v === 0 ? '0' : `${v > 0 ? '+' : ''}${v} SE`}
          </text>
        ))}
        <text x={x(0)} y={y(0.4) - 4} textAnchor="middle" fontSize={12} fill={t.inkSecondary}>
          no effect (H₀)
        </text>
        <text x={x(delta + 1.1)} y={y(normalPdf(1.1)) - 6} textAnchor="start" fontSize={12} fill={t.series1} fontWeight={600}>
          true effect (H₁)
        </text>
        <text x={x(crit) + 4} y={h - m.b - 6} fontSize={11} fill={t.ink}>
          significant →
        </text>
      </svg>
    </div>
  )
}
