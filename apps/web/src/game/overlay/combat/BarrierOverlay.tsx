import { en } from "../../../i18n/en";
import { KeywordSavePrompt } from "./KeywordSavePrompt";

type BarrierOverlayParams = {
  permanentId?: string;
  onAccept: () => void;
  onDecline: () => void;
};

export function BarrierOverlay({ permanentId, onAccept, onDecline }: BarrierOverlayParams) {
  return (
    <KeywordSavePrompt
      keyword="＜Barrier＞"
      rulesText={en["overlay.barrierRules"]}
      permanentId={permanentId}
      onAccept={onAccept}
      onDecline={onDecline}
    />
  );
}
