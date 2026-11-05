import * as Plot from '@observablehq/plot'
import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import { ResetButton } from '../../components/Controls.tsx'
import DataTable from '../../components/DataTable.tsx'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import PlotFigure from '../../components/PlotFigure.tsx'
import Slider from '../../components/Slider.tsx'
import { Stat, StatRow } from '../../components/Stat.tsx'
import Status from '../../components/Status.tsx'
import type { VizTheme } from '../../components/vizTheme.ts'
import { useVizTheme } from '../../components/vizTheme.ts'
import { DOCS, QUESTIONS } from '../../core/ai/corpus.ts'
import { answerFound, buildIndex, chunk, evaluate, search, type Chunk } from '../../core/ai/rag.ts'
import { pct } from '../../format.ts'
import styles from '../common.module.css'
import r from './Rag.module.css'

interface Controls {
  size: number
  overlap: number
  k: number
  question: number
}

const DEFAULTS: Controls = { size: 40, overlap: 10, k: 3, question: 0 }
const SIZES = [8, 15, 25, 40, 60, 100, 150]
const STATUS_LABEL = { whole: 'answer retrieved', partial: 'answer cut in half', missing: 'answer not retrieved' } as const

type SweepPoint = { size: number; k: string; recall: number; words: number }

function sweepChart(metric: 'recall' | 'words', sweep: SweepPoint[], size: number, width: number, th: VizTheme): Plot.PlotOptions {
  return {
    width,
    height: 220,
    x: { type: 'log', label: 'chunk size (words, log) →' },
    y: metric === 'recall' ? { domain: [0, 1], tickFormat: '.0%', label: '↑ questions answered by the context', grid: true } : { label: '↑ words sent to the model per question', grid: true },
    color: { domain: ['k = 1', 'k = 3', 'k = 5'], range: [th.series2, th.series1, th.series3], legend: true },
    marks: [
      Plot.axisX(SIZES, { tickFormat: (d: number) => String(d) }),
      Plot.ruleX([size], { stroke: th.inkSecondary, strokeDasharray: '4 3' }),
      Plot.line(sweep, { x: 'size', y: metric, stroke: 'k', strokeWidth: 2 }),
      Plot.dot(sweep, { x: 'size', y: metric, fill: 'k', r: 3.5, tip: { format: { y: metric === 'recall' ? '.0%' : '.0f' } } }),
    ],
  }
}

