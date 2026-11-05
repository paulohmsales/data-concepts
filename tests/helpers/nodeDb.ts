import { DuckDBInstance } from '@duckdb/node-api'
import { normalizeRow, type Db, type Row } from '../../src/core/db.ts'

/** A fresh in-memory DuckDB behind the Db interface (native engine; the browser uses WASM). */
export async function nodeDb(): Promise<Db> {
  const instance = await DuckDBInstance.create(':memory:')
  const conn = await instance.connect()
  return {
    async all<T = Row>(sql: string) {
      const reader = await conn.runAndReadAll(sql)
      return reader.getRowObjectsJS().map((r) => normalizeRow(r as Row)) as T[]
    },
    async run(sql: string) {
      await conn.run(sql)
    },
  }
}
