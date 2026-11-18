import type { ReactNode } from "react";
import { en } from "../../../i18n/en";
import { KeywordSavePrompt } from "./KeywordSavePrompt";

type BarrierOverlayParams = {
  permanentId?: string;
  affected?: ReactNode;
  onAccept: () => void;
  onDecline: () => void;
};

export function BarrierOverlay({ permanentId, affected, onAccept, onDecline }: BarrierOverlayParams) {
  return (
    <KeywordSavePrompt
      keyword="＜Barrier＞"
      rulesText={en["overlay.barrierRules"]}
      permanentId={permanentId}
      affected={affected}
      onAccept={onAccept}
      onDecline={onDecline}
    />
  );
}
