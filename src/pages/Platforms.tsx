import * as Plot from '@observablehq/plot'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router'
import { Choice } from '../components/Controls.tsx'
import PlotFigure from '../components/PlotFigure.tsx'
import Slider from '../components/Slider.tsx'
import type { VizTheme } from '../components/vizTheme.ts'
import { usePlatforms } from '../lib/api.ts'
import type { Category, Platforms as P, Service } from '../lib/content.ts'
import { estimate, serviceFor, type Workload } from './platforms/model.ts'
import styles from './Platforms.module.css'

const LAYERS: { key: Category['layer']; label: string }[] = [
  { key: 'store', label: 'Store' },
  { key: 'process', label: 'Process' },
  { key: 'serve', label: 'Serve' },
  { key: 'govern', label: 'Govern' },
  { key: 'ai', label: 'AI' },
  { key: 'ops', label: 'Run' },
]
const usd = (x: number) => (x >= 1000 ? `$${(x / 1000).toFixed(1)}k` : `$${x.toFixed(0)}`)

export default function Platforms() {
  const p = usePlatforms()
  const { hash } = useLocation()
  const [selected, setSelected] = useState<Service | null>(null)

  useEffect(() => {
    if (hash) document.getElementById(`cat-${hash.slice(1)}`)?.scrollIntoView({ block: 'center' })
  }, [hash])

  return (
    <div className={styles.page}>
      <h1>Cloud data platforms, compared</h1>
      <p className="lede" style={{ maxWidth: '75ch' }}>
        AWS, Google Cloud and Azure sell infrastructure and dozens of single-purpose services; Snowflake and
        Databricks are platforms that run <em>on</em> those clouds. The same pipeline can be built on each,
        but what you size, what you pay for and what you operate differ a lot.
      </p>

      <div className={styles.providers}>
        {p.providers.map((pr) => (
          <div key={pr.key} className={styles.provider} style={{ borderTopColor: pr.color }}>
            <div className={styles.providerHead}>
              <strong>{pr.name}</strong>
              <span className={styles.kind}>{pr.kind === 'cloud' ? 'cloud' : 'platform on any cloud'}</span>
            </div>
            <p>{pr.summary}</p>
          </div>
        ))}
      </div>

      <PipelineMap p={p} onSelect={setSelected} />
      <CapabilityMap p={p} onSelect={setSelected} />
      <HeadToHead p={p} />
      <CostExplorer p={p} />
      {selected && <ServiceDrawer s={selected} p={p} onClose={() => setSelected(null)} />}
    </div>
  )
}

/* ---------------------------------------------------------------- the same pipeline, five ways */

function PipelineMap({ p, onSelect }: { p: P; onSelect: (s: Service) => void }) {
  const [arch, setArch] = useState(p.architectures[0].key)
  const [focus, setFocus] = useState<string | null>(null)
  const a = p.architectures.find((x) => x.key === arch)!
  return (
    <section className={styles.section}>
      <h2>The same pipeline, five ways</h2>
      <p className="lede">Pick a reference architecture. Each row is how that provider would build it; click a service for details, or a provider to highlight its row.</p>
      <div className={styles.tabs}>
        {p.architectures.map((x) => (
          <button key={x.key} type="button" className={x.key === arch ? styles.tabOn : undefined} onClick={() => setArch(x.key)}>
            {x.name}
          </button>
        ))}
      </div>
      <p>{a.description}</p>
      <div className={styles.flow} style={{ gridTemplateColumns: `104px repeat(${a.stages.length}, minmax(104px, 1fr))` }}>
        <div />
        {a.stages.map((st, i) => (
          <div key={st.label} className={styles.stageHead}>
            <span className={styles.stageNum}>{i + 1}</span>
            {st.label}
            {i < a.stages.length - 1 && <span className={styles.arrow} aria-hidden="true">→</span>}
          </div>
        ))}
        {p.providers.map((pr) => (
          <FlowRow key={pr.key} p={p} provider={pr.key} name={pr.name} color={pr.color} stages={a.stages} dim={focus !== null && focus !== pr.key} onFocus={() => setFocus(focus === pr.key ? null : pr.key)} onSelect={onSelect} />
        ))}
      </div>
    </section>
  )
}

