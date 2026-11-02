export const FieldCardRole = {
  TOP: { name: "TOP", value: "top", isInherited: false, isLinked: false },
  DIGIVOLUTION: { name: "DIGIVOLUTION", value: "digivolution", isInherited: true, isLinked: false },
  LINKED: { name: "LINKED", value: "linked", isInherited: false, isLinked: true },
} as const;

export type FieldCardRole = (typeof FieldCardRole)[keyof typeof FieldCardRole];
