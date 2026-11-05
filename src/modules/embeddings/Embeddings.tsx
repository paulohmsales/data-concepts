import * as Plot from '@observablehq/plot'
import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import { Choice, ResetButton } from '../../components/Controls.tsx'
import DataTable from '../../components/DataTable.tsx'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import PlotFigure from '../../components/PlotFigure.tsx'
import Slider from '../../components/Slider.tsx'
import { Stat, StatRow } from '../../components/Stat.tsx'
import type { VizTheme } from '../../components/vizTheme.ts'
import { collection, embedPhrases, exactSearch, ivfSearch, kmeans, normalize, pca2, PHRASES, rank, recallAt, type Metric } from '../../core/ai/embed.ts'
import { tokenize } from '../../core/ai/rag.ts'
import { mulberry32, normal } from '../../core/random.ts'
import { int, pct } from '../../format.ts'

interface Controls {
  query: number
  metric: Metric
  k: number
  nprobe: number
}

const DEFAULTS: Controls = { query: 1, metric: 'cosine', k: 3, nprobe: 2 }
const NLIST = 32
const PROBES = [1, 2, 4, 8, 16, 32]

// computed once: the phrase space and a 3,000-vector collection with its IVF index
const VECS = embedPhrases()
const XY = pca2(VECS)
const COLL = collection(3000, 24, 0.5)
const IVF = kmeans(COLL, NLIST)
const QUERIES = (() => {
  const rng = mulberry32(9)
  return Array.from({ length: 40 }, () => normalize(COLL[Math.floor(rng() * COLL.length)].map((x) => x + 0.2 * normal(rng))))
})()
const EXACT = QUERIES.map((q) => exactSearch(q, COLL, 10))
const SWEEP = PROBES.map((p) => {
  let r = 0
  let sc = 0
  QUERIES.forEach((q, i) => {
    const a = ivfSearch(q, COLL, IVF, p, 10)
    r += recallAt(a.ids, EXACT[i])
    sc += a.scanned
  })
  return { nprobe: p, recall: r / QUERIES.length, scanned: sc / QUERIES.length }
})

const keywordOverlap = (a: string, b: string) => {
  const ta = new Set(tokenize(a))
  return tokenize(b).filter((t) => ta.has(t)).length
}

