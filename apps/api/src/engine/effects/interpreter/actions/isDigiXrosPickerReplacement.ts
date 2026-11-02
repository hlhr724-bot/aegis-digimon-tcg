import { digiXrosZoneExpanderFor } from "@aegis/shared/cards/zoneExpanders";
import type { Action } from "@aegis/shared/effects/ir/actions/action";

type Params = {
  cardId: string;
  action: Action;
};

export function isDigiXrosPickerReplacement({ cardId, action }: Params): boolean {
  return (
    action.kind === "Replacement" &&
    action.event === "wouldBePlayed" &&
    digiXrosZoneExpanderFor(cardId) !== undefined &&
    action.actions?.some((nested) => nested.kind === "PlaceUnder" && nested.asDigiXrosMaterial === true) === true
  );
}
