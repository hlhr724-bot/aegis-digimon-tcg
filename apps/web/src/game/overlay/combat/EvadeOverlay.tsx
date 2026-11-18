import type { ReactNode } from "react";
import { en } from "../../../i18n/en";
import { KeywordSavePrompt } from "./KeywordSavePrompt";

type EvadeOverlayParams = {
  permanentId?: string;
  affected?: ReactNode;
  onAccept: () => void;
  onDecline: () => void;
};

export function EvadeOverlay({ permanentId, affected, onAccept, onDecline }: EvadeOverlayParams) {
  return (
    <KeywordSavePrompt
      keyword="＜Evade＞"
      rulesText={en["overlay.evadeRules"]}
      permanentId={permanentId}
      affected={affected}
      onAccept={onAccept}
      onDecline={onDecline}
    />
  );
}
