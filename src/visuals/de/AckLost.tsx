import { useVizTheme } from '../../components/vizTheme.ts'
import type { VisualProps } from '../index.ts'
import { useWidth } from '../useWidth.ts'
import s from '../visuals.module.css'

interface Msg {
  from: 'p' | 's'
  t0: number
  t1: number
  label: string
  lost?: boolean
  phase: number
}

const MSGS: Msg[] = [
  { from: 'p', t0: 1, t1: 2, label: 'charge Ana $50 (evt_9f2c)', phase: 1 },
  { from: 's', t0: 2.6, t1: 3.6, label: 'OK', phase: 1 },
  { from: 'p', t0: 5, t1: 6, label: 'charge Bruno $30 (evt_a71d)', phase: 2 },
  { from: 's', t0: 6.6, t1: 7.6, label: 'OK', lost: true, phase: 2 },
  { from: 'p', t0: 9.6, t1: 10.6, label: 'retry: charge Bruno $30 (evt_a71d)', phase: 3 },
  { from: 's', t0: 11.2, t1: 12.2, label: 'OK', phase: 3 },
]

/** Sequence diagram: producer and sink over time; the lost ack forces a retry. */
export default function AckLost({ state }: VisualProps) {
  const t = useVizTheme()
  const { ref, width } = useWidth()
  const phase = Number(state?.phase ?? 1)
  const sink = String(state?.sink ?? 'append')
  const h = 460
  const xp = Math.min(160, width * 0.2)
  const xs = width - Math.min(200, width * 0.25)
  const y = (tt: number) => 40 + tt * 26
  const shown = MSGS.filter((m) => m.phase <= phase)
  const charges = [
    ...(phase >= 1 ? ['Ana $50'] : []),
    ...(phase >= 2 ? ['Bruno $30'] : []),
    ...(phase >= 3 && sink === 'append' ? ['Bruno $30 (again) ✗'] : []),
  ]

  return (
    <div ref={ref} className={s.wrap}>
      <svg width={width} height={h} role="img" aria-label="Sequence diagram of a lost acknowledgement and a retry">
        {[
          ['producer', xp],
          [`sink (${sink === 'append' ? 'INSERT' : 'upsert by event id'})`, xs],
        ].map(([label, x]) => (
          <g key={String(label)}>
            <text x={Number(x)} y={20} textAnchor="middle" fontWeight={700} fontSize={12} fill={t.ink}>
              {label}
            </text>
            <line x1={Number(x)} x2={Number(x)} y1={28} y2={h - 80} stroke={t.axis} strokeWidth={2} />
          </g>
        ))}
        {shown.map((m) => {
          const [x0, x1] = m.from === 'p' ? [xp, xs] : [xs, xp]
          const end = m.lost ? x0 + (x1 - x0) * 0.55 : x1
          const yEnd = m.lost ? y(m.t0) + (y(m.t1) - y(m.t0)) * 0.55 : y(m.t1)
          return (
            <g key={m.label + m.t0}>
              <line x1={x0} y1={y(m.t0)} x2={end} y2={yEnd} stroke={m.lost ? '#d03b3b' : m.from === 'p' ? t.series1 : t.series3} strokeWidth={2} markerEnd={m.lost ? undefined : 'url(#arrow)'} strokeDasharray={m.lost ? '5 4' : undefined} />
              {m.lost && (
                <text x={end + 6} y={yEnd + 4} fontSize={16} fill="#d03b3b">
                  ✗
                </text>
              )}
              <text x={(x0 + x1) / 2} y={(y(m.t0) + y(m.t1)) / 2 - 6} textAnchor="middle" fontSize={11} fill={m.lost ? '#d03b3b' : t.inkSecondary}>
                {m.label}
                {m.lost ? ' (lost on the way back)' : ''}
              </text>
            </g>
          )
        })}
        {phase >= 2 && (
          <g>
            <rect x={xp - 70} y={y(7.6)} width={140} height={y(9.4) - y(7.6)} fill="#fab219" fillOpacity={0.15} rx={4} />
            <text x={xp} y={y(8.6)} textAnchor="middle" fontSize={11} fill={t.ink}>
              waiting… timeout
            </text>
          </g>
        )}
        {phase >= 3 && (
          <text x={xs - 8} y={y(10.9)} textAnchor="end" fontSize={11} fontWeight={700} fill={sink === 'append' ? '#d03b3b' : t.series3}>
            {sink === 'append' ? 'writes a second charge ✗' : 'evt_a71d exists → no-op ✓'}
          </text>
        )}
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={t.inkSecondary} />
          </marker>
        </defs>
        <g transform={`translate(10, ${h - 50})`}>
          <text fontSize={12} fontWeight={700} fill={t.ink}>
            charges in the sink:
          </text>
          {charges.map((c, i) => (
            <text key={c} x={140 + i * 150} fontSize={12} fill={c.includes('✗') ? '#d03b3b' : t.ink}>
              {c}
            </text>
          ))}
        </g>
      </svg>
    </div>
  )
}
