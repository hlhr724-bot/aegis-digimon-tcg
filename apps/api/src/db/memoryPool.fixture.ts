import type { Pool } from "pg";
import { DataType } from "pg-mem";
import { createMemoryDatabase } from "#api/db/createMemoryDatabase";

/**
 * Test-only in-memory Postgres.
 *
 * `noAstCoverageCheck` works around a pg-mem limitation, not a defect in our SQL: when
 * `CREATE TABLE IF NOT EXISTS x` hits an existing `x`, pg-mem skips the statement without
 * consuming the column-constraint nodes of the parsed AST and then throws "parts have not been
 * read by the query planner". Real Postgres treats that statement as a no-op. Re-running the
 * DDL is the whole point of the migrator (its own `schema_migrations` table, and migration 001
 * against a legacy database), so the check has to be off to exercise those paths.
 */
export function createMemoryPool(): Pool {
  const db = createMemoryDatabase({ noAstCoverageCheck: true });
  db.public.registerFunction({
    name: "decode",
    args: [DataType.text, DataType.text],
    returns: DataType.bytea,
    implementation: (value: string, format: BufferEncoding) => Buffer.from(value, format),
  });
  db.public.registerFunction({
    name: "encode",
    args: [DataType.bytea, DataType.text],
    returns: DataType.text,
    implementation: (value: Buffer, format: BufferEncoding) => Buffer.from(value).toString(format),
  });
  db.public.registerFunction({
    name: "strpos",
    args: [DataType.text, DataType.text],
    returns: DataType.integer,
    implementation: (value: string, part: string) => value.indexOf(part) + 1,
  });
  return new (db.adapters.createPg().Pool)() as Pool;
}
