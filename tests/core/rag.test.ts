import { describe, expect, it } from 'vitest'
import { DOCS, QUESTIONS } from '../../src/core/ai/corpus.ts'
import { answerFound, buildIndex, chunk, evaluate, search, tokenize } from '../../src/core/ai/rag.ts'

describe('corpus', () => {
  it('every answer appears verbatim in its document', () => {
    for (const q of QUESTIONS) expect(DOCS.find((d) => d.id === q.doc)!.text).toContain(q.answer)
  })
})

describe('chunking', () => {
  it('chunks cover every word, and overlap repeats words', () => {
    const d = [DOCS[0]]
    const words = d[0].text.split(/\s+/).length
    expect(chunk(d, 40, 0).reduce((s, c) => s + c.words, 0)).toBe(words)
    expect(chunk(d, 40, 10).reduce((s, c) => s + c.words, 0)).toBeGreaterThan(words)
  })

  it('a chunk’s text is the document slice it claims', () => {
    for (const c of chunk(DOCS, 25, 5)) expect(DOCS.find((d) => d.id === c.doc)!.text.slice(c.start, c.end)).toBe(c.text)
  })
})

describe('BM25 retrieval', () => {
  it('finds the right document for a keyword question', () => {
    const idx = buildIndex(chunk(DOCS, 60, 10))
    expect(search(idx, 'service account keys rotated', 1)[0].chunk.doc).toBe('access')
  })

  it('tokenizer drops stop words and crude-stems', () => {
    expect(tokenize('How long are the backups kept?')).toEqual(['backup', 'kept'])
  })
})

describe('retrieval quality', () => {
  it('keyword search can’t bridge a vocabulary gap (salary vs payroll)', () => {
    for (const [size, overlap, k] of [[40, 10, 5], [200, 0, 5]]) {
      const r = evaluate(size, overlap, k).perQuestion.find((p) => p.q.q.includes('salary'))!
      expect(r.found).toBe('missing')
    }
  })

  it('a reasonable setup finds most answers', () => {
    expect(evaluate(80, 20, 3).recall).toBeGreaterThan(0.75)
  })

  it('tiny chunks split answers across boundaries', () => {
    const tiny = evaluate(6, 0, 3)
    expect(tiny.partial).toBeGreaterThan(0)
    expect(tiny.recall).toBeLessThan(evaluate(80, 20, 3).recall)
  })

  it('overlap rescues answers that straddle a boundary', () => {
    expect(evaluate(20, 10, 3).recall).toBeGreaterThanOrEqual(evaluate(20, 0, 3).recall)
  })

  it('bigger chunks and more of them cost context words', () => {
    expect(evaluate(200, 0, 5).contextWords).toBeGreaterThan(evaluate(30, 0, 2).contextWords * 3)
  })

  it('k = 1 misses more than k = 5', () => {
    expect(evaluate(40, 10, 1).recall).toBeLessThan(evaluate(40, 10, 5).recall)
  })

  it('answerFound distinguishes whole, partial and missing', () => {
    const q = QUESTIONS[0]
    const doc = DOCS.find((d) => d.id === q.doc)!
    const a0 = doc.text.indexOf(q.answer)
    const mk = (start: number, end: number) => ({ id: 0, doc: q.doc, title: '', start, end, text: '', words: 1 })
    expect(answerFound(q, [mk(a0 - 5, a0 + q.answer.length + 5)])).toBe('whole')
    expect(answerFound(q, [mk(a0 + 3, a0 + 10)])).toBe('partial')
    expect(answerFound(q, [])).toBe('missing')
  })
})
