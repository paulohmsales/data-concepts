import { useVizTheme } from '../../components/vizTheme.ts'
import type { VisualProps } from '../index.ts'
import { useWidth } from '../useWidth.ts'
import s from '../visuals.module.css'

const ORDERS = [
  { id: 101, amount: 120 },
  { id: 102, amount: 50 },
  { id: 103, amount: 50 },
  { id: 104, amount: 200 },
]
const ITEMS = [
  { order: 101, sku: 'mug' },
  { order: 101, sku: 'tee' },
  { order: 102, sku: 'cap' },
  { order: 103, sku: 'pen' },
  { order: 104, sku: 'mug' },
  { order: 104, sku: 'sock' },
  { order: 104, sku: 'tee' },
]

/** orders ⋈ order_items: every order row is copied once per matching item, amount included. */
export default function FanoutJoin({ state }: VisualProps) {
  const t = useVizTheme()
  const { ref, width } = useWidth()
  const phase = Number(state?.phase ?? 1)
  const rowH = 24
  const colW = Math.min(170, (width - 60) / 3)
  const xO = 10
  const xI = xO + colW + 20
  const xR = xI + colW + 40
  const joined = ITEMS.map((it, i) => ({ ...it, i, amount: ORDERS.find((o) => o.id === it.order)!.amount }))
  const shownRows = phase >= 2 ? joined : []
  const sum = shownRows.reduce((a, r) => a + r.amount, 0)
  const truth = ORDERS.reduce((a, o) => a + o.amount, 0)
  const h = 40 + rowH * 8 + 40
  const color = (id: number) => [t.series1, t.series2, t.series3, '#8c6bd6'][ORDERS.findIndex((o) => o.id === id)]

  return (
    <div ref={ref} className={s.wrap}>
      <div className={s.readout}>
        <span>
          SUM(amount) over orders <b>{truth}</b>
        </span>
        {phase >= 2 && (
          <span>
            SUM(amount) after the join <b style={{ color: sum === truth ? undefined : '#d03b3b' }}>{sum}</b> ({shownRows.length} rows from 4 orders)
          </span>
        )}
        {phase >= 3 && (
          <span>
            Pre-aggregated: <b style={{ color: t.series3 }}>{truth} ✓</b>
          </span>
        )}
      </div>
      <svg width={width} height={h} role="img" aria-label="Join of orders to order items with repeated amounts">
        {[
          ['orders (one row per order)', xO],
          ['order_items (one row per line)', xI],
          [phase >= 3 ? 'items per order, then joined' : 'orders ⋈ order_items', xR],
        ].map(([label, x]) => (
          <text key={String(label)} x={Number(x)} y={16} fontSize={11} fontWeight={700} fill={t.ink}>
            {label}
          </text>
        ))}
        {ORDERS.map((o, i) => (
          <g key={o.id} transform={`translate(${xO}, ${30 + i * rowH})`}>
            <rect width={colW} height={rowH - 4} rx={4} fill={color(o.id)} fillOpacity={0.18} stroke={color(o.id)} />
            <text x={8} y={15} fontSize={12} fill={t.ink}>
              {o.id} · ${o.amount}
            </text>
          </g>
        ))}
        {ITEMS.map((it, i) => (
          <g key={i} transform={`translate(${xI}, ${30 + i * rowH})`}>
            <rect width={colW} height={rowH - 4} rx={4} fill={t.surface} stroke={color(it.order)} />
            <text x={8} y={15} fontSize={12} fill={t.ink}>
              {it.order} · {it.sku}
            </text>
          </g>
        ))}
        {phase >= 2 &&
          phase < 3 &&
          shownRows.map((r) => {
            const oi = ORDERS.findIndex((o) => o.id === r.order)
            return <path key={r.i} d={`M${xO + colW},${40 + oi * rowH} C${xO + colW + 30},${40 + oi * rowH} ${xR - 30},${40 + r.i * rowH} ${xR},${40 + r.i * rowH}`} fill="none" stroke={color(r.order)} strokeOpacity={0.6} strokeWidth={1.5} />
          })}
        {phase === 2 &&
          shownRows.map((r) => {
            const repeat = joined.filter((x) => x.order === r.order).length > 1
            return (
              <g key={r.i} transform={`translate(${xR}, ${30 + r.i * rowH})`}>
                <rect width={colW} height={rowH - 4} rx={4} fill={color(r.order)} fillOpacity={0.18} stroke={repeat ? '#d03b3b' : color(r.order)} />
                <text x={8} y={15} fontSize={12} fill={t.ink}>
                  {r.order} · {r.sku} · <tspan fontWeight={700} fill={repeat ? '#d03b3b' : t.ink}>${r.amount}</tspan>
                </text>
              </g>
            )
          })}
        {phase >= 3 &&
          ORDERS.map((o, i) => (
            <g key={o.id} transform={`translate(${xR}, ${30 + i * rowH})`}>
              <rect width={colW} height={rowH - 4} rx={4} fill={color(o.id)} fillOpacity={0.18} stroke={t.series3} />
              <text x={8} y={15} fontSize={12} fill={t.ink}>
                {o.id} · ${o.amount} · {ITEMS.filter((x) => x.order === o.id).length} lines
              </text>
            </g>
          ))}
      </svg>
    </div>
  )
}
