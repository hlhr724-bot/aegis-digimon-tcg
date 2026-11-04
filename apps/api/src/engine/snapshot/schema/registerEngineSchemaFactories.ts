import { createHash } from "node:crypto";
import { $childType, $numFields, $refId, ArraySchema, Schema } from "@colyseus/schema";
import type { RuntimeObjectRegistry } from "#api/engine/snapshot/RuntimeObjectRegistry";
import { ENGINE_SCHEMA_CLASSES } from "#api/engine/snapshot/schema/ENGINE_SCHEMA_CLASSES";
import { EngineSchemaKind } from "#api/engine/snapshot/schema/EngineSchemaKind";

type Params = { objects: RuntimeObjectRegistry };
type SchemaConstructor = new () => Schema;
type ClassEntry = { key: string; constructor: SchemaConstructor };
type FieldMetadata = { name: string; type: unknown };
type SchemaPayload = { fingerprint: string; fields: [string, unknown][] };
type ArrayPayload = { childType: string | undefined; values: unknown[] };
type Layout = {
  prototype: object;
  fingerprint: string;
  fields: Map<string, PropertyDescriptor>;
  names: string[];
  annotated: Set<string>;
  types: Map<string, unknown>;
  symbols: Set<symbol>;
};
type LayoutParams = { entry: ClassEntry; classKeys: Map<Function, string> };
type DescribeParams = { value: object; layout: Layout };
type HydrateParams = DescribeParams & { payload: unknown };
type OrderParams = { layout: Layout; payload: SchemaPayload };
type ValidPayloadParams = OrderParams & { value: object };
type TypeParams = { value: unknown; classKeys: Map<Function, string> };
type ValidateFieldParams = { value: unknown; type: unknown };
type ArrayTypeParams = { value: ArraySchema<unknown>; classKeys: Map<Function, string> };
type ArrayValidateParams = { value: ArraySchema<unknown>; names: Set<string>; symbols: Set<symbol> };

const PRIMITIVE_CHILD_TYPES = new Set([
  "string",
  "boolean",
  "number",
  "int8",
  "uint8",
  "int16",
  "uint16",
  "int32",
  "uint32",
  "int64",
  "uint64",
  "float32",
  "float64",
  "bigint64",
  "biguint64",
]);
const VISIBILITY_PORT = Symbol.for("aegis.visibilityPort");

type SchemaRegistrations = {
  classKeys: Map<Function, string>;
  classes: Map<string, SchemaConstructor>;
  layouts: { entry: ClassEntry; layout: Layout }[];
  arrayNames: Set<string>;
  arraySymbols: Set<symbol>;
};

let schemaRegistrations: SchemaRegistrations | undefined;

function getSchemaRegistrations(): SchemaRegistrations {
  if (schemaRegistrations !== undefined) {
    return schemaRegistrations;
  }
  const classKeys = new Map<Function, string>(ENGINE_SCHEMA_CLASSES.map((entry) => [entry.constructor, entry.key]));
  const classes = new Map<string, SchemaConstructor>(
    ENGINE_SCHEMA_CLASSES.map((entry) => [entry.key, entry.constructor]),
  );
  const layouts = ENGINE_SCHEMA_CLASSES.map((entry) => ({ entry, layout: getLayout({ entry, classKeys }) }));
  const arrayTemplate = new ArraySchema<unknown>();
  schemaRegistrations = {
    classKeys,
    classes,
    layouts,
    arrayNames: new Set(Object.getOwnPropertyNames(arrayTemplate)),
    arraySymbols: new Set([...Object.getOwnPropertySymbols(arrayTemplate), $refId]),
  };
  return schemaRegistrations;
}

export function registerEngineSchemaFactories({ objects }: Params): void {
  const { classKeys, classes, layouts, arrayNames: names, arraySymbols: symbols } = getSchemaRegistrations();
  for (const { entry, layout } of layouts) {
    const SchemaClass = entry.constructor;
    objects.registerFactory({
      key: entry.key,
      prototype: SchemaClass.prototype,
      allocate: () => allocateSchema(SchemaClass),
      describe: (value) => describeSchema({ value, layout }),
      hydrate: ({ value, payload }) => hydrateSchema({ value, payload, layout }),
    });
  }
  objects.registerFactory({
    key: EngineSchemaKind.ARRAY.value,
    prototype: ArraySchema.prototype,
    allocate: () => new ArraySchema<unknown>(),
    describe: (value) => {
      const array = value as ArraySchema<unknown>;
      validateArray({ value: array, names, symbols });
      return { childType: getArrayChildType({ value: array, classKeys }), values: array.toArray() };
    },
    hydrate: ({ value, payload }) => {
      if (!isArrayPayload(payload)) {
        throw new Error("Invalid schema array payload");
      }
      const array = value as ArraySchema<unknown>;
      let childType: string | SchemaConstructor | undefined;
      if (payload.childType !== undefined) {
        childType = classes.get(payload.childType) ?? payload.childType;
        if (typeof childType === "string" && !PRIMITIVE_CHILD_TYPES.has(childType)) {
          throw new Error("Unknown schema array child type");
        }
      }
      for (const entry of payload.values) {
        validateFieldValue({ value: entry, type: childType });
      }
      (array as unknown as Record<symbol, unknown>)[$childType] = childType;
      for (const entry of payload.values) {
        array.push(entry);
      }
    },
  });
}

