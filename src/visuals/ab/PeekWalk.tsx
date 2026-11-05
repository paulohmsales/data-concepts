import { line, scaleLinear } from 'd3'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useVizTheme } from '../../components/vizTheme.ts'
import { mulberry32, normal, type Rng } from '../../core/random.ts'
import type { VisualProps } from '../index.ts'
import { useWidth } from '../useWidth.ts'
import s from '../visuals.module.css'

/** z after each of K looks for one experiment with no effect: z_k = S_k / √k. */
function walk(K: number, rng: Rng): number[] {
  let sum = 0
  return Array.from({ length: K }, (_, i) => {
    sum += normal(rng)
    return sum / Math.sqrt(i + 1)
  })
}

/** O’Brien–Fleming-shaped boundary c·√(K/k), with c set by simulation so the overall α is 5%. */
function obfConstant(K: number): number {
  const rng = mulberry32(42)
  const paths = Array.from({ length: 20_000 }, () => walk(K, rng))
  // smallest c whose boundary is crossed by 5% of null paths
  const maxRatio = paths.map((p) => Math.max(...p.map((z, i) => Math.abs(z) / Math.sqrt(K / (i + 1)))))
  maxRatio.sort((a, b) => a - b)
  return maxRatio[Math.floor(0.95 * maxRatio.length)]
}

export default function PeekWalk({ props }: VisualProps) {
  const t = useVizTheme()
  const { ref, width } = useWidth()
  const K = Number(props.looks ?? 20)
  const c = useMemo(() => obfConstant(K), [K])
  const [rng] = useState(() => mulberry32(7))
  const [paths, setPaths] = useState<number[][]>(() => [walk(K, rng)])
  const [shown, setShown] = useState(K) // looks revealed in the newest path (animation)
  const [stats, setStats] = useState({ runs: 1, peek: 0, obf: 0, end: 0 })
  const raf = useRef(0)

  const crossPeek = (p: number[]) => p.some((z) => Math.abs(z) > 1.96)
  const crossObf = (p: number[]) => p.some((z, i) => Math.abs(z) > c * Math.sqrt(K / (i + 1)))

  const add = (n: number, animate: boolean) => {
    const fresh = Array.from({ length: n }, () => walk(K, rng))
    setPaths((ps) => [...ps.slice(-40 + n), ...fresh].slice(-40))
    setStats((st) => ({
      runs: st.runs + n,
      peek: st.peek + fresh.filter(crossPeek).length,
      obf: st.obf + fresh.filter(crossObf).length,
      end: st.end + fresh.filter((p) => Math.abs(p[K - 1]) > 1.96).length,
    }))
    if (animate) {
      cancelAnimationFrame(raf.current)
      const start = performance.now()
      const tick = (now: number) => {
        const k = Math.min(K, Math.ceil(((now - start) / 1400) * K))
        setShown(k)
        if (k < K) raf.current = requestAnimationFrame(tick)
      }
      setShown(1)
      raf.current = requestAnimationFrame(tick)
    } else setShown(K)
  }
  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  const h = 280
  const m = { l: 36, r: 16, t: 14, b: 30 }
  const x = scaleLinear().domain([1, K]).range([m.l, width - m.r])
  const y = scaleLinear().domain([-4.5, 4.5]).range([h - m.b, m.t])
  const path = (p: number[], upto = K) => line<number>().x((_, i) => x(i + 1)).y((z) => y(Math.max(-4.5, Math.min(4.5, z))))(p.slice(0, upto)) ?? ''
  const obfLine = (sign: number) => line<number>().x((_, i) => x(i + 1)).y((_, i) => y(Math.max(-4.5, Math.min(4.5, sign * c * Math.sqrt(K / (i + 1))))))(Array.from({ length: K })) ?? ''
  const newest = paths[paths.length - 1]
  const pct = (n: number) => `${((n / stats.runs) * 100).toFixed(0)}%`

  return (
    <div ref={ref} className={s.wrap}>
      <div className={s.controls}>
        <button type="button" onClick={() => add(1, true)}>
          ▶ Run one experiment
        </button>
        <button type="button" onClick={() => add(100, false)}>
          Run 100 more
        </button>
        <button
          type="button"
          onClick={() => {
            setPaths([walk(K, rng)])
            setStats({ runs: 1, peek: 0, obf: 0, end: 0 })
            setShown(K)
          }}
        >
          Reset
        </button>
      </div>
      <div className={s.readout}>
        <span>
          Experiments <b>{stats.runs}</b>
        </span>
        <span style={{ color: '#d03b3b' }}>
          Peeker (±1.96 at any of {K} looks) <b>{pct(stats.peek)}</b>
        </span>
        <span>
          Only the final look <b>{pct(stats.end)}</b>
        </span>
        <span style={{ color: t.series1 }}>
          O’Brien–Fleming boundary <b>{pct(stats.obf)}</b>
        </span>
      </div>
      <svg width={width} height={h} role="img" aria-label="Running z statistic of experiments with no effect, with fixed and sequential boundaries">
        <rect x={m.l} width={width - m.l - m.r} y={y(1.96)} height={y(-1.96) - y(1.96)} fill={t.grid} fillOpacity={0.35} />
        {[1.96, -1.96].map((v) => (
          <line key={v} x1={m.l} x2={width - m.r} y1={y(v)} y2={y(v)} stroke="#d03b3b" strokeDasharray="5 4" />
        ))}
        <path d={obfLine(1)} fill="none" stroke={t.series1} strokeWidth={2} />
        <path d={obfLine(-1)} fill="none" stroke={t.series1} strokeWidth={2} />
        {paths.slice(0, -1).map((p, i) => (
          <path key={i} d={path(p)} fill="none" stroke={crossPeek(p) ? '#d03b3b' : t.neutral} strokeOpacity={0.35} strokeWidth={1} />
        ))}
        <path d={path(newest, shown)} fill="none" stroke={t.ink} strokeWidth={2.5} />
        {newest.slice(0, shown).map((z, i) =>
          Math.abs(z) > 1.96 ? <circle key={i} cx={x(i + 1)} cy={y(Math.max(-4.5, Math.min(4.5, z)))} r={4} fill="#d03b3b" /> : null,
        )}
        <line x1={m.l} x2={width - m.r} y1={y(0)} y2={y(0)} stroke={t.axis} />
        {[-3, -1.96, 0, 1.96, 3].map((v) => (
          <text key={v} x={m.l - 6} y={y(v) + 4} textAnchor="end" fontSize={10} fill={t.inkSecondary}>
            {v}
          </text>
        ))}
        <text x={x(K)} y={h - 8} textAnchor="end" fontSize={11} fill={t.inkSecondary}>
          look number →
        </text>
        <text x={x(1) + 4} y={y(1.96) - 5} fontSize={11} fill="#d03b3b">
          ±1.96 every look
        </text>
        <text x={x(Math.round(K * 0.7))} y={y(c * Math.sqrt(1 / 0.7)) - 8} textAnchor="middle" fontSize={11} fill={t.series1}>
          sequential boundary (strict early, ≈ 2 at the end)
        </text>
      </svg>
    </div>
  )
}
