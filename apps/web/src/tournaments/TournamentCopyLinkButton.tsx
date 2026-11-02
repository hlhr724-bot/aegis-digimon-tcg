import { useEffect, useState } from "react";
import { Button } from "@/design/primitives";
import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";
import { pathForRoute } from "@/routes";

type TournamentCopyLinkButtonParams = { tournamentId: string };

const COPIED_RESET_MS = 2_000;

export function TournamentCopyLinkButton({ tournamentId }: TournamentCopyLinkButtonParams) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return undefined;
    }
    const timer = window.setTimeout(() => setCopied(false), COPIED_RESET_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  if (typeof navigator === "undefined" || !navigator.clipboard) {
    return null;
  }

  async function copyLink() {
    const path = pathForRoute({ screen: "tournaments", tournament: { kind: "detail", id: tournamentId } });
    await navigator.clipboard.writeText(new URL(path, window.location.origin).toString());
    setCopied(true);
  }

  return (
    <Button variant="secondary" size="sm" icon={copied ? Icons.Check : Icons.Copy} onClick={() => void copyLink()}>
      <span aria-live="polite">{t(copied ? "tournaments.detail.linkCopied" : "tournaments.detail.copyLink")}</span>
    </Button>
  );
}