export default function Embeddings() {
  const [c, setC] = useState(DEFAULTS)
  const deferred = useDeferredValue(c)
  const set = <K extends keyof Controls>(k: K) => (v: Controls[K]) => setC((s) => ({ ...s, [k]: v }))
  const ranked = useMemo(() => rank(VECS[deferred.query], VECS, deferred.metric).filter((r) => r.i !== deferred.query), [deferred.query, deferred.metric])
  const top = ranked.slice(0, deferred.k)
  const probe = SWEEP.find((s) => s.nprobe === deferred.nprobe) ?? SWEEP[0]

  const buildMap = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const pts = PHRASES.map((p, i) => ({ i, x: XY[i][0], y: XY[i][1], text: p.text, kind: i === deferred.query ? 'query' : top.some((r) => r.i === i) ? 'retrieved' : 'other' }))
      const q = pts[deferred.query]
      const links = top.map((r) => ({ x1: q.x, y1: q.y, x2: pts[r.i].x, y2: pts[r.i].y }))
      return {
        width,
        height: 420,
        x: { axis: null, inset: 40 },
        y: { axis: null, inset: 20 },
        color: { domain: ['query', 'retrieved', 'other'], range: [t.series2, t.series1, t.neutral], legend: true },
        marks: [
          Plot.link(links, { x1: 'x1', y1: 'y1', x2: 'x2', y2: 'y2', stroke: t.series1, strokeOpacity: 0.5, strokeWidth: 1.5 }),
          Plot.dot(pts, { x: 'x', y: 'y', fill: 'kind', r: (d: { kind: string }) => (d.kind === 'other' ? 5 : 8), stroke: t.surface }),
          Plot.text(pts, { x: 'x', y: 'y', text: 'text', dy: -12, fontSize: 10.5, fill: (d: { kind: string }) => (d.kind === 'other' ? t.inkSecondary : t.ink), lineWidth: 16 }),
        ],
      }
    },
    [deferred.query, top],
  )

  const buildProbe = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => ({
      width,
      height: 220,
      x: { type: 'log', label: 'lists searched (nprobe, of 32) →' },
      y: { domain: [0, 1], tickFormat: '.0%', label: '↑ recall@10 vs exact search', grid: true },
      marks: [
        Plot.axisX(PROBES, { tickFormat: (d: number) => String(d) }),
        Plot.ruleX([deferred.nprobe], { stroke: t.inkSecondary, strokeDasharray: '4 3' }),
        Plot.line(SWEEP, { x: 'nprobe', y: 'recall', stroke: t.series1, strokeWidth: 2 }),
        Plot.dot(SWEEP, { x: 'nprobe', y: 'recall', fill: t.series1, r: 4, tip: { channels: { scanned: 'scanned' }, format: { y: '.0%', scanned: '.0f' } } }),
      ],
    }),
    [deferred.nprobe],
  )

  const panel = (
    <>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.875rem' }}>
        <span>Query</span>
        <select value={c.query} onChange={(e) => set('query')(Number(e.target.value))}>
          {PHRASES.map((p, i) => (
            <option key={p.text} value={i}>
              {p.text}
            </option>
          ))}
        </select>
      </label>
      <Choice label="Similarity" value={c.metric} onChange={set('metric')} options={[{ value: 'cosine', label: 'cosine' }, { value: 'dot', label: 'dot product' }, { value: 'euclidean', label: 'euclidean' }]} />
      <Slider label="Neighbours shown (k)" value={c.k} onChange={set('k')} min={1} max={8} step={1} format={String} />
      <strong>Approximate search</strong>
      <Choice label="IVF lists probed" value={String(c.nprobe)} onChange={(v) => set('nprobe')(Number(v))} options={PROBES.map((p) => ({ value: String(p), label: String(p) }))} />
      <ResetButton onClick={() => setC(DEFAULTS)} />
    </>
  )

  return (
    <ModuleLayout
      controls={panel}
      onPreset={(p) => setC({ ...DEFAULTS, ...(p as Partial<Controls>) })}
      play={
        <>
          <h3>A map of meaning</h3>
          <p className="lede">
            21 phrases embedded as 16-dimensional vectors, flattened to 2-D for the picture. Nearby means similar in meaning. Lines go
            from the query (orange) to its {deferred.k} nearest neighbours by {deferred.metric}.
          </p>
          <PlotFigure build={buildMap} label="Two-dimensional map of phrase embeddings with the query and its nearest neighbours" />
          <DataTable
            rows={top}
            rowKey={(r) => r.i}
            columns={[
              { key: 'r', label: '#', render: (r) => top.indexOf(r) + 1 },
              { key: 't', label: 'Neighbour', render: (r) => PHRASES[r.i].text },
              { key: 's', label: deferred.metric, align: 'right', render: (r) => r.score.toFixed(3) },
              { key: 'k', label: 'shared keywords', align: 'right', render: (r) => keywordOverlap(PHRASES[deferred.query].text, PHRASES[r.i].text) },
            ]}
          />
        </>
      }
      breakIt={
        <>
          <h3>Exact search doesn’t scale; approximate search trades recall</h3>
          <p className="lede">
            A collection of {int(COLL.length)} vectors, indexed with IVF: k-means splits them into {NLIST} lists, and a query only scans
            the lists whose centroids are closest.
          </p>
          <StatRow>
            <Stat label="Vectors scanned per query" value={int(probe.scanned)} note={`exact search: ${int(COLL.length)}`} />
            <Stat label="Recall@10" value={pct(probe.recall, 0)} note="share of the true top 10 found" />
          </StatRow>
          <PlotFigure build={buildProbe} label="Recall of approximate search against lists probed" />
        </>
      }
    />
  )
}