function FlowRow({ p, provider, name, color, stages, dim, onFocus, onSelect }: { p: P; provider: string; name: string; color: string; stages: { label: string; category: string }[]; dim: boolean; onFocus: () => void; onSelect: (s: Service) => void }) {
  return (
    <>
      <button type="button" className={styles.rowHead} style={{ borderLeftColor: color, opacity: dim ? 0.35 : 1 }} onClick={onFocus}>
        {name}
      </button>
      {stages.map((st) => {
        const s = serviceFor(p, provider, st.category)
        return (
          <button key={st.label} type="button" className={styles.cell} style={{ borderColor: color, opacity: dim ? 0.25 : 1 }} onClick={() => s && onSelect(s)} disabled={!s}>
            {s?.name ?? '—'}
            {s?.serverless && <span className={styles.badge}>serverless</span>}
          </button>
        )
      })}
    </>
  )
}

/* ---------------------------------------------------------------- the capability map */

function CapabilityMap({ p, onSelect }: { p: P; onSelect: (s: Service) => void }) {
  const [layer, setLayer] = useState<Category['layer'] | 'all'>('all')
  const [q, setQ] = useState('')
  const term = q.trim().toLowerCase()
  const cats = p.categories.filter((c) => layer === 'all' || c.layer === layer)
  const hit = (s?: Service) => !!s && !!term && `${s.name} ${s.summary} ${s.open_source_base ?? ''}`.toLowerCase().includes(term)
  return (
    <section className={styles.section}>
      <h2>The capability map</h2>
      <p className="lede">Every layer of a data platform and each provider’s answer. Filter by layer or search for a tool (try “Iceberg”, “Kafka”, “Spark”).</p>
      <div className={styles.mapControls}>
        <div className={styles.tabs}>
          <button type="button" className={layer === 'all' ? styles.tabOn : undefined} onClick={() => setLayer('all')}>
            All layers
          </button>
          {LAYERS.map((l) => (
            <button key={l.key} type="button" className={layer === l.key ? styles.tabOn : undefined} onClick={() => setLayer(l.key)}>
              {l.label}
            </button>
          ))}
        </div>
        <input type="search" placeholder="Highlight a tool…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Highlight services" />
      </div>
      <div className={styles.matrix} style={{ gridTemplateColumns: `minmax(150px, 1.15fr) repeat(${p.providers.length}, minmax(118px, 1fr))` }}>
        <div className={styles.corner}>Capability</div>
        {p.providers.map((pr) => (
          <div key={pr.key} className={styles.colHead} style={{ borderBottomColor: pr.color }}>
            {pr.name}
          </div>
        ))}
        {cats.map((c) => (
          <Row key={c.key} c={c} p={p} hit={hit} onSelect={onSelect} />
        ))}
      </div>
    </section>
  )
}

function Row({ c, p, hit, onSelect }: { c: Category; p: P; hit: (s?: Service) => boolean; onSelect: (s: Service) => void }) {
  return (
    <>
      <div id={`cat-${c.key}`} className={`${styles.catHead} ${styles[`layer_${c.layer}`]}`} title={c.description}>
        <strong>{c.name}</strong>
        <small>{c.description}</small>
      </div>
      {p.providers.map((pr) => {
        const s = serviceFor(p, pr.key, c.key)
        return (
          <button key={pr.key} type="button" className={`${styles.mCell} ${hit(s) ? styles.hit : ''}`} onClick={() => s && onSelect(s)} disabled={!s}>
            <span>{s?.name ?? '—'}</span>
            <span className={styles.tags}>
              {s?.serverless && <span className={styles.badge}>serverless</span>}
              {s?.open_source_base && <span className={styles.badgeOss}>open source: {s.open_source_base}</span>}
            </span>
          </button>
        )
      })}
    </>
  )
}

