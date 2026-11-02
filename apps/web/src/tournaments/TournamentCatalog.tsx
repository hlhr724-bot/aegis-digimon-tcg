import "@/tournaments/tournamentCategories.css";
import "@/tournaments/tournamentCatalog.css";
import { TournamentCategory } from "@aegis/shared/tournaments/TournamentCategory";
import { useCallback, useId, useState, type ReactNode } from "react";
import { PageHeader } from "@/design/PageHeader";
import { Alert, Button } from "@/design/primitives";
import { Icons } from "@/design/icons";
import type { Translate } from "@/i18n/translationTypes";
import { useTranslation } from "@/i18n/useTranslation";
import { deckFormatLabel } from "@/screens/deckFormatLabel";
import { tournamentApi, type ApiError } from "@/tournaments/client";
import { usePolledRequest } from "@/tournaments/hooks";
import { isTournamentClosed } from "@/tournaments/isTournamentClosed";
import { reasonKey } from "@/tournaments/labels";
import { serverNow } from "@/tournaments/serverClock";
import { TournamentAgendaCard } from "@/tournaments/TournamentAgendaCard";
import { TournamentAgendaItem } from "@/tournaments/TournamentAgendaItem";
import { TournamentCatalogFilter } from "@/tournaments/TournamentCatalogFilter";
import { TournamentCatalogSection } from "@/tournaments/TournamentCatalogSection";
import { TournamentCatalogTab } from "@/tournaments/TournamentCatalogTab";
import { TournamentCategoryHelp } from "@/tournaments/TournamentCategoryHelp";
import { TournamentFeaturedCard } from "@/tournaments/TournamentFeaturedCard";
import { TournamentNextAction } from "@/tournaments/TournamentNextAction";
import type { TournamentListing } from "@/tournaments/types";
import { CircuitCatalogSection } from "@/tournaments/circuits/CircuitCatalogSection";

type TournamentCatalogParams = {
  accountId: string | undefined;
  canCreateCircuit?: boolean;
  tab: TournamentCatalogTab;
  onTabChange: (tab: TournamentCatalogTab) => void;
  onOpen: (id: string) => void;
  onCreate: () => void;
  onOpenCircuit?: (id: string) => void;
  onCreateCircuit?: () => void;
};

const POLL_MS = 15000;
const AGENDA_COUNT = 4;
const ACTIVE_ENTRY_STATUSES: readonly string[] = ["registered", "checked_in", "active"];