function allocateSchema(SchemaClass: SchemaConstructor): Schema {
  const instance = Object.create(SchemaClass.prototype) as Schema;
  Schema.initialize(instance);
  return instance;
}

function getLayout({ entry, classKeys }: LayoutParams): Layout {
  const template = new entry.constructor();
  const fields = new Map<string, PropertyDescriptor>();
  const annotated = new Set<string>();
  const types = new Map<string, unknown>();
  const metadata = (entry.constructor as unknown as Record<symbol, Record<PropertyKey, unknown>>)[Symbol.metadata]!;
  const lastIndex = metadata[$numFields as unknown as PropertyKey] as number;
  const signatures: unknown[] = [];
  for (let index = 0; index <= lastIndex; index++) {
    const field = metadata[index] as FieldMetadata | undefined;
    if (field === undefined) {
      continue;
    }
    let prototype: object | null = template;
    let descriptor: PropertyDescriptor | undefined;
    while (prototype !== null && descriptor === undefined) {
      descriptor = Object.getOwnPropertyDescriptor(prototype, field.name);
      prototype = Object.getPrototypeOf(prototype) as object | null;
    }
    if (descriptor === undefined || descriptor.get === undefined || descriptor.set === undefined) {
      throw new Error(`Schema field has no registered accessor: ${entry.key}/${field.name}`);
    }
    fields.set(field.name, descriptor);
    annotated.add(field.name);
    types.set(field.name, field.type);
    signatures.push([field.name, getTypeSignature({ value: field.type, classKeys })]);
  }
  for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(template))) {
    if (!annotated.has(name)) {
      if (descriptor.get !== undefined || descriptor.set !== undefined) {
        throw new Error(`Schema data property is an accessor: ${name}`);
      }
      fields.set(name, descriptor);
      signatures.push([name]);
    }
  }
  const fingerprint = createHash("sha256").update(JSON.stringify(signatures)).digest("hex");
  return {
    prototype: entry.constructor.prototype,
    fingerprint,
    fields,
    names: [...fields.keys()],
    annotated,
    types,
    symbols: new Set([...Object.getOwnPropertySymbols(template), $refId, VISIBILITY_PORT]),
  };
}

function describeSchema({ value, layout }: DescribeParams): SchemaPayload {
  if (Object.getPrototypeOf(value) !== layout.prototype) {
    throw new Error("Schema prototype changed after registration");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.getOwnPropertySymbols(value).some((symbol) => !layout.symbols.has(symbol))) {
    throw new Error("Schema contains an unsupported symbol");
  }
  for (const symbol of Object.getOwnPropertySymbols(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, symbol)!;
    if (descriptor.get !== undefined || descriptor.set !== undefined) {
      throw new Error("Schema internals contain an unsupported accessor");
    }
  }
  for (const name of Object.keys(descriptors)) {
    if (!layout.fields.has(name)) {
      throw new Error(`Schema contains an undeclared property: ${name}`);
    }
  }
  const fields: [string, unknown][] = [];
  for (const [name, canonical] of layout.fields) {
    const descriptor = descriptors[name];
    if (layout.annotated.has(name)) {
      if (descriptor !== undefined && (descriptor.get !== canonical.get || descriptor.set !== canonical.set)) {
        throw new Error(`Schema accessor was replaced: ${name}`);
      }
      const fieldValue: unknown = Reflect.get(value, name);
      validateFieldValue({ value: fieldValue, type: layout.types.get(name) });
      fields.push([name, fieldValue]);
    } else if (descriptor !== undefined) {
      if (descriptor.get !== undefined || descriptor.set !== undefined) {
        throw new Error(`Schema data property is an accessor: ${name}`);
      }
      fields.push([name, descriptor.value]);
    }
  }
  return { fingerprint: layout.fingerprint, fields };
}

function hydrateSchema({ value, layout, payload }: HydrateParams): void {
  if (!isSchemaPayload(payload) || payload.fingerprint !== layout.fingerprint) {
    throw new Error("Schema layout fingerprint mismatch or invalid payload");
  }
  const absent = absentFieldsInLayoutOrder({ layout, payload });
  if (absent === undefined) {
    hydrateUnorderedSchema({ value, layout, payload });
    return;
  }
  for (const [name, entry] of payload.fields) {
    validateFieldValue({ value: entry, type: layout.types.get(name) });
  }
  for (const name of absent) {
    Reflect.deleteProperty(value, name);
  }
  for (const [name, entry] of payload.fields) {
    Reflect.set(value, name, entry);
  }
}

