import { en } from "../../../i18n/en";
import { KeywordSavePrompt } from "./KeywordSavePrompt";

type EvadeOverlayParams = {
  permanentId?: string;
  onAccept: () => void;
  onDecline: () => void;
};

export function EvadeOverlay({ permanentId, onAccept, onDecline }: EvadeOverlayParams) {
  return (
    <KeywordSavePrompt
      keyword="＜Evade＞"
      rulesText={en["overlay.evadeRules"]}
      permanentId={permanentId}
      onAccept={onAccept}
      onDecline={onDecline}
    />
  );
}
