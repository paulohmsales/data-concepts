import { useEffect, useRef, useState } from 'react'
import { useVizTheme } from '../../components/vizTheme.ts'
import { mulberry32 } from '../../core/random.ts'
import type { VisualProps } from '../index.ts'
import { useWidth } from '../useWidth.ts'
import s from '../visuals.module.css'

/** Requests (dots) arrive at random, wait in line, and get served one at a time, in slow motion. */
export default function QueueAnim({ props }: VisualProps) {
  const t = useVizTheme()
  const { ref, width } = useWidth()
  const [util, setUtil] = useState(Number(props.utilization ?? 0.7))
  const [rng] = useState(() => mulberry32(4))
  const [queue, setQueue] = useState<number[]>([])
  const [served, setServed] = useState(0)
  const [busy, setBusy] = useState(false)
  const state = useRef({ nextArrival: 0, serviceEnd: 0, now: 0, id: 0, queue: [] as number[], busy: false, last: 0 })
  useEffect(() => {
    const anim = { raf: 0 }
    state.current.last = performance.now()
    const mu = 1.2 // services per second of animation time
    const tick = (ts: number) => {
      const st = state.current
      st.now += Math.min(0.1, (ts - st.last) / 1000)
      st.last = ts
      const lambda = util * mu
      while (st.nextArrival <= st.now) {
        st.queue.push(st.id++)
        st.nextArrival += -Math.log(1 - rng()) / lambda
      }
      if (st.busy && st.serviceEnd <= st.now) {
        st.busy = false
        setServed((x) => x + 1)
      }
      if (!st.busy && st.queue.length) {
        st.queue.shift()
        st.busy = true
        st.serviceEnd = st.now - Math.log(1 - rng()) / mu
      }
      setQueue([...st.queue])
      setBusy(st.busy)
      anim.raf = requestAnimationFrame(tick)
    }
    anim.raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(anim.raf)
  }, [util, rng])
  const h = 120
  const serverX = width - 90
  const dot = 14

  return (
    <div ref={ref} className={s.wrap}>
      <div className={s.controls}>
        <label>
          Utilisation <input type="range" min={0.3} max={0.98} step={0.01} value={util} onChange={(e) => setUtil(Number(e.target.value))} /> <b>{Math.round(util * 100)}%</b>
        </label>
      </div>
      <div className={s.readout}>
        <span>
          waiting <b>{queue.length}</b>
        </span>
        <span>
          served <b>{served}</b>
        </span>
      </div>
      <svg width={width} height={h} role="img" aria-label={`Queue with ${queue.length} requests waiting`}>
        <rect x={serverX} y={30} width={70} height={56} rx={10} fill={busy ? t.series1 : t.grid} style={{ transition: 'fill 0.2s' }} />
        <text x={serverX + 35} y={63} textAnchor="middle" fontSize={12} fill={busy ? '#fff' : t.inkSecondary} fontWeight={600}>
          server
        </text>
        {queue.slice(0, Math.floor((serverX - 30) / (dot + 4))).map((id, i) => (
          <circle key={id} cx={serverX - 18 - i * (dot + 4)} cy={58} r={dot / 2} fill={t.series2} style={{ transition: 'cx 0.25s' }} />
        ))}
        {queue.length > Math.floor((serverX - 30) / (dot + 4)) && (
          <text x={10} y={20} fontSize={11} fill="#d03b3b">
            + {queue.length - Math.floor((serverX - 30) / (dot + 4))} more waiting…
          </text>
        )}
      </svg>
    </div>
  )
}
