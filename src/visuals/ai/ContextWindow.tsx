import { useVizTheme } from '../../components/vizTheme.ts'
import type { VisualProps } from '../index.ts'
import { useWidth } from '../useWidth.ts'
import s from '../visuals.module.css'

const WINDOW = 32_000
const PARTS = { system: 2_000, retrieved: 6_000, reserve: 2_000 }

/** A chat filling a 32k-token context window turn by turn; past the limit, old turns are dropped. */
export default function ContextWindow({ state }: VisualProps) {
  const t = useVizTheme()
  const { ref, width } = useWidth()
  const turns = Number(state?.turns ?? 1)
  const perTurn = 3_500
  const history = turns * perTurn
  const fixed = PARTS.system + PARTS.retrieved + PARTS.reserve
  const room = WINDOW - fixed
  const kept = Math.min(history, room)
  const dropped = history - kept
  const segs = [
    { label: 'system prompt', v: PARTS.system, color: t.neutral },
    { label: `conversation (${Math.round(kept / perTurn)} of ${turns} turns)`, v: kept, color: t.series1 },
    { label: 'retrieved documents', v: PARTS.retrieved, color: t.series3 },
    { label: 'reserved for the answer', v: PARTS.reserve, color: t.series2 },
  ]
  const W = width - 20
  const x = (v: number) => (v / WINDOW) * W
  let acc = 0
  return (
    <div ref={ref} className={s.wrap}>
      <div className={s.readout}>
        <span>
          Used <b>{Math.round((fixed + kept) / 1000)}k</b> of <b>32k</b> tokens
        </span>
        {dropped > 0 && (
          <span style={{ color: '#d03b3b' }}>
            dropped <b>{Math.round(dropped / perTurn)}</b> oldest turn{dropped / perTurn >= 2 ? 's' : ''} ({Math.round(dropped / 1000)}k tokens) ✗
          </span>
        )}
      </div>
      <svg width={width} height={120} role="img" aria-label="Context window usage">
        <rect x={10} y={20} width={W} height={40} rx={6} fill={t.grid} />
        {dropped > 0 && <rect x={10} y={68} width={Math.min(W, x(dropped))} height={14} rx={3} fill="#d03b3b" fillOpacity={0.6} />}
        {dropped > 0 && (
          <text x={12} y={98} fontSize={11} fill="#d03b3b">
            older turns that no longer fit: the model can’t see them any more
          </text>
        )}
        {segs.map((sg) => {
          const x0 = 10 + x(acc)
          acc += sg.v
          return (
            <g key={sg.label}>
              <rect x={x0} y={20} width={Math.max(0, x(sg.v) - 2)} height={40} rx={4} fill={sg.color} style={{ transition: 'all 0.4s' }} />
              {x(sg.v) > 90 && (
                <text x={x0 + 6} y={44} fontSize={11} fill="#fff" fontWeight={600}>
                  {sg.label}
                </text>
              )}
            </g>
          )
        })}
        <text x={10 + W} y={14} textAnchor="end" fontSize={11} fill={t.inkSecondary}>
          context window: 32,000 tokens
        </text>
      </svg>
    </div>
  )
}
