import { Alert } from "@/design/primitives";
import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";
import { useTranslation } from "@/i18n/useTranslation";
import type { ApiError } from "@/tournaments/client";
import { describeTournamentError } from "@/tournaments/describeTournamentError";
import { violationMessage } from "@/tournaments/labels";

type TournamentActionErrorParams = { error: ApiError };

export function TournamentActionError({ error }: TournamentActionErrorParams) {
  const { t } = useTranslation();
  const getCardName = useTranslatedCardName();
  return (
    <Alert tone="danger" title={t("tournaments.error.action")}>
      {describeTournamentError({ error, t })}
      {error.violations?.length ? (
        <ul>
          {error.violations.map((violation, index) => {
            const message = violationMessage(violation, getCardName);
            return <li key={index}>{t(message.key, message.params)}</li>;
          })}
        </ul>
      ) : null}
    </Alert>
  );
}
