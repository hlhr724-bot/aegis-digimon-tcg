import type { CardInstance } from "#shared/schema/CardInstance";
import type { Permanent } from "#shared/schema/Permanent";
import type { ManualLocation } from "#shared/manual/ManualCommand";

type Params = { permanent: Permanent; part: ManualLocation["part"] };

export function getManualPermanentCards({ permanent, part }: Params): readonly CardInstance[] {
  if (part === "source") {
    return permanent.stack;
  }
  if (part === "link") {
    return permanent.linked;
  }
  return [permanent.topCard];
}
