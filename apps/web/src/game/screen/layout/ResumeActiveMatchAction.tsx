import { useState } from "react";
import { Alert, Button } from "@/design/primitives";
import { useTranslation } from "@/i18n/useTranslation";
import { claimActiveMatch, findActiveMatch } from "@/net/client";
import { saveReconnectSession } from "@/net/reconnectSession";

type ResumeActiveMatchActionParams = {
  onResume: () => void;
};

type ResumeState = "idle" | "claiming" | "failed";

export function ResumeActiveMatchAction({ onResume }: ResumeActiveMatchActionParams) {
  const { t } = useTranslation();
  const [state, setState] = useState<ResumeState>("idle");

  const resume = async () => {
    setState("claiming");
    const match = await findActiveMatch().catch(() => undefined);
    const session = match ? await claimActiveMatch(match).catch(() => undefined) : undefined;
    if (!session) {
      setState("failed");
      return;
    }
    saveReconnectSession(session);
    onResume();
  };

  if (state === "failed") {
    return <Alert tone="warning">{t("resumeMatch.failed")}</Alert>;
  }
  return (
    <Button full className="waiting-dialog__action" disabled={state === "claiming"} onClick={() => void resume()}>
      {t("resumeMatch.action")}
    </Button>
  );
}
