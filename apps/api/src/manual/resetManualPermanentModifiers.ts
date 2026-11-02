import { ArraySchema } from "@colyseus/schema";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import type { Permanent } from "@aegis/shared/schema/Permanent";

type Params = { permanent: Permanent };

export function resetManualPermanentModifiers({ permanent }: Params): void {
  const dp = getCardDefinition(permanent.topCard.cardId)?.dp ?? 0;
  permanent.baseDP = dp;
  permanent.currentDP = dp;
  permanent.securityAttack = 1;
  permanent.securityAttackModifier = 0;
  permanent.keywords = new ArraySchema<string>();
  permanent.grantedKeywords = new ArraySchema<string>();
  permanent.originalColorsOverride = new ArraySchema<string>();
  permanent.manualStatuses = new ArraySchema<string>();
  permanent.manualMarker = "";
}
