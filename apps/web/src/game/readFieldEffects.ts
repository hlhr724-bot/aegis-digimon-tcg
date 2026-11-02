import type { FieldEffectView } from "@aegis/shared";

export function readFieldEffects(json: string | undefined): FieldEffectView[] {
  if (!json) return [];
  try {
    const value: unknown = JSON.parse(json);
    if (!Array.isArray(value)) return [];
    return value.filter(
      (entry): entry is FieldEffectView =>
        entry !== null &&
        typeof entry === "object" &&
        ["dp", "restriction", "keyword"].includes(entry.kind) &&
        (typeof entry.value === "number" || typeof entry.value === "string") &&
        typeof entry.duration === "number",
    );
  } catch {
    return [];
  }
}
