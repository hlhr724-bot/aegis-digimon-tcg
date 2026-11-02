import { hasAccountCapability } from "@aegis/shared/account/hasAccountCapability";
import type { TournamentGameTicket } from "@aegis/shared/tournaments/TournamentGameTicket";
import { useEffect, useState } from "react";
import { accountApi } from "@/account/client";
import { Alert } from "@/design/primitives";
import type { DeckListing } from "@/game/decks";
import { useTranslation } from "@/i18n/useTranslation";
import type { TournamentRoute } from "@/routes";
import { CreateTournamentForm } from "@/tournaments/CreateTournamentForm";
import { TournamentCatalog } from "@/tournaments/TournamentCatalog";
import { TournamentCatalogTab } from "@/tournaments/TournamentCatalogTab";
import { TournamentCrumb } from "@/tournaments/TournamentCrumb";
import { TournamentDetail } from "@/tournaments/TournamentDetail";
import type { TournamentSpectateTarget } from "@/tournaments/TournamentSpectateTarget";
import { CircuitDetail } from "@/tournaments/circuits/CircuitDetail";
import { CreateCircuitForm } from "@/tournaments/circuits/CreateCircuitForm";
import "@/tournaments/tournaments.css";

type TournamentsScreenParams = {
  decks: readonly DeckListing[];
  onDecks?: () => void;
  onJoinGame?: (ticket: TournamentGameTicket) => void;
  onWatchMatch?: (target: TournamentSpectateTarget) => void;
  view?: TournamentRoute;
  onViewChange?: (view: TournamentRoute) => void;
};

type TournamentAccount = {
  id: string;
  displayName: string;
  isAdmin: boolean;
  canCreateOfficial: boolean;
};

export function TournamentsScreen({
  decks,
  view,
  onViewChange,
  onJoinGame,
  onWatchMatch,
  onDecks = () => undefined,
}: TournamentsScreenParams) {
  const { t } = useTranslation();
  const [localView, setLocalView] = useState<TournamentRoute>({ kind: "catalog" });
  const [catalogTab, setCatalogTab] = useState<TournamentCatalogTab>(TournamentCatalogTab.EXPLORE.value);
  const [account, setAccount] = useState<TournamentAccount | null>();
  const activeView = view ?? localView;
  const setView = onViewChange ?? setLocalView;
  const canCreateCircuit = account?.isAdmin === true || account?.canCreateOfficial === true;

  useEffect(() => {
    let cancelled = false;
    void accountApi
      .me()
      .then((value) => {
        if (!cancelled) {
          setAccount(
            value && {
              id: value.id,
              displayName: value.displayName,
              isAdmin: value.isAdmin,
              canCreateOfficial: hasAccountCapability({
                roles: value.roles,
                capability: "canOrganizeOfficialTournaments",
              }),
            },
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAccount(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (activeView.kind === "catalog") {
    return (
      <TournamentCatalog
        accountId={account?.id}
        canCreateCircuit={canCreateCircuit}
        tab={catalogTab}
        onTabChange={setCatalogTab}
        onOpen={(id) => setView({ kind: "detail", id })}
        onCreate={() => setView({ kind: "create" })}
        onOpenCircuit={(id) => setView({ kind: "circuit", id })}
        onCreateCircuit={() => setView({ kind: "createCircuit" })}
      />
    );
  }

  const backToCatalog = () => setView({ kind: "catalog" });

  return (
    <main className="aegis-page tournaments-screen">
      <div className="aegis-page__wrap tournaments-flow">
        {activeView.kind === "create" && account ? (
          <CreateTournamentForm
            canCreateOfficial={account.canCreateOfficial}
            onCreated={(tournament) => setView({ kind: "detail", id: tournament.id })}
            onCancel={backToCatalog}
          />
        ) : null}

        {activeView.kind === "create" && account === null ? (
          <>
            <TournamentCrumb onBack={backToCatalog} />
            <Alert tone="warning" title={t("account.signInTitle")}>
              {t("tournaments.detail.signInRequired")}
            </Alert>
          </>
        ) : null}

        {activeView.kind === "createCircuit" && account && canCreateCircuit ? (
          <CreateCircuitForm
            onCreated={(circuit) => setView({ kind: "circuit", id: circuit.id })}
            onCancel={() => {
              setCatalogTab(TournamentCatalogTab.CIRCUITS.value);
              backToCatalog();
            }}
          />
        ) : null}

        {activeView.kind === "createCircuit" && account && !canCreateCircuit ? (
          <Alert tone="warning" title={t("tournaments.circuits.organizerOnlyTitle")}>
            {t("tournaments.circuits.organizerOnly")}
          </Alert>
        ) : null}

        {activeView.kind === "createCircuit" && account === null ? (
          <Alert tone="warning" title={t("account.signInTitle")}>
            {t("tournaments.detail.signInRequired")}
          </Alert>
        ) : null}

        {activeView.kind === "circuit" ? (
          <CircuitDetail
            id={activeView.id}
            accountIsAdmin={account?.isAdmin === true}
            onBack={() => {
              setCatalogTab(TournamentCatalogTab.CIRCUITS.value);
              backToCatalog();
            }}
            onOpenTournament={(id) => setView({ kind: "detail", id })}
          />
        ) : null}

        {activeView.kind === "detail" ? (
          <TournamentDetail
            id={activeView.id}
            onDecks={onDecks}
            onJoinGame={onJoinGame}
            onWatchMatch={onWatchMatch}
            accountId={account?.id}
            accountDisplayName={account?.displayName}
            accountIsAdmin={account?.isAdmin === true}
            decks={decks}
            tab={activeView.tab}
            onTabChange={(tab) => setView({ kind: "detail", id: activeView.id, tab })}
            onBack={backToCatalog}
            onMyTournaments={() => {
              setCatalogTab(TournamentCatalogTab.MINE.value);
              backToCatalog();
            }}
          />
        ) : null}
      </div>
    </main>
  );
}
