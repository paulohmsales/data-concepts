import { line, scaleLinear } from 'd3'
import { useMemo } from 'react'
import { useVizTheme } from '../../components/vizTheme.ts'
import { mulberry32 } from '../../core/random.ts'
import { movingAverage, simulateSeries, weeklyPattern } from '../../core/seasonality.ts'
import type { VisualProps } from '../index.ts'
import { useWidth } from '../useWidth.ts'
import s from '../visuals.module.css'

/** Peel a daily series apart: raw → trend → minus trend → minus weekly pattern → remainder. */
export default function Decompose({ state }: VisualProps) {
  const t = useVizTheme()
  const { ref, width } = useWidth()
  const phase = Number(state?.phase ?? 1)
  const data = useMemo(() => {
    const pts = simulateSeries({ days: 365 * 2, level: 1000, trendPerYear: 150, yearly: 180, weekend: 220, noise: 35 }, mulberry32(4))
    const v = pts.map((p) => p.value)
    const trend = movingAverage(v, 365, true)
    const detr = v.map((x, i) => x - trend[i])
    // yearly part: smooth the detrended series with a 28-day centred average (removes the weekly cycle)
    const yearly = movingAverage(detr.map((x) => (Number.isNaN(x) ? 0 : x)), 28, true)
    const deseason = detr.map((x, i) => x - yearly[i])
    const week = weeklyPattern(v)
    const rem = deseason.map((x, i) => x - week[i % 7])
    return { v, trend, detr, deseason, rem }
  }, [])
  const series = [data.v, data.detr, data.deseason, data.rem][Math.min(phase, 4) - 1]
  const labels = ['the raw daily series, with its 365-day trend', 'minus the trend: what’s left is seasons plus noise', 'minus the yearly season: weekly pattern plus noise', 'minus the weekly pattern: the remainder (noise, and any surprises)']
  const h = 240
  const mg = { l: 50, r: 12, t: 22, b: 24 }
  const valid = series.map((v, i) => ({ i, v })).filter((d) => !Number.isNaN(d.v))
  const vals = valid.map((d) => d.v)
  const x = scaleLinear().domain([0, data.v.length - 1]).range([mg.l, width - mg.r])
  const y = scaleLinear().domain([Math.min(...vals), Math.max(...vals)]).nice().range([h - mg.b, mg.t])
  const path = line<{ i: number; v: number }>().x((d) => x(d.i)).y((d) => y(d.v))(valid) ?? ''
  const trendPath = line<{ i: number; v: number }>().x((d) => x(d.i)).y((d) => y(d.v))(data.trend.map((v, i) => ({ i, v })).filter((d) => !Number.isNaN(d.v))) ?? ''

  return (
    <div ref={ref} className={s.wrap}>
      <div className={s.readout}>
        <span>{labels[Math.min(phase, 4) - 1]}</span>
      </div>
      <svg width={width} height={h} role="img" aria-label={labels[Math.min(phase, 4) - 1]}>
        {y.ticks(4).map((v) => (
          <g key={v}>
            <line x1={mg.l} x2={width - mg.r} y1={y(v)} y2={y(v)} stroke={t.grid} />
            <text x={mg.l - 6} y={y(v) + 4} textAnchor="end" fontSize={10} fill={t.inkSecondary}>
              {v}
            </text>
          </g>
        ))}
        <path d={path} fill="none" stroke={phase === 4 ? t.neutral : t.series1} strokeWidth={1} />
        {phase === 1 && <path d={trendPath} fill="none" stroke={t.series2} strokeWidth={2.5} />}
        {[0, 365].map((d) => (
          <text key={d} x={x(d)} y={h - 6} fontSize={11} fill={t.inkSecondary}>
            year {d / 365 + 1}
          </text>
        ))}
      </svg>
    </div>
  )
}