function absentFieldsInLayoutOrder({ layout, payload }: OrderParams): string[] | undefined {
  const absent: string[] = [];
  let cursor = 0;
  for (const [name] of payload.fields) {
    while (cursor < layout.names.length && layout.names[cursor] !== name) {
      if (layout.annotated.has(layout.names[cursor]!)) {
        return undefined;
      }
      absent.push(layout.names[cursor]!);
      cursor++;
    }
    if (cursor === layout.names.length) {
      return undefined;
    }
    cursor++;
  }
  for (; cursor < layout.names.length; cursor++) {
    if (layout.annotated.has(layout.names[cursor]!)) {
      return undefined;
    }
    absent.push(layout.names[cursor]!);
  }
  return absent;
}

function hydrateUnorderedSchema({ value, layout, payload }: ValidPayloadParams): void {
  const fields = new Map<string, unknown>();
  for (const [name, entry] of payload.fields) {
    if (!layout.fields.has(name) || fields.has(name)) {
      throw new Error("Schema payload contains an unknown or duplicate field");
    }
    fields.set(name, entry);
  }
  for (const name of layout.annotated) {
    if (!fields.has(name)) {
      throw new Error("Schema payload is missing an annotated field");
    }
  }
  for (const [name, type] of layout.types) {
    validateFieldValue({ value: fields.get(name), type });
  }
  for (const name of layout.fields.keys()) {
    if (!fields.has(name)) {
      Reflect.deleteProperty(value, name);
    }
  }
  for (const [name, entry] of fields) {
    Reflect.set(value, name, entry);
  }
}

function validateFieldValue({ value, type }: ValidateFieldParams): void {
  if (value === undefined || value === null || type === undefined) {
    return;
  }
  if (typeof type === "function") {
    if (!(value instanceof type)) {
      throw new Error("Schema field has the wrong schema class");
    }
    return;
  }
  if (typeof type === "string") {
    let expected = "number";
    if (type === "string" || type === "boolean") {
      expected = type;
    } else if (type === "bigint64" || type === "biguint64") {
      expected = "bigint";
    }
    if (!PRIMITIVE_CHILD_TYPES.has(type) || typeof value !== expected) {
      throw new Error("Schema field has the wrong primitive type");
    }
    return;
  }
  let childType: unknown;
  if (Array.isArray(type) && type.length === 1) {
    childType = type[0];
  } else if (type !== null && typeof type === "object" && "array" in type) {
    childType = type.array;
  } else {
    throw new Error("Unsupported schema container field");
  }
  if (!(value instanceof ArraySchema)) {
    throw new Error("Schema field is not a schema array");
  }
  for (const entry of value) {
    validateFieldValue({ value: entry, type: childType });
  }
}

function getTypeSignature({ value, classKeys }: TypeParams): unknown {
  if (typeof value === "function") {
    const key = classKeys.get(value);
    if (key === undefined) {
      throw new Error("Schema field uses an unregistered class");
    }
    return { schema: key };
  }
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => getTypeSignature({ value: entry, classKeys }));
  }
  if (value !== null && typeof value === "object") {
    return Object.entries(value).map(([key, entry]) => [key, getTypeSignature({ value: entry, classKeys })]);
  }
  throw new Error("Unsupported schema field type");
}

function getArrayChildType({ value, classKeys }: ArrayTypeParams): string | undefined {
  const childType = (value as unknown as Record<symbol, unknown>)[$childType];
  if (childType === undefined) {
    return undefined;
  }
  if (typeof childType === "string" && PRIMITIVE_CHILD_TYPES.has(childType)) {
    return childType;
  }
  if (typeof childType === "function" && classKeys.has(childType)) {
    return classKeys.get(childType)!;
  }
  throw new Error("Schema array uses an unregistered child type");
}

function validateArray({ value, names, symbols }: ArrayValidateParams): void {
  if (
    Object.getPrototypeOf(value) !== ArraySchema.prototype ||
    Object.getOwnPropertySymbols(value).some((symbol) => !symbols.has(symbol)) ||
    Object.getOwnPropertyNames(value).some((name) => !names.has(name))
  ) {
    throw new Error("Schema array has unsupported properties");
  }
  for (const key of [...Object.getOwnPropertyNames(value), ...Object.getOwnPropertySymbols(value)]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (descriptor.get !== undefined || descriptor.set !== undefined) {
      throw new Error("Schema array contains an unsupported accessor");
    }
  }
  for (let index = 0; index < value.length; index++) {
    if (!(index in value) || value[index] === null || value[index] === undefined) {
      throw new Error("Schema array has an unsettled empty slot");
    }
  }
}

function isSchemaPayload(value: unknown): value is SchemaPayload {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const payload = value as SchemaPayload;
  return (
    typeof payload.fingerprint === "string" &&
    Array.isArray(payload.fields) &&
    payload.fields.every((entry) => Array.isArray(entry) && entry.length === 2 && typeof entry[0] === "string")
  );
}

function isArrayPayload(value: unknown): value is ArrayPayload {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const payload = value as ArrayPayload;
  return (
    (payload.childType === undefined || typeof payload.childType === "string") &&
    Array.isArray(payload.values) &&
    Array.from(payload.values).every(
      (entry, index) => Object.hasOwn(payload.values, index) && entry !== undefined && entry !== null,
    )
  );
}
