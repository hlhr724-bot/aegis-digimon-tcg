import type { Schema } from "@colyseus/schema";

export type EngineSchemaCloner = {
  clone: <T extends Schema>(source: T) => T;
  cloneOf: (source: object) => object | undefined;
};
