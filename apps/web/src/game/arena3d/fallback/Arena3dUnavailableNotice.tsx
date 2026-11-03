import { useEffect, useState } from "react";
import { Arena3dFallbackReason } from "@/game/arena3d/fallback/Arena3dFallbackReason";
import { Arena3dNotice } from "@/game/arena3d/fallback/Arena3dNotice";
import { reportArena3dFallback } from "@/game/arena3d/fallback/reportArena3dFallback";
import { BoardStyle } from "@/game/arena3d/boardStyle/BoardStyle";
import { boardStylePreference } from "@/game/arena3d/boardStyle/boardStylePreference";
import { isWebGlAvailable } from "@/game/arena3d/isWebGlAvailable";
import { useTranslation } from "@/i18n/useTranslation";

let dismissedThisPage = false;

export function Arena3dUnavailableNotice() {
  const { t } = useTranslation();
  const preference = boardStylePreference.useStyle();
  const [webGlAvailable] = useState(isWebGlAvailable);
  const [dismissed, setDismissed] = useState(dismissedThisPage);
  const blocked = preference === BoardStyle.ARENA_3D.value && !webGlAvailable;

  useEffect(() => {
    if (blocked) {
      reportArena3dFallback(Arena3dFallbackReason.WEBGL_UNAVAILABLE.value);
    }
  }, [blocked]);

  if (!blocked || dismissed) {
    return null;
  }
  return (
    <Arena3dNotice
      message={t("redesign.foundation.boardStyle.unavailableInMatch")}
      onDismiss={() => {
        dismissedThisPage = true;
        setDismissed(true);
      }}
    />
  );
}
