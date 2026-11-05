import * as duckdb from '@duckdb/duckdb-wasm'
import ehWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url'
import mvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url'
import ehWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'
import mvpWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url'
import { normalizeRow, type Db, type Row } from '../core/db.ts'

const BUNDLES: duckdb.DuckDBBundles = {
  mvp: { mainModule: mvpWasm, mainWorker: mvpWorker },
  eh: { mainModule: ehWasm, mainWorker: ehWorker },
}

let instance: Promise<duckdb.AsyncDuckDB> | null = null

/** One DuckDB-WASM instance per page, started on first use (the download is ~8 MB compressed). */
function getInstance(): Promise<duckdb.AsyncDuckDB> {
  instance ??= (async () => {
    const bundle = await duckdb.selectBundle(BUNDLES)
    const worker = new Worker(bundle.mainWorker!)
    const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker)
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker)
    return db
  })()
  return instance
}

/** Arrow hands DATE/TIMESTAMP back as epoch milliseconds; turn those columns into Date objects. */
function dateColumns(table: { schema: { fields: { name: string; type: unknown }[] } }): string[] {
  return table.schema.fields.filter((f) => /^(Date|Timestamp)/.test(String(f.type))).map((f) => f.name)
}

/**
 * A connection behind the Db interface. Statements are queued so callers (several panels on one
 * page) never run concurrently on the same connection.
 */
export async function wasmDb(): Promise<Db & { close: () => Promise<void> }> {
  const db = await getInstance()
  const conn = await db.connect()
  let queue: Promise<unknown> = Promise.resolve()
  const enqueue = <T>(job: () => Promise<T>): Promise<T> => {
    const next = queue.then(job, job)
    queue = next.catch(() => {})
    return next
  }
  return {
    all<T = Row>(sql: string) {
      return enqueue(async () => {
        const table = await conn.query(sql)
        const dates = dateColumns(table)
        return table.toArray().map((r) => {
          const row = normalizeRow(r.toJSON() as Row)
          for (const k of dates) if (typeof row[k] === 'number') row[k] = new Date(row[k] as number)
          return row
        }) as T[]
      })
    },
    run(sql: string) {
      return enqueue(async () => {
        await conn.query(sql)
      })
    },
    close: () => enqueue(() => conn.close()),
  }
}
