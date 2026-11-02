export const HandSortDirection = {
  ASCENDING: { name: "ASCENDING", value: "ascending", sign: 1 },
  DESCENDING: { name: "DESCENDING", value: "descending", sign: -1 },
} as const;

export type HandSortDirection = (typeof HandSortDirection)[keyof typeof HandSortDirection]["value"];

export const HAND_SORT_DIRECTION_ENTRIES = Object.values(HandSortDirection);

export const HAND_SORT_DIRECTIONS: readonly HandSortDirection[] = HAND_SORT_DIRECTION_ENTRIES.map(
  (entry) => entry.value,
);
