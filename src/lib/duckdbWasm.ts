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

/** A fresh in-memory database behind the Db interface. */
export async function wasmDb(): Promise<Db & { close: () => Promise<void> }> {
  const db = await getInstance()
  const conn = await db.connect()
  return {
    async all<T = Row>(sql: string) {
      const table = await conn.query(sql)
      return table.toArray().map((r) => normalizeRow(r.toJSON() as Row)) as T[]
    },
    async run(sql: string) {
      await conn.query(sql)
    },
    close: () => conn.close(),
  }
}
