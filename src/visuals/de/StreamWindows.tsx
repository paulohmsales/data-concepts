import { scaleLinear } from 'd3'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useVizTheme } from '../../components/vizTheme.ts'
import { mulberry32 } from '../../core/random.ts'
import type { VisualProps } from '../index.ts'
import { useWidth } from '../useWidth.ts'
import s from '../visuals.module.css'

const WINDOW = 10
const N_WIN = 6

/** Events fall into event-time windows as processing time advances; the watermark closes windows. */
export default function StreamWindows({ props }: VisualProps) {
  const t = useVizTheme()
  const { ref, width } = useWidth()
  const [lateness, setLateness] = useState(Number(props.lateness ?? 3))
  const [now, setNow] = useState(0)
  const [playing, setPlaying] = useState(false)
  const raf = useRef(0)
  const events = useMemo(() => {
    const rng = mulberry32(5)
    return Array.from({ length: 70 }, (_, i) => {
      const et = rng() * WINDOW * N_WIN
      const delay = rng() < 0.12 ? 6 + rng() * 10 : rng() * 2.5
      return { i, et, at: et + delay }
    })
  }, [])
  const end = WINDOW * N_WIN + 18
  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    const tick = (ts: number) => {
      setNow((n) => {
        const next = n + ((ts - last) / 1000) * 8
        last = ts
        if (next >= end) {
          setPlaying(false)
          return end
        }
        return next
      })
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [playing, end])

  const arrived = events.filter((e) => e.at <= now)
  const maxSeen = Math.max(0, ...arrived.map((e) => e.et))
  const wm = maxSeen - lateness
  // a window closes the first time the watermark passes its end; events arriving after that are late
  const closeTime = (w: number) => {
    let m = -Infinity
    for (const e of [...events].sort((a, b) => a.at - b.at)) {
      m = Math.max(m, e.et)
      if (m - lateness >= (w + 1) * WINDOW) return e.at
    }
    return Infinity
  }
  const closes = Array.from({ length: N_WIN }, (_, w) => closeTime(w))
  const late = (e: (typeof events)[number]) => e.at > closes[Math.floor(e.et / WINDOW)]
  const h = 260
  const x = scaleLinear().domain([0, WINDOW * N_WIN]).range([20, width - 20])
  const colW = x(WINDOW) - x(0)
  const baseY = h - 40

  return (
    <div ref={ref} className={s.wrap}>
      <div className={s.controls}>
        <button type="button" onClick={() => (now >= end ? (setNow(0), setPlaying(true)) : setPlaying((p) => !p))}>
          {playing ? '❚❚ Pause' : now >= end ? '↻ Replay' : '▶ Play the stream'}
        </button>
        <label>
          Allowed lateness <input type="range" min={0} max={15} step={0.5} value={lateness} onChange={(e) => setLateness(Number(e.target.value))} /> <b>{lateness} s</b>
        </label>
      </div>
      <div className={s.readout}>
        <span>
          Processing time <b>{now.toFixed(0)} s</b>
        </span>
        <span>
          Watermark <b>{wm > 0 ? wm.toFixed(0) : '–'} s</b>
        </span>
        <span style={{ color: '#d03b3b' }}>
          Dropped as late <b>{arrived.filter(late).length}</b>
        </span>
      </div>
      <svg width={width} height={h} role="img" aria-label="Events arriving into event-time windows, closed by the watermark">
        {Array.from({ length: N_WIN }, (_, w) => {
          const closed = now >= closes[w]
          const counted = arrived.filter((e) => Math.floor(e.et / WINDOW) === w && !late(e)).length
          return (
            <g key={w}>
              <rect x={x(w * WINDOW) + 2} y={30} width={colW - 4} height={baseY - 30} rx={6} fill={closed ? t.grid : 'transparent'} fillOpacity={closed ? 0.6 : 1} stroke={t.axis} />
              <text x={x(w * WINDOW) + colW / 2} y={baseY + 16} textAnchor="middle" fontSize={11} fill={t.inkSecondary}>
                {w * WINDOW}–{(w + 1) * WINDOW}s
              </text>
              <text x={x(w * WINDOW) + colW / 2} y={22} textAnchor="middle" fontSize={11} fontWeight={600} fill={closed ? t.ink : t.inkSecondary}>
                {closed ? `🔒 ${counted}` : `${counted}…`}
              </text>
            </g>
          )
        })}
        {arrived.map((e) => {
          const isLate = late(e)
          const w = Math.floor(e.et / WINDOW)
          const stack = arrived.filter((o) => Math.floor(o.et / WINDOW) === w && o.at < e.at && !late(o)).length
          return isLate ? (
            <text key={e.i} x={x(e.et)} y={44} textAnchor="middle" fontSize={13} fill="#d03b3b">
              ✗
            </text>
          ) : (
            <circle key={e.i} cx={x(w * WINDOW) + 10 + (stack % 6) * ((colW - 20) / 5)} cy={baseY - 10 - Math.floor(stack / 6) * 14} r={5} fill={e.at - e.et > 5 ? t.series2 : t.series1} />
          )
        })}
        {wm > 0 && wm < WINDOW * N_WIN && <line x1={x(wm)} x2={x(wm)} y1={30} y2={baseY} stroke={t.series2} strokeWidth={2.5} />}
        {wm > 0 && wm < WINDOW * N_WIN && (
          <text x={x(wm) + 4} y={baseY - 4} fontSize={11} fill={t.series2}>
            watermark
          </text>
        )}
      </svg>
    </div>
  )
}
