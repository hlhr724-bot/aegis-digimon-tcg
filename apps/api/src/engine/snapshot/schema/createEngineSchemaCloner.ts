import { $changes, $childType, $numFields, $values, ArraySchema, Schema } from "@colyseus/schema";
import { ENGINE_SCHEMA_CLASSES } from "#api/engine/snapshot/schema/ENGINE_SCHEMA_CLASSES";
import type { EngineSchemaCloner } from "#api/engine/snapshot/schema/EngineSchemaCloner";

type SchemaConstructor = new () => Schema;
type FieldKind = "primitive" | "schema" | "primitiveArray" | "schemaArray";
type FieldPlan = { index: number; kind: FieldKind };
type ClassPlan = { prototype: object; fields: FieldPlan[]; dataProperties: string[] };
type FieldMetadata = { name: string; type: unknown };
type ArrayInternals = { items: unknown[]; tmpItems: unknown[] };
type ChangeTreeParent = { setParent: (parent: object, root: undefined, index: number) => void };

let classPlans: Map<Function, ClassPlan> | undefined;

export function createEngineSchemaCloner(): EngineSchemaCloner {
  const plans = getClassPlans();
  const copies = new Map<object, object>();

  function cloneSchema(source: Schema): Schema {
    const existing = copies.get(source);
    if (existing !== undefined) return existing as Schema;
    const plan = plans.get(source.constructor);
    if (plan === undefined) throw new Error(`Engine schema cloner has no plan for ${source.constructor.name}`);
    const instance = Object.create(plan.prototype) as Schema;
    Schema.initialize(instance);
    copies.set(source, instance);
    const sourceValues = valuesOf(source);
    const values = valuesOf(instance);
    for (const field of plan.fields) {
      const value = sourceValues[field.index];
      if (value === undefined || value === null || field.kind === "primitive") {
        values[field.index] = value;
      } else if (field.kind === "schema") {
        const child = cloneSchema(value as Schema);
        changeTreeOf(child).setParent(instance, undefined, field.index);
        values[field.index] = child;
      } else {
        values[field.index] = cloneArray(
          value as ArraySchema<unknown>,
          field.kind === "schemaArray",
          instance,
          field.index,
        );
      }
    }
    for (const name of plan.dataProperties) {
      if (Object.hasOwn(source, name)) {
        (instance as unknown as Record<string, unknown>)[name] = copyPlainData(
          (source as unknown as Record<string, unknown>)[name],
        );
      }
    }
    return instance;
  }

  function cloneArray(source: ArraySchema<unknown>, schemaChildren: boolean, parent: object, index: number) {
    const existing = copies.get(source);
    if (existing !== undefined) return existing;
    const array = new ArraySchema<unknown>();
    copies.set(source, array);
    const sourceItems = (source as unknown as ArrayInternals).items;
    let items: unknown[];
    if (schemaChildren) {
      items = new Array<unknown>(sourceItems.length);
      for (let position = 0; position < sourceItems.length; position++) {
        const child = cloneSchema(sourceItems[position] as Schema);
        items[position] = child;
        changeTreeOf(child).setParent(array, undefined, position);
      }
    } else {
      items = sourceItems.slice();
    }
    (array as unknown as Record<symbol, unknown>)[$childType] = (source as unknown as Record<symbol, unknown>)[
      $childType
    ];
    (array as unknown as ArrayInternals).items = items;
    (array as unknown as ArrayInternals).tmpItems = items.slice();
    changeTreeOf(array).setParent(parent, undefined, index);
    return array;
  }

  return {
    clone: <T extends Schema>(source: T): T => {
      copies.clear();
      return cloneSchema(source) as T;
    },
    cloneOf: (source) => copies.get(source),
  };
}

function getClassPlans(): Map<Function, ClassPlan> {
  if (classPlans !== undefined) return classPlans;
  classPlans = new Map(
    ENGINE_SCHEMA_CLASSES.map(({ constructor }) => [constructor, planFor(constructor as unknown as SchemaConstructor)]),
  );
  return classPlans;
}

function planFor(SchemaClass: SchemaConstructor): ClassPlan {
  const metadata = (SchemaClass as unknown as Record<symbol, Record<PropertyKey, unknown>>)[Symbol.metadata]!;
  const lastIndex = metadata[$numFields as unknown as PropertyKey] as number;
  const fields: FieldPlan[] = [];
  const annotated = new Set<string>();
  for (let index = 0; index <= lastIndex; index++) {
    const field = metadata[index] as FieldMetadata | undefined;
    if (field === undefined) continue;
    annotated.add(field.name);
    fields.push({ index, kind: fieldKind(field.type) });
  }
  const template = new SchemaClass();
  const dataProperties = Object.entries(Object.getOwnPropertyDescriptors(template))
    .filter(([name, descriptor]) => !annotated.has(name) && descriptor.get === undefined)
    .map(([name]) => name);
  return { prototype: SchemaClass.prototype, fields, dataProperties };
}

function fieldKind(type: unknown): FieldKind {
  if (typeof type === "string") return "primitive";
  if (typeof type === "function") return "schema";
  const child = Array.isArray(type) ? type[0] : (type as { array?: unknown }).array;
  if (child === undefined) throw new Error("Engine schema cloner found an unsupported container field");
  return typeof child === "function" ? "schemaArray" : "primitiveArray";
}

function valuesOf(instance: object): unknown[] {
  return (instance as unknown as Record<symbol, unknown[]>)[$values]!;
}

function changeTreeOf(instance: object): ChangeTreeParent {
  return (instance as unknown as Record<symbol, unknown>)[$changes] as ChangeTreeParent;
}

function copyPlainData(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(copyPlainData);
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error("Engine schema cloner found an unsupported data property value");
  }
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(value)) copy[key] = copyPlainData((value as Record<string, unknown>)[key]);
  return copy;
}