function ServiceDrawer({ s, p, onClose }: { s: Service; p: P; onClose: () => void }) {
  const pr = p.providers.find((x) => x.key === s.provider)!
  const cat = p.categories.find((x) => x.key === s.category)!
  const peers = p.services.filter((x) => x.category === s.category && x.provider !== s.provider)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className={styles.drawerBackdrop} onClick={onClose}>
      <aside className={styles.drawer} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={s.name} style={{ borderTopColor: pr.color }}>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
          ×
        </button>
        <small>
          {pr.name} · {cat.name}
        </small>
        <h3>{s.name}</h3>
        <p>{s.summary}</p>
        {s.pricing && (
          <p>
            <b>Pricing:</b> {s.pricing}
          </p>
        )}
        {s.open_source_base && (
          <p>
            <b>Built on:</b> {s.open_source_base}
          </p>
        )}
        {s.url && (
          <p>
            <a href={s.url} target="_blank" rel="noreferrer">
              Documentation ↗
            </a>
          </p>
        )}
        <h4>The equivalent elsewhere</h4>
        <ul className={styles.peers}>
          {peers.map((x) => (
            <li key={x.provider}>
              <b>{p.providers.find((y) => y.key === x.provider)?.name}:</b> {x.name}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  )
}

/* ---------------------------------------------------------------- head to head */

function HeadToHead({ p }: { p: P }) {
  const [a, setA] = useState('snowflake')
  const [b, setB] = useState('databricks')
  const opts = p.providers.map((x) => ({ value: x.key, label: x.name }))
  const pa = p.providers.find((x) => x.key === a)!
  const pb = p.providers.find((x) => x.key === b)!
  return (
    <section className={styles.section}>
      <h2>Head to head</h2>
      <p className="lede">How the analytics engines differ on the dimensions that drive real decisions. Pick any two.</p>
      <div className={styles.versus}>
        <Choice label="Left" value={a} onChange={setA} options={opts} />
        <span className={styles.vs}>vs</span>
        <Choice label="Right" value={b} onChange={setB} options={opts} />
      </div>
      <div className={styles.h2h}>
        <div className={styles.h2hHead} style={{ borderBottomColor: pa.color }}>
          {pa.name}
        </div>
        <div />
        <div className={styles.h2hHead} style={{ borderBottomColor: pb.color }}>
          {pb.name}
        </div>
        {p.dimensions.map((d) => (
          <div key={d.key} className={styles.h2hRow}>
            <div className={styles.h2hCell}>{d.values[a]}</div>
            <div className={styles.h2hDim}>
              <strong>{d.name}</strong>
              <small>{d.why}</small>
            </div>
            <div className={styles.h2hCell}>{d.values[b]}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------- cost explorer */

function CostExplorer({ p }: { p: P }) {
  const [w, setW] = useState<Workload>({ scannedTb: 10, computeHours: 120, storageTb: 5, size: 1 })
  const set = <K extends keyof Workload>(k: K) => (v: Workload[K]) => setW((x) => ({ ...x, [k]: v }))
  const est = useMemo(() => estimate(p, w), [p, w])
  const colorOf = (provider: string) => p.providers.find((x) => x.key === provider)!.color

  const buildBars = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const data = est.flatMap((e) => [
        { engine: e.engine, part: 'compute', v: e.compute, provider: e.provider },
        { engine: e.engine, part: 'storage', v: e.storage, provider: e.provider },
      ])
      return {
        width,
        height: 280,
        marginLeft: 180,
        x: { label: 'estimated monthly list price (USD) →', grid: true, tickFormat: (d: number) => usd(d) },
        y: { label: null, domain: est.map((e) => e.engine) },
        color: { domain: ['compute', 'storage'], range: [t.series1, t.neutral], legend: true },
        marks: [
          Plot.barX(data, { y: 'engine', x: 'v', fill: 'part', tip: { format: { x: (d: number) => usd(d) } } }),
          Plot.text(est, { y: 'engine', x: (e: { compute: number; storage: number }) => e.compute + e.storage, text: (e: { compute: number; storage: number }) => usd(e.compute + e.storage), dx: 24, fill: t.ink }),
          Plot.ruleX([0], { stroke: t.axis }),
        ],
      }
    },
    [est],
  )

  const buildSweep = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const pts = [0.5, 1, 2, 5, 10, 20, 50, 100, 200].flatMap((tb) =>
        estimate(p, { ...w, scannedTb: tb }).map((e) => ({ tb, engine: e.engine, total: e.compute + e.storage, provider: e.provider })),
      )
      const engines = est.map((e) => e.engine)
      const colors = est.map((e) => p.providers.find((x) => x.key === e.provider)!.color)
      return {
        width,
        height: 260,
        x: { type: 'log', label: 'TB scanned per month (log) →' },
        y: { type: 'log', label: '↑ monthly cost (log)', grid: true, tickFormat: (d: number) => usd(d) },
        color: { domain: engines, range: colors, legend: true },
        marks: [
          Plot.ruleX([w.scannedTb], { stroke: t.inkSecondary, strokeDasharray: '4 3' }),
          Plot.line(pts, { x: 'tb', y: 'total', stroke: 'engine', strokeWidth: 2 }),
          Plot.dot(pts, { x: 'tb', y: 'total', fill: 'engine', r: 2.5, tip: { format: { y: (d: number) => usd(d), x: true } } }),
        ],
      }
    },
    [p, w, est],
  )

  return (
    <section className={styles.section}>
      <h2>What would it cost?</h2>
      <p className="lede">
        A deliberately simple model of list prices: one engine per provider, no discounts, no data transfer.
        Its point is the <em>shape</em>: per-byte engines get cheaper when you scan less, per-time engines when
        they run less, capacity engines cost the same whether used or not.
      </p>
      <div className={styles.costGrid}>
        <div className={styles.costControls}>
          <Slider label="Data scanned per month" value={w.scannedTb} onChange={set('scannedTb')} min={0.5} max={200} step={0.5} log format={(v) => `${v} TB`} />
          <Slider label="Hours a warehouse runs per month" value={w.computeHours} onChange={set('computeHours')} min={5} max={730} step={5} log format={(v) => `${v} h`} hint="730 h = always on" />
          <Slider label="Data stored" value={w.storageTb} onChange={set('storageTb')} min={0.1} max={100} step={0.1} log format={(v) => `${v} TB`} />
          <Choice
            label="Compute size"
            value={String(w.size)}
            onChange={(v) => set('size')(Number(v))}
            options={[
              { value: '1', label: 'smallest' },
              { value: '2', label: '2×' },
              { value: '4', label: '4×' },
              { value: '8', label: '8×' },
            ]}
          />
        </div>
        <div>
          <PlotFigure build={buildBars} label="Estimated monthly cost per engine" />
        </div>
      </div>
      <h4>Where the lines cross</h4>
      <p className="lede">The same workload as scanned data grows (warehouse hours fixed at {w.computeHours} h). Scan-priced engines climb; time-priced ones don’t care how much each query reads.</p>
      <PlotFigure build={buildSweep} label="Monthly cost against TB scanned for each engine" />
      <table className={styles.notes}>
        <tbody>
          {est.map((e) => (
            <tr key={e.engine}>
              <td>
                <span className={styles.dot} style={{ background: colorOf(e.provider) }} /> {e.engine}
              </td>
              <td>{e.model}</td>
              <td>{e.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <details className={styles.sources}>
        <summary>Prices used and their sources</summary>
        <ul>
          {p.prices.map((x) => (
            <li key={x.provider + x.item}>
              {p.providers.find((y) => y.key === x.provider)?.name} · {x.item}: <b>{x.usd}</b> USD per {x.unit}
              {x.note && ` (${x.note})`} ·{' '}
              <a href={x.source} target="_blank" rel="noreferrer">
                source
              </a>
            </li>
          ))}
        </ul>
        <p className="lede">List prices as of {p.prices[0]?.as_of}; they vary by region, edition and contract. Check the source before budgeting.</p>
      </details>
    </section>
  )
}
