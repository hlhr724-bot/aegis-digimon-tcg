import { SpectatorAccess } from "#shared/account/SpectatorAccess";

export function isSpectatorAccess(value: unknown): value is SpectatorAccess {
  return typeof value === "string" && Object.values(SpectatorAccess).some((entry) => entry.value === value);
}
