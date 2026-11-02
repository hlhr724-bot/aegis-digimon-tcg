import { newDb } from "pg-mem";
import type { IMemoryDb, MemoryDbOptions } from "pg-mem";

export function createMemoryDatabase(options?: MemoryDbOptions): IMemoryDb {
  const db = newDb(options);
  db.public.interceptQueries((query) => (/^LOCK TABLE /i.test(query) ? [] : null));
  return db;
}
