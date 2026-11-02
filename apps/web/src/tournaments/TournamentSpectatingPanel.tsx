import { Panel } from "@/design/primitives";
import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";
import type { TranslationKey } from "@/i18n/translationTypes";
import { TournamentSpectatorPolicy } from "@aegis/shared/tournaments/TournamentSpectatorPolicy";
import type { TournamentDetail } from "@/tournaments/types";
import "./tournamentSpectators.css";

type Props = {
  detail: Pick<TournamentDetail, "spectatorPolicy" | "canSpectate">;
  isActiveParticipant: boolean;
};

export function TournamentSpectatingPanel({ detail, isActiveParticipant }: Props) {
  const { t } = useTranslation();
  const policy = detail.spectatorPolicy ?? TournamentSpectatorPolicy.NOBODY.value;
  if (policy === TournamentSpectatorPolicy.NOBODY.value && !detail.canSpectate) {
    return null;
  }
  return (
    <Panel className="tournaments-spectating">
      <h3>{t("tournaments.spectators.title")}</h3>
      <div className="tournaments-spectating__body">
        <Icons.Eye size={20} aria-hidden="true" />
        <div>
          <p className="tournaments-spectating__status">
            {t(getStatusKey({ policy, canSpectate: detail.canSpectate, isActiveParticipant }))}
          </p>
          <p className="tournaments-note">{t("tournaments.spectators.publicOnly")}</p>
        </div>
      </div>
    </Panel>
  );
}

type StatusParams = {
  policy: TournamentSpectatorPolicy;
  canSpectate: boolean | undefined;
  isActiveParticipant: boolean;
};

function getStatusKey({ policy, canSpectate, isActiveParticipant }: StatusParams): TranslationKey {
  if (isActiveParticipant) {
    return "tournaments.spectators.playersCannotWatch";
  }
  if (canSpectate) {
    return "tournaments.spectators.youCanWatch";
  }
  if (policy === TournamentSpectatorPolicy.SIGNED_IN.value) {
    return "tournaments.spectators.signedInAllowed";
  }
  return "tournaments.spectators.listOnly";
}
