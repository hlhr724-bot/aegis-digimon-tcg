import type { CardConfirmationMode } from "@/game/cardConfirmation/CardConfirmationMode";
import { cardConfirmationModeValues } from "@/game/cardConfirmation/cardConfirmationModeValues";

const modeValues: ReadonlySet<string> = new Set(cardConfirmationModeValues);

export function isCardConfirmationMode(value: unknown): value is CardConfirmationMode {
  return typeof value === "string" && modeValues.has(value);
}