export default function Rag() {
  const [c, setC] = useState(DEFAULTS)
  const deferred = useDeferredValue(c)
  const stale = deferred !== c
  const set = <K extends keyof Controls>(k: K) => (v: Controls[K]) =>
    setC((s) => {
      const next = { ...s, [k]: v }
      return { ...next, overlap: Math.min(next.overlap, next.size - 1) }
    })
  const t = useVizTheme()

  const { chunks, hits, found, evalAll, sweep } = useMemo(() => {
    const chunks = chunk(DOCS, deferred.size, deferred.overlap)
    const index = buildIndex(chunks)
    const q = QUESTIONS[deferred.question]
    const hits = search(index, q.q, deferred.k)
    const found = answerFound(q, hits.map((h) => h.chunk))
    const evalAll = evaluate(deferred.size, deferred.overlap, deferred.k)
    const sweep = [1, 3, 5].flatMap((k) =>
      SIZES.map((size) => {
        const e = evaluate(size, Math.round(size * (deferred.overlap / Math.max(1, deferred.size))), k)
        return { size, k: `k = ${k}`, recall: e.recall, words: e.contextWords }
      }),
    )
    return { chunks, hits, found, evalAll, sweep }
  }, [deferred])

  const q = QUESTIONS[deferred.question]
  const answerDoc = DOCS.find((d) => d.id === q.doc)!
  const a0 = answerDoc.text.indexOf(q.answer)
  const a1 = a0 + q.answer.length
  const hitIds = new Set(hits.map((h) => h.chunk.id))

  const highlight = (ch: Chunk) => {
    if (ch.doc !== q.doc || ch.end <= a0 || ch.start >= a1) return ch.text
    const s0 = Math.max(a0, ch.start) - ch.start
    const s1 = Math.min(a1, ch.end) - ch.start
    return (
      <>
        {ch.text.slice(0, s0)}
        <mark className={r.answer}>{ch.text.slice(s0, s1)}</mark>
        {ch.text.slice(s1)}
      </>
    )
  }

  const buildRecall = useCallback((w: number, th: VizTheme) => sweepChart('recall', sweep, deferred.size, w, th), [sweep, deferred.size])
  const buildWords = useCallback((w: number, th: VizTheme) => sweepChart('words', sweep, deferred.size, w, th), [sweep, deferred.size])

  const panel = (
    <>
      <label className={r.qPick}>
        <span>Question</span>
        <select value={c.question} onChange={(e) => set('question')(Number(e.target.value))}>
          {QUESTIONS.map((x, i) => (
            <option key={x.q} value={i}>
              {x.q}
            </option>
          ))}
        </select>
      </label>
      <Slider label="Chunk size" value={c.size} onChange={set('size')} min={5} max={200} step={1} log format={(v) => `${v} words`} />
      <Slider label="Overlap between chunks" value={c.overlap} onChange={set('overlap')} min={0} max={Math.max(1, c.size - 1)} step={1} format={(v) => `${v} words`} />
      <Slider label="Chunks retrieved (k)" value={c.k} onChange={set('k')} min={1} max={8} step={1} format={String} />
      <ResetButton onClick={() => setC(DEFAULTS)} />
    </>
  )

  return (
    <ModuleLayout
      controls={panel}
      onPreset={(p) => setC({ ...DEFAULTS, ...(p as Partial<Controls>) })}
      play={
        <div className={stale ? styles.stale : undefined}>
          <h3>What the model would see</h3>
          <p className="lede">
            “{q.q}” The top {deferred.k} chunks by BM25 keyword score, which is exactly the context an LLM would be given. The answer
            text is highlighted wherever it landed.
          </p>
          <StatRow>
            <Stat label="This question" value={<Status level={found === 'whole' ? 'good' : found === 'partial' ? 'warn' : 'bad'}>{STATUS_LABEL[found]}</Status>} note={`gold: “${q.answer}”`} />
            <Stat label="All 13 questions" value={pct(evalAll.recall, 0)} note={`answered by the context; ${pct(evalAll.partial, 0)} cut in half`} />
            <Stat label="Context per question" value={`${Math.round(evalAll.contextWords)} words`} note={`≈ ${Math.round(evalAll.contextWords * 1.35)} tokens`} />
          </StatRow>
          <ol className={r.hits}>
            {hits.map((h, i) => (
              <li key={h.chunk.id} className={h.chunk.doc === q.doc ? r.hitRight : undefined}>
                <div className={r.hitHead}>
                  <span>#{i + 1}</span> <b>{h.chunk.title}</b> <span className={r.score}>BM25 {h.score.toFixed(2)}</span>
                </div>
                <p>{highlight(h.chunk)}</p>
              </li>
            ))}
            {hits.length === 0 && <li>No chunk shares a single keyword with the question.</li>}
          </ol>
          <h3>The corpus, cut into chunks</h3>
          <p className="lede">Each bar is one document; each segment is a chunk ({chunks.length} in total). Retrieved chunks are filled; the black mark is where the answer lives.</p>
          <div className={r.strips}>
            {DOCS.map((d) => {
              const cs = chunks.filter((x) => x.doc === d.id)
              return (
                <div key={d.id} className={r.strip}>
                  <span className={r.stripLabel}>{d.title}</span>
                  <div className={r.bar}>
                    {cs.map((x, i) => (
                      <span
                        key={x.id}
                        title={x.text}
                        style={{
                          left: `${(x.start / d.text.length) * 100}%`,
                          width: `${((x.end - x.start) / d.text.length) * 100}%`,
                          top: deferred.overlap > 0 ? (i % 2) * 7 : 0,
                          background: hitIds.has(x.id) ? t.series1 : t.neutral,
                          opacity: hitIds.has(x.id) ? 0.95 : 0.45,
                        }}
                      />
                    ))}
                    {d.id === q.doc && <i style={{ left: `${(a0 / d.text.length) * 100}%`, width: `${((a1 - a0) / d.text.length) * 100}%` }} />}
                  </div>
                </div>
              )
            })}
          </div>
          <h3>Every question</h3>
          <DataTable
            rows={evalAll.perQuestion}
            rowKey={(x) => x.q.q}
            rowClass={(x) => (x.q.q === q.q ? 'hl' : undefined)}
            columns={[
              { key: 'q', label: 'Question', render: (x) => x.q.q },
              { key: 'f', label: 'Retrieved?', render: (x) => <Status level={x.found === 'whole' ? 'good' : x.found === 'partial' ? 'warn' : 'bad'}>{STATUS_LABEL[x.found]}</Status> },
              { key: 'w', label: 'Context words', align: 'right', render: (x) => x.words },
            ]}
          />
        </div>
      }
      breakIt={
        <div className={stale ? styles.stale : undefined}>
          <h3>Chunk size against k</h3>
          <div className={styles.grid2}>
            <PlotFigure build={buildRecall} label="Share of questions answered by the retrieved context, by chunk size and k" />
            <PlotFigure build={buildWords} label="Context words per question, by chunk size and k" />
          </div>
          <p className="lede">Small chunks cut answers in half; big chunks and large k find more but pay for every word in tokens, latency and distraction.</p>
        </div>
      }
    />
  )
}
