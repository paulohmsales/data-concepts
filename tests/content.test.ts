import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { labs } from '../src/modules/labs.ts'
import { visuals } from '../src/visuals/index.ts'

// The API validates content structure (api/tests); this checks the references into frontend code.
const dir = join(import.meta.dirname, '..', 'content', 'modules')
const modules = readdirSync(dir)
  .filter((f) => f.endsWith('.yaml'))
  .map((f) => ({ file: f, doc: parse(readFileSync(join(dir, f), 'utf8')) as { lab: string; deep_dive?: { type: string; key?: string }[] } }))

describe('content references frontend code that exists', () => {
  it('found the modules', () => expect(modules.length).toBeGreaterThanOrEqual(24))

  for (const { file, doc } of modules) {
    it(`${file}: lab and visuals are registered`, () => {
      expect(labs[doc.lab], `lab "${doc.lab}"`).toBeDefined()
      for (const b of doc.deep_dive ?? []) {
        if (b.type === 'visual' || b.type === 'stepper') expect(visuals[b.key!], `visual "${b.key}"`).toBeDefined()
      }
    })
  }
})
