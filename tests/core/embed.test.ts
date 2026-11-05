import { describe, expect, it } from 'vitest'
import { collection, cosine, embedPhrases, exactSearch, ivfSearch, kmeans, normalize, pca2, PHRASES, rank, recallAt } from '../../src/core/ai/embed.ts'
import { mulberry32, normal } from '../../src/core/random.ts'

const idx = (s: string) => PHRASES.findIndex((p) => p.text.startsWith(s))

describe('toy embeddings', () => {
  const vs = embedPhrases()

  it('salary lands next to payroll despite sharing no words', () => {
    const order = rank(vs[idx('my salary')], vs, 'cosine').map((r) => r.i)
    expect(order[0]).toBe(idx('my salary'))
    expect(order.slice(1, 3)).toContain(idx('payroll'))
  })

  it('cosine is scale-free; raw dot product favours long vectors', () => {
    const q = vs[idx('how many vacation')]
    const long = idx('the complete employee handbook')
    const byCos = rank(q, vs, 'cosine').map((r) => r.i)
    const byDot = rank(q, vs, 'dot').map((r) => r.i)
    expect(byDot.indexOf(long)).toBeLessThan(byCos.indexOf(long))
    expect(byDot.slice(0, 2)).toContain(long)
  })

  it('cosine of a vector with itself is 1, with its opposite −1', () => {
    const v = normalize([1, 2, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1])
    expect(cosine(v, v)).toBeCloseTo(1, 12)
    expect(cosine(v, v.map((x) => -x))).toBeCloseTo(-1, 12)
  })

  it('PCA returns one 2-D point per vector', () => {
    expect(pca2(vs)).toHaveLength(vs.length)
  })
})

describe('IVF approximate search', () => {
  const vs = collection(3000, 24, 0.5)
  const index = kmeans(vs, 32)
  const rng = mulberry32(9)
  const queries = Array.from({ length: 30 }, () => normalize(vs[Math.floor(rng() * vs.length)].map((x) => x + 0.2 * normal(rng))))
  const avg = (nprobe: number) => {
    let r = 0
    let scanned = 0
    for (const q of queries) {
      const a = ivfSearch(q, vs, index, nprobe, 10)
      r += recallAt(a.ids, exactSearch(q, vs, 10))
      scanned += a.scanned
    }
    return { recall: r / queries.length, scanned: scanned / queries.length }
  }

  it('probing every list is exact', () => {
    expect(avg(32).recall).toBe(1)
  })

  it('more probes: higher recall, more vectors scanned', () => {
    const one = avg(1)
    const four = avg(4)
    expect(four.recall).toBeGreaterThan(one.recall)
    expect(four.scanned).toBeGreaterThan(one.scanned * 2)
    expect(one.scanned).toBeLessThan(vs.length / 10)
  })
})
