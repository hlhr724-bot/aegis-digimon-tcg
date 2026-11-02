import { CardConfirmationMode } from "@/game/cardConfirmation/CardConfirmationMode";

export const cardConfirmationModeValues: readonly CardConfirmationMode[] = Object.values(CardConfirmationMode).map(
  (mode) => mode.value,
);
