import { DOCS, QUESTIONS, type Doc, type Question } from './corpus.ts'

/**
 * Retrieval for RAG: chunk documents, index them with BM25, retrieve the top k for a question, and
 * score whether the answer text made it into the retrieved context (recall@k). Everything an LLM
 * would later see, and nothing it can fix if retrieval missed.
 */
export interface Chunk {
  id: number
  doc: string
  title: string
  /** Character range in the document. */
  start: number
  end: number
  text: string
  words: number
}

const wordRe = /\S+/g

/** Split each document into windows of `size` words, each overlapping the previous by `overlap` words. */
export function chunk(docs: readonly Doc[], size: number, overlap: number): Chunk[] {
  const out: Chunk[] = []
  const step = Math.max(1, size - overlap)
  for (const d of docs) {
    const words = [...d.text.matchAll(wordRe)].map((m) => ({ start: m.index!, end: m.index! + m[0].length }))
    for (let i = 0; i < words.length; i += step) {
      const last = Math.min(words.length, i + size) - 1
      const start = words[i].start
      const end = words[last].end
      out.push({ id: out.length, doc: d.id, title: d.title, start, end, text: d.text.slice(start, end), words: last - i + 1 })
      if (last === words.length - 1) break
    }
  }
  return out
}

const STOP = new Set('a an the of to in on for and or is are be by at as it its do does i my we our what how much many when long must after with from this that within every per who should can if about'.split(' '))

export const tokenize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w))
    .map((w) => w.replace(/(ing|ed|s)$/, '')) // a crude stemmer, enough for the demo

export interface Index {
  chunks: Chunk[]
  tf: Map<string, number>[]
  df: Map<string, number>
  avgLen: number
}

export function buildIndex(chunks: Chunk[]): Index {
  const tf = chunks.map((c) => {
    const m = new Map<string, number>()
    for (const t of tokenize(c.text)) m.set(t, (m.get(t) ?? 0) + 1)
    return m
  })
  const df = new Map<string, number>()
  for (const m of tf) for (const t of m.keys()) df.set(t, (df.get(t) ?? 0) + 1)
  const avgLen = tf.reduce((s, m) => s + [...m.values()].reduce((a, b) => a + b, 0), 0) / Math.max(1, tf.length)
  return { chunks, tf, df, avgLen }
}

/** Okapi BM25 (k1 = 1.2, b = 0.75). */
export function search(index: Index, query: string, k: number) {
  const q = tokenize(query)
  const N = index.chunks.length
  const scored = index.chunks.map((c, i) => {
    const m = index.tf[i]
    const len = [...m.values()].reduce((a, b) => a + b, 0)
    let score = 0
    for (const t of q) {
      const f = m.get(t) ?? 0
      if (!f) continue
      const n = index.df.get(t) ?? 0
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5))
      score += idf * ((f * 2.2) / (f + 1.2 * (1 - 0.75 + (0.75 * len) / index.avgLen)))
    }
    return { chunk: c, score }
  })
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}

/** Does the retrieved context contain the whole answer (inside a single chunk)? */
export function answerFound(q: Question, retrieved: readonly Chunk[]): 'whole' | 'partial' | 'missing' {
  const doc = DOCS.find((d) => d.id === q.doc)!
  const a0 = doc.text.indexOf(q.answer)
  const a1 = a0 + q.answer.length
  if (retrieved.some((c) => c.doc === q.doc && c.start <= a0 && c.end >= a1)) return 'whole'
  if (retrieved.some((c) => c.doc === q.doc && c.end > a0 && c.start < a1)) return 'partial'
  return 'missing'
}

export interface EvalResult {
  recall: number
  partial: number
  /** Average words of context sent to the model per question. */
  contextWords: number
  perQuestion: { q: Question; found: 'whole' | 'partial' | 'missing'; words: number }[]
}

export function evaluate(size: number, overlap: number, k: number, questions: readonly Question[] = QUESTIONS): EvalResult {
  const index = buildIndex(chunk(DOCS, size, overlap))
  const perQuestion = questions.map((q) => {
    const hits = search(index, q.q, k).map((h) => h.chunk)
    return { q, found: answerFound(q, hits), words: hits.reduce((s, c) => s + c.words, 0) }
  })
  const n = perQuestion.length
  return {
    recall: perQuestion.filter((p) => p.found === 'whole').length / n,
    partial: perQuestion.filter((p) => p.found === 'partial').length / n,
    contextWords: perQuestion.reduce((s, p) => s + p.words, 0) / n,
    perQuestion,
  }
}