export function TournamentCatalog({
  accountId,
  canCreateCircuit = false,
  tab: requestedTab,
  onTabChange,
  onOpen,
  onCreate,
  onOpenCircuit = () => undefined,
  onCreateCircuit = () => undefined,
}: TournamentCatalogParams) {
  const { t } = useTranslation();
  const [tournaments, setTournaments] = useState<TournamentListing[]>();
  const [error, setError] = useState<ApiError>();
  const load = useCallback((signal: AbortSignal) => tournamentApi.list(signal), []);
  const apply = useCallback((result: Awaited<ReturnType<typeof tournamentApi.list>>) => {
    if (result.ok) {
      setTournaments(result.value);
      setError(undefined);
    } else {
      setError(result.error);
    }
  }, []);
  const { refresh } = usePolledRequest(load, apply, POLL_MS);
  const now = serverNow();
  const tab =
    requestedTab === TournamentCatalogTab.MINE.value && !accountId ? TournamentCatalogTab.EXPLORE.value : requestedTab;
  const mine = accountId
    ? (tournaments ?? []).filter((event) => event.myEntry !== undefined || event.createdBy === accountId)
    : [];
  const activeMine = mine
    .filter((event) => !isTournamentClosed(event))
    .sort((first, second) => first.startsAt - second.startsAt);
  const next = accountId
    ? tournaments
        ?.filter(
          (event) =>
            !isTournamentClosed(event) && event.myEntry && ACTIVE_ENTRY_STATUSES.includes(event.myEntry.status),
        )
        .sort(
          (first, second) =>
            getActionPriority(first, now) - getActionPriority(second, now) || first.startsAt - second.startsAt,
        )[0]
    : undefined;
  const tabs = Object.values(TournamentCatalogTab)
    .filter((entry) => entry.value !== TournamentCatalogTab.MINE.value || accountId)
    .map((entry) => ({
      value: entry.value,
      label: t(entry.labelKey),
      badge: entry.value === TournamentCatalogTab.MINE.value && activeMine.length > 0 ? activeMine.length : undefined,
    }));
  const nextAction = next ? (
    <TournamentNextAction
      key={next.id}
      tournament={next}
      canCheckIn={canCheckIn(next, now)}
      onOpen={onOpen}
      onChanged={() => void refresh()}
    />
  ) : null;

  return (
    <main className="aegis-page tournaments-screen">
      <div className="aegis-page__wrap">
        <PageHeader
          title={t("tournaments.title")}
          tabs={tabs}
          activeTab={tab}
          onTabChange={onTabChange}
          actions={
            accountId ? (
              <Button size="sm" variant="secondary" icon={Icons.Plus} onClick={onCreate}>
                {t("tournaments.catalog.create")}
              </Button>
            ) : undefined
          }
        />
        <div className="aegis-page__body">
          {error ? (
            <Alert tone="danger" title={t("tournaments.error.load")}>
              {t(reasonKey(error.code) ?? "tournaments.reason.unknown", { code: error.code })}
            </Alert>
          ) : null}
          {tournaments === undefined && !error && tab !== TournamentCatalogTab.CIRCUITS.value ? (
            <p role="status">{t("common.loading")}</p>
          ) : null}
          {tab === TournamentCatalogTab.EXPLORE.value ? (
            <ExplorePanel
              tournaments={tournaments}
              agenda={activeMine.slice(0, AGENDA_COUNT)}
              signedIn={accountId !== undefined}
              nextAction={nextAction}
              onOpen={onOpen}
              onCreate={onCreate}
            />
          ) : null}
          {tab === TournamentCatalogTab.MINE.value && accountId ? (
            <MinePanel
              tournaments={mine}
              accountId={accountId}
              loaded={tournaments !== undefined}
              nextAction={nextAction}
              onOpen={onOpen}
              onCreate={onCreate}
            />
          ) : null}
          {tab === TournamentCatalogTab.CIRCUITS.value ? (
            <CircuitCatalogSection canCreate={canCreateCircuit} onOpen={onOpenCircuit} onCreate={onCreateCircuit} />
          ) : null}
        </div>
      </div>
    </main>
  );
}

type ExplorePanelParams = {
  tournaments: TournamentListing[] | undefined;
  agenda: readonly TournamentListing[];
  signedIn: boolean;
  nextAction: ReactNode;
  onOpen: (id: string) => void;
  onCreate: () => void;
};

