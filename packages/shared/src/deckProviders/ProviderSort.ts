export const ProviderSort = {
  DATE: { value: "date", direction: "desc" },
  PLACEMENT: { value: "placement", direction: "asc" },
} as const;
export type ProviderSort = (typeof ProviderSort)[keyof typeof ProviderSort]["value"];
