export const RuntimeNodeKind = {
  OBJECT: { name: "OBJECT", value: "object" },
  ARRAY: { name: "ARRAY", value: "array" },
  MAP: { name: "MAP", value: "map" },
  SET: { name: "SET", value: "set" },
  REFERENCE: { name: "REFERENCE", value: "reference" },
  RESOURCE: { name: "RESOURCE", value: "resource" },
  CALLBACK: { name: "CALLBACK", value: "callback" },
} as const;

export type RuntimeNodeKind = (typeof RuntimeNodeKind)[keyof typeof RuntimeNodeKind]["value"];