function ExplorePanel({ tournaments, agenda, signedIn, nextAction, onOpen, onCreate }: ExplorePanelParams) {
  const { t } = useTranslation();
  const id = useId();
  const [filter, setFilter] = useState<TournamentCatalogFilter>(TournamentCatalogFilter.UPCOMING.value);
  const [query, setQuery] = useState("");
  const [format, setFormat] = useState("");
  const statuses: readonly string[] =
    Object.values(TournamentCatalogFilter).find((entry) => entry.value === filter)?.statuses ?? [];
  const formats = [...new Set(tournaments?.map((event) => event.format ?? "standard"))];
  const search = normalizeSearch(query);
  const filtered = tournaments?.filter(
    (event) =>
      statuses.includes(event.status) &&
      (!format || (event.format ?? "standard") === format) &&
      normalizeSearch(`${event.name} ${event.description ?? ""}`).includes(search),
  );
  const featured =
    filter === TournamentCatalogFilter.FINISHED.value ? undefined : getFeaturedTournament(tournaments ?? []);
  const showRail = signedIn;

  return (
    <div className="tournaments-split" data-rail={showRail || undefined}>
      <div className="tournaments-stack">
        {nextAction}
        {featured ? <TournamentFeaturedCard tournament={featured} onOpen={onOpen} /> : null}
        <section className="tournaments-card" aria-labelledby={`${id}-all`}>
          <header className="tournaments-card__header">
            <h2 className="tournaments-card__title" id={`${id}-all`}>
              {t("tournaments.catalog.title")}
            </h2>
            <span className="tournaments-card__meta">
              <Icons.Clock size={13} aria-hidden="true" />
              {t("tournaments.catalog.localTime")}
            </span>
          </header>
          <div className="tournaments-card__content">
            <div className="tournaments-toolbar">
              <label className="tournaments-field" htmlFor={`${id}-search`}>
                <Icons.Search size={15} aria-hidden="true" />
                <span className="aegis-sr-only">{t("tournaments.catalog.search")}</span>
                <input
                  id={`${id}-search`}
                  type="search"
                  value={query}
                  autoComplete="off"
                  placeholder={t("tournaments.catalog.search")}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <label className="tournaments-select" htmlFor={`${id}-format`}>
                <span className="aegis-sr-only">{t("tournaments.catalog.filterFormat")}</span>
                <select id={`${id}-format`} value={format} onChange={(event) => setFormat(event.target.value)}>
                  <option value="">{t("tournaments.catalog.allFormats")}</option>
                  {formats.map((value) => (
                    <option key={value} value={value}>
                      {deckFormatLabel(value, t)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="tournaments-chips" role="group" aria-label={t("tournaments.catalog.views")}>
              {Object.values(TournamentCatalogFilter).map((entry) => (
                <button
                  key={entry.value}
                  type="button"
                  className="tournaments-chip"
                  aria-pressed={filter === entry.value}
                  onClick={() => setFilter(entry.value)}
                >
                  {t(entry.labelKey)}
                </button>
              ))}
            </div>
            {filtered?.length === 0 ? (
              <CatalogEmpty
                title={t(tournaments?.length ? "tournaments.catalog.noResultsTitle" : "tournaments.catalog.emptyTitle")}
                copy={getEmptyCopy({ hasEvents: Boolean(tournaments?.length), signedIn, t })}
              />
            ) : null}
            <CategorySections tournaments={filtered ?? []} onOpen={onOpen} />
          </div>
        </section>
      </div>
      {showRail ? (
        <aside className="tournaments-stack tournaments-rail">
          {agenda.length > 0 ? <TournamentAgendaCard tournaments={agenda} onOpen={onOpen} /> : null}
          <section className="tournaments-card tournaments-host">
            <span className="tournaments-host__icon" aria-hidden="true">
              <Icons.Flag size={18} />
            </span>
            <h3>{t("tournaments.catalog.hostTitle")}</h3>
            <p>{t("tournaments.catalog.hostCopy")}</p>
            <Button icon={Icons.Plus} onClick={onCreate}>
              {t("tournaments.create.title")}
            </Button>
          </section>
        </aside>
      ) : null}
    </div>
  );
}

type MinePanelParams = {
  tournaments: readonly TournamentListing[];
  accountId: string;
  loaded: boolean;
  nextAction: ReactNode;
  onOpen: (id: string) => void;
  onCreate: () => void;
};

function MinePanel({ tournaments, accountId, loaded, nextAction, onOpen, onCreate }: MinePanelParams) {
  const { t } = useTranslation();
  const byStart = (first: TournamentListing, second: TournamentListing) => first.startsAt - second.startsAt;
  const entries = tournaments.filter((event) => !isTournamentClosed(event) && event.myEntry).sort(byStart);
  const organized = tournaments
    .filter((event) => !isTournamentClosed(event) && !event.myEntry && event.createdBy === accountId)
    .sort(byStart);
  const past = tournaments.filter(isTournamentClosed).sort((first, second) => second.startsAt - first.startsAt);

  return (
    <div className="tournaments-stack">
      {nextAction}
      {loaded && tournaments.length === 0 ? (
        <CatalogEmpty title={t("tournaments.catalog.emptyTitle")} copy={t("tournaments.catalog.mineEmpty")} />
      ) : null}
      {entries.length > 0 ? (
        <MineList title={t("tournaments.catalog.mineEntries")} tournaments={entries} onOpen={onOpen} />
      ) : null}
      {organized.length > 0 ? (
        <MineList
          title={t("tournaments.catalog.mineOrganized")}
          tournaments={organized}
          onOpen={onOpen}
          action={
            <Button size="sm" variant="secondary" icon={Icons.Plus} onClick={onCreate}>
              {t("tournaments.create.title")}
            </Button>
          }
        />
      ) : null}
      {past.length > 0 ? (
        <MineList title={t("tournaments.catalog.finished")} tournaments={past} onOpen={onOpen} />
      ) : null}
    </div>
  );
}

type MineListParams = {
  title: string;
  tournaments: readonly TournamentListing[];
  action?: ReactNode;
  onOpen: (id: string) => void;
};

function MineList({ title, tournaments, action, onOpen }: MineListParams) {
  const id = useId();
  return (
    <section className="tournaments-card" aria-labelledby={id}>
      <header className="tournaments-card__header">
        <h2 className="tournaments-card__title" id={id}>
          {title}
          <span className="tournaments-count">{tournaments.length}</span>
        </h2>
        {action}
      </header>
      <ul className="tournaments-card__content tournaments-rows">
        {tournaments.map((event) => (
          <TournamentAgendaItem key={event.id} tournament={event} onOpen={onOpen} />
        ))}
      </ul>
    </section>
  );
}

type CategorySectionsParams = {
  tournaments: readonly TournamentListing[];
  onOpen: (id: string) => void;
};

function CategorySections({ tournaments, onOpen }: CategorySectionsParams) {
  const { t } = useTranslation();
  const id = useId();
  const sections = Object.values(TournamentCatalogSection)
    .map((section) => ({
      section,
      events: tournaments.filter((event) => (event.category ?? TournamentCategory.COMMUNITY.value) === section.value),
    }))
    .filter(({ events }) => events.length > 0);
  return (
    <>
      {sections.map(({ section, events }) => (
        <section
          key={section.value}
          className="tournaments-category-section"
          aria-labelledby={`${id}-${section.value}-heading`}
        >
          <header className="tournaments-category-section__header">
            <h3 id={`${id}-${section.value}-heading`}>{t(section.headingKey)}</h3>
            <span className="tournaments-category-section__count">
              <span aria-hidden="true">{events.length}</span>
              <span className="aegis-sr-only">{t("tournaments.catalog.section.count", { count: events.length })}</span>
            </span>
            <TournamentCategoryHelp category={section.value} />
          </header>
          <ul className="tournaments-rows">
            {events.map((event) => (
              <TournamentAgendaItem key={event.id} tournament={event} onOpen={onOpen} />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function CatalogEmpty({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="tournaments-empty">
      <span className="tournaments-empty__icon">
        <Icons.Calendar size={22} aria-hidden="true" />
      </span>
      <strong className="tournaments-empty__title">{title}</strong>
      <p className="tournaments-empty__copy">{copy}</p>
    </div>
  );
}

type EmptyCopyParams = { hasEvents: boolean; signedIn: boolean; t: Translate };

function getEmptyCopy({ hasEvents, signedIn, t }: EmptyCopyParams): string {
  if (hasEvents) {
    return t("tournaments.catalog.noResults");
  }
  if (signedIn) {
    return t("tournaments.catalog.empty");
  }
  return t("tournaments.catalog.emptyReadOnly");
}

const FEATURED_MINIMUM_EVENTS = 2;

function getFeaturedTournament(tournaments: readonly TournamentListing[]): TournamentListing | undefined {
  const active = tournaments.filter(
    (event) => event.status === "registration" || event.status === "check_in" || event.status === "running",
  );
  if (active.length < FEATURED_MINIMUM_EVENTS) {
    return undefined;
  }
  return active
    .filter((event) => !event.myEntry)
    .sort(
      (first, second) =>
        getFeaturedRank(first) - getFeaturedRank(second) ||
        second.registeredCount - first.registeredCount ||
        first.startsAt - second.startsAt,
    )[0];
}

function getFeaturedRank(event: TournamentListing): number {
  const official = event.category === TournamentCategory.OFFICIAL.value ? 0 : 2;
  const open = event.status === "registration" ? 0 : 1;
  return official + open;
}

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function canCheckIn(event: TournamentListing, now: number): boolean {
  const entry = event.myEntry;
  return (
    entry?.status === "registered" &&
    (event.status === "registration" || event.status === "check_in") &&
    (entry.checkInOpensAt === null || now >= entry.checkInOpensAt) &&
    (entry.checkInClosesAt === null || now <= entry.checkInClosesAt)
  );
}

function getActionPriority(event: TournamentListing, now: number): number {
  if (canCheckIn(event, now)) {
    return 0;
  }
  if (event.myEntry?.status === "active") {
    return 1;
  }
  if (event.myEntry?.status === "checked_in") {
    return 2;
  }
  return 3;
}
