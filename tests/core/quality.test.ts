import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../src/core/random.ts'
import { dailyCounts, detect, score } from '../../src/core/quality.ts'

const P = { floor: 7000, k: 3, tolerance: 0.1 }

describe('volume anomaly detection', () => {
  for (const seed of [1, 2, 3]) {
    const days = dailyCounts(mulberry32(seed))
    it(`seed ${seed}: a static floor either cries wolf every weekend or misses the weekday partial load`, () => {
      const high = score(days, detect(days, 'static', P))
      expect(high.falseAlarms).toBeGreaterThan(10)
      const low = score(days, detect(days, 'static', { ...P, floor: 5000 }))
      expect(low.falseAlarms).toBe(0)
      expect(low.missed).toContain('partial load (40% missing)')
    })
    it(`seed ${seed}: a trailing z-score is blinded by weekly seasonality`, () => {
      const z = score(days, detect(days, 'zscore', P))
      expect(z.caught).toBe(1)
      expect(z.falseAlarms).toBe(0)
    })
    it(`seed ${seed}: same-weekday comparison catches all four with few false alarms`, () => {
      const s = score(days, detect(days, 'seasonal', P))
      expect(s.caught).toBe(4)
      expect(s.falseAlarms).toBeLessThanOrEqual(3)
      const tight = score(days, detect(days, 'seasonal', { ...P, tolerance: 0.05 }))
      expect(tight.falseAlarms).toBeGreaterThan(15)
    })
  }
})
