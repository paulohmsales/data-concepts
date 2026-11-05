import { scaleLinear } from 'd3'
import { useEffect, useRef, useState } from 'react'
import { useVizTheme } from '../../components/vizTheme.ts'
import type { VisualProps } from '../index.ts'
import { useWidth } from '../useWidth.ts'
import s from '../visuals.module.css'

/** f(w) = w²/2 (curvature 1): each step multiplies the distance to the minimum by (1 − lr). */
export default function LrBall({ props }: VisualProps) {
  const t = useVizTheme()
  const { ref, width } = useWidth()
  const [lr, setLr] = useState(Number(props.lr ?? 0.3))
  const [path, setPath] = useState<number[]>([3])
  const [playing, setPlaying] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (!playing) return
    timer.current = window.setInterval(() => {
      setPath((p) => {
        const w = p[p.length - 1]
        const next = w - lr * w
        if (p.length > 25 || Math.abs(next) > 40 || Math.abs(next) < 1e-3) setPlaying(false)
        return [...p, next]
      })
    }, 380)
    return () => window.clearInterval(timer.current)
  }, [playing, lr])
  const h = 240
  const x = scaleLinear().domain([-4.5, 4.5]).range([20, width - 20])
  const y = scaleLinear().domain([0, 10.5]).range([h - 24, 10])
  const curve = Array.from({ length: 121 }, (_, i) => {
    const w = -4.5 + (9 * i) / 120
    return `${i ? 'L' : 'M'}${x(w)},${y((w * w) / 2)}`
  }).join('')
  const clamp = (w: number) => Math.max(-4.4, Math.min(4.4, w))
  const factor = 1 - lr
  const verdict = lr <= 0 ? '' : lr < 1 ? 'converges smoothly' : lr === 1 ? 'lands exactly on the minimum in one step' : lr < 2 ? 'overshoots and oscillates, but converges' : lr === 2 ? 'bounces forever' : 'diverges'

  return (
    <div ref={ref} className={s.wrap}>
      <div className={s.controls}>
        <label>
          Learning rate <input type="range" min={0.05} max={2.3} step={0.05} value={lr} onChange={(e) => { setLr(Number(e.target.value)); setPath([3]); setPlaying(false) }} /> <b>{lr.toFixed(2)}</b>
        </label>
        <button type="button" onClick={() => { setPath([3]); setPlaying(true) }}>
          ▶ Roll
        </button>
      </div>
      <div className={s.readout}>
        <span>
          each step multiplies the distance by <b>1 − lr = {factor.toFixed(2)}</b>
        </span>
        <span style={{ color: Math.abs(factor) >= 1 ? '#d03b3b' : t.series3 }}>
          → <b>{verdict}</b>
        </span>
      </div>
      <svg width={width} height={h} role="img" aria-label={`Gradient descent on a parabola with learning rate ${lr}`}>
        <path d={curve} fill="none" stroke={t.axis} strokeWidth={2} />
        {path.slice(1).map((w, i) => (
          <line key={i} x1={x(clamp(path[i]))} y1={y(Math.min(10.5, (path[i] * path[i]) / 2))} x2={x(clamp(w))} y2={y(Math.min(10.5, (w * w) / 2))} stroke={t.series2} strokeOpacity={0.6} strokeWidth={1.5} />
        ))}
        {path.map((w, i) => (
          <circle key={i} cx={x(clamp(w))} cy={y(Math.min(10.5, (w * w) / 2))} r={i === path.length - 1 ? 8 : 3} fill={i === path.length - 1 ? t.series2 : t.series2} fillOpacity={i === path.length - 1 ? 1 : 0.5} />
        ))}
        <text x={x(0)} y={h - 6} textAnchor="middle" fontSize={11} fill={t.inkSecondary}>
          minimum
        </text>
      </svg>
    </div>
  )
}
