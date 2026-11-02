import { TournamentRoundStartMode } from "@aegis/shared/tournaments/TournamentRoundStartMode";
import { TournamentCategory } from "@aegis/shared/tournaments/TournamentCategory";
import type { DeckFormat } from "@aegis/shared/deckFormat";
import { DeckFormatSelector } from "@/screens/DeckFormatSelector";
import type { TournamentClockSettings } from "@aegis/shared/tournaments/TournamentClockSettings";
import { TournamentClockFields } from "@/tournaments/TournamentClockFields";
import { useId, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  swissRoundCount,
  topCutSize,
  type BanlistPolicy,
  type CreateTournamentInput,
  type TournamentStructure,
} from "@aegis/shared";
import { Alert, Badge, Button, Field, Switch } from "@/design/primitives";
import { Icons } from "@/design/icons";
import type { Translate, TranslationKey } from "@/i18n/translationTypes";
import { useTranslation } from "@/i18n/useTranslation";
import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";
import { banlistSetOptions, previewBanlist } from "@/tournaments/banlistPreview";
import { tournamentApi, type ApiError } from "@/tournaments/client";
import { useServerClock } from "@/tournaments/hooks";
import { reasonKey, restrictionKey, structureKey } from "@/tournaments/labels";
import { isServerClockSynced, serverNow } from "@/tournaments/serverClock";
import { TournamentCrumb } from "@/tournaments/TournamentCrumb";
import { TournamentEventPreview } from "@/tournaments/TournamentEventPreview";
import { TournamentPlayerCountField } from "@/tournaments/TournamentPlayerCountField";
import type { TournamentDetail, TournamentValidationError } from "@/tournaments/types";
import "@/tournaments/createTournamentForm.css";

type BanlistMode = BanlistPolicy["mode"];

type CreateTournamentFormParams = {
  onCreated: (tournament: TournamentDetail) => void;
  onCancel: () => void;
  canCreateOfficial?: boolean;
};

const DEFAULT_LEAD_MS = 60 * 60_000;

const FORM_SECTIONS = [
  { key: "basics", titleKey: "tournaments.create.section.basics", hintKey: "tournaments.create.sectionHint.basics" },
  {
    key: "schedule",
    titleKey: "tournaments.create.section.schedule",
    hintKey: "tournaments.create.sectionHint.schedule",
  },
  { key: "format", titleKey: "tournaments.create.section.format", hintKey: "tournaments.create.sectionHint.format" },
  { key: "bots", titleKey: "tournaments.create.section.bots", hintKey: "tournaments.create.sectionHint.bots" },
  { key: "admin", titleKey: "tournaments.create.section.admin", hintKey: "tournaments.create.sectionHint.admin" },
] as const satisfies readonly { key: string; titleKey: TranslationKey; hintKey: TranslationKey }[];

type FormSectionKey = (typeof FORM_SECTIONS)[number]["key"];

const STRUCTURE_OPTIONS = [
  { value: "swiss", hintKey: "tournaments.create.structureHint.swiss", icon: Icons.LayoutGrid },
  { value: "single_elimination", hintKey: "tournaments.create.structureHint.singleElimination", icon: Icons.Trophy },
] as const satisfies readonly { value: TournamentStructure; hintKey: TranslationKey; icon: unknown }[];

function formNow(): number {
  return isServerClockSynced() ? serverNow() : Date.now();
}

function defaultStartsAt(): string {
  return toLocalInputValue(formNow() + DEFAULT_LEAD_MS);
}

function toLocalInputValue(epochMs: number): string {
  const local = new Date(epochMs - new Date(epochMs).getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function CreateTournamentForm({ onCreated, onCancel, canCreateOfficial = false }: CreateTournamentFormParams) {
  const { t } = useTranslation();
  const formId = useId();
  const [official, setOfficial] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [format, setFormat] = useState<DeckFormat>("standard");
  const [password, setPassword] = useState("");
  const [clocks, setClocks] = useState<TournamentClockSettings>();
  const [startsAt, setStartsAt] = useState(defaultStartsAt);
  const [maxPlayers, setMaxPlayers] = useState(16);
  const [structure, setStructure] = useState<TournamentStructure>("single_elimination");
  const [roundStartMode, setRoundStartMode] = useState<TournamentRoundStartMode>(
    TournamentRoundStartMode.AUTOMATIC.value,
  );
  const [bestOf, setBestOf] = useState<1 | 3>(1);
  const [topCut, setTopCut] = useState(false);
  const [allowBots, setAllowBots] = useState(false);
  const [randomBotStyles, setRandomBotStyles] = useState(false);
  const [banlistMode, setBanlistMode] = useState<BanlistMode>("none");
  const [banlistSetId, setBanlistSetId] = useState(() => banlistSetOptions()[0] ?? "BT10");
  const [errors, setErrors] = useState<TournamentValidationError[]>([]);
  const [failure, setFailure] = useState<ApiError>();
  const [submitting, setSubmitting] = useState(false);

  const isOfficial = canCreateOfficial && official;
  const showTopCut = structure === "swiss";
  const startsAtMs = new Date(startsAt).getTime();
  const banlist = useMemo<BanlistPolicy>(
    () => (banlistMode === "as_of_set" ? { mode: "as_of_set", setId: banlistSetId } : { mode: banlistMode }),
    [banlistMode, banlistSetId],
  );
  const { offsetSeconds } = useServerClock();
  const preview = useMemo(() => previewBanlist(banlist, formNow()), [banlist, offsetSeconds]);
  const checklist = [
    { key: "name", labelKey: "tournaments.create.name", done: name.trim().length > 0 },
    {
      key: "date",
      labelKey: "tournaments.create.startsAt",
      done: Number.isFinite(startsAtMs) && startsAtMs > formNow(),
    },
    { key: "format", labelKey: "tournaments.create.section.format", done: true },
  ] as const;

  const selectStructure = (next: TournamentStructure) => {
    setStructure(next);
    if (next !== "swiss") {
      setTopCut(false);
    }
  };

  const errorFor = (field: string) =>
    messageFor(
      errors.find((error) => error.field === field),
      t,
    );
  const sectionId = (key: FormSectionKey) => `${formId}-${key}`;

  function scrollToSection(key: FormSectionKey) {
    document.getElementById(sectionId(key))?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setErrors([]);
    setFailure(undefined);
    const input: CreateTournamentInput = {
      name: name.trim(),
      category: isOfficial ? TournamentCategory.OFFICIAL.value : TournamentCategory.COMMUNITY.value,
      description: description.trim(),
      password,
      format,
      clocks,
      structure,
      roundStartMode,
      topCut,
      bestOf,
      startsAt: startsAtMs,
      maxPlayers,
      allowBots,
      randomBotStyles: allowBots && randomBotStyles,
      banlist,
    };
    const result = await tournamentApi.create(input);
    setSubmitting(false);
    if (result.ok) {
      onCreated(result.value);
      return;
    }
    setErrors(result.error.reasons ?? []);
    if (!result.error.reasons?.length) {
      setFailure(result.error);
    }
  }

  return (
    <form className="create-tournament" onSubmit={(event) => void submit(event)} noValidate>
      <header className="create-tournament__head">
        <TournamentCrumb onBack={onCancel} />
        <h1>{t("tournaments.create.title")}</h1>
      </header>

      <div className="create-tournament__layout">
        <nav className="create-tournament__nav" aria-label={t("tournaments.create.sections")}>
          {FORM_SECTIONS.map((section, index) => (
            <button key={section.key} type="button" onClick={() => scrollToSection(section.key)}>
              <span className="create-tournament__nav-step" aria-hidden="true">
                {index + 1}
              </span>
              {t(section.titleKey)}
            </button>
          ))}
        </nav>

        <div className="create-tournament__sections">
          <CreateFormSection id={sectionId("basics")} step={1} section={FORM_SECTIONS[0]}>
            <Field
              className="create-tournament__wide"
              label={t("tournaments.create.name")}
              value={name}
              autoComplete="off"
              onChange={(event) => setName(event.target.value)}
              error={errorFor("name")}
            />
            <div className="aegis-field create-tournament__wide">
              <label className="aegis-field__label" htmlFor={`${formId}-description`}>
                {t("tournaments.create.description")}
              </label>
              <textarea
                id={`${formId}-description`}
                className="aegis-field__control"
                value={description}
                maxLength={1000}
                rows={3}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <div className="create-tournament__wide create-tournament__category">
              <span className="create-tournament__label">{t("tournaments.create.category")}</span>
              {canCreateOfficial ? (
                <Switch
                  checked={official}
                  onChange={setOfficial}
                  label={t("tournaments.category.official")}
                  description={t("tournaments.category.help")}
                />
              ) : (
                <p className="create-tournament__callout">
                  <Icons.Users size={16} aria-hidden="true" />
                  {t("tournaments.category.communityHelp")}
                </p>
              )}
            </div>
          </CreateFormSection>

          <CreateFormSection id={sectionId("schedule")} step={2} section={FORM_SECTIONS[1]}>
            <Field
              label={t("tournaments.create.startsAt")}
              type="datetime-local"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
              error={errorFor("startsAt")}
            />
            <TournamentPlayerCountField value={maxPlayers} onChange={setMaxPlayers} error={errorFor("maxPlayers")} />
          </CreateFormSection>

          <CreateFormSection id={sectionId("format")} step={3} section={FORM_SECTIONS[2]}>
            <div className="create-tournament__wide create-tournament__group">
              <span className="create-tournament__label" id={`${formId}-structure`}>
                {t("tournaments.create.structure")}
              </span>
              <div className="create-tournament__options" role="radiogroup" aria-labelledby={`${formId}-structure`}>
                {STRUCTURE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={structure === option.value}
                    className="create-tournament__option"
                    onClick={() => selectStructure(option.value)}
                  >
                    <span className="create-tournament__option-icon" aria-hidden="true">
                      <option.icon size={18} />
                    </span>
                    <b>{t(structureKey(option.value))}</b>
                    <small>{t(option.hintKey)}</small>
                  </button>
                ))}
              </div>
              <FieldError message={errorFor("structure")} />
            </div>

            <div className="create-tournament__group">
              <span className="create-tournament__label" id={`${formId}-best-of`}>
                {t("tournaments.create.bestOf")}
              </span>
              <div className="create-tournament__segmented" role="group" aria-labelledby={`${formId}-best-of`}>
                {([1, 3] as const).map((option) => (
                  <button key={option} type="button" aria-pressed={bestOf === option} onClick={() => setBestOf(option)}>
                    {t("tournaments.bestOf", { count: option })}
                  </button>
                ))}
              </div>
              <FieldError message={errorFor("bestOf")} />
            </div>

            <div className="create-tournament__group">
              <span className="create-tournament__label" id={`${formId}-round-mode`}>
                {t("tournaments.controls.mode")}
              </span>
              <div className="create-tournament__segmented" role="group" aria-labelledby={`${formId}-round-mode`}>
                {Object.values(TournamentRoundStartMode).map((entry) => (
                  <button
                    key={entry.name}
                    type="button"
                    aria-pressed={roundStartMode === entry.value}
                    onClick={() => setRoundStartMode(entry.value)}
                  >
                    {t(`tournaments.controls.${entry.value}`)}
                  </button>
                ))}
              </div>
            </div>
            <p className="create-tournament__hint create-tournament__wide">
              {t(
                roundStartMode === TournamentRoundStartMode.MANUAL.value
                  ? "tournaments.controls.manualHelp"
                  : "tournaments.controls.automaticHelp",
              )}
            </p>

            {showTopCut ? (
              <div className="create-tournament__toggle create-tournament__wide">
                <Switch
                  checked={topCut}
                  onChange={setTopCut}
                  label={t("tournaments.create.topCut")}
                  description={t("tournaments.create.topCutDesc")}
                />
                <FieldError message={errorFor("topCut")} />
              </div>
            ) : null}

            <div className="create-tournament__wide">
              <DeckFormatSelector value={format} onChange={setFormat} showBanlist={false} />
            </div>

            <div className="aegis-field">
              <label className="aegis-field__label" htmlFor={`${formId}-banlist`}>
                {t("tournaments.create.banlist")}
              </label>
              <select
                id={`${formId}-banlist`}
                className="aegis-field__control"
                value={banlistMode}
                onChange={(event) => setBanlistMode(event.target.value as BanlistMode)}
              >
                <option value="none">{t("tournaments.banlist.none")}</option>
                <option value="current">{t("tournaments.banlist.current")}</option>
                <option value="as_of_set">{t("tournaments.banlist.asOfSetOption")}</option>
              </select>
              <span className="aegis-field__message">{t("tournaments.create.banlistNoneHint")}</span>
              <FieldError message={errorFor("banlist")} />
            </div>

            {banlistMode === "as_of_set" ? (
              <div className="aegis-field">
                <label className="aegis-field__label" htmlFor={`${formId}-set`}>
                  {t("tournaments.create.set")}
                </label>
                <select
                  id={`${formId}-set`}
                  className="aegis-field__control"
                  value={banlistSetId}
                  onChange={(event) => setBanlistSetId(event.target.value)}
                >
                  {banlistSetOptions().map((setId) => (
                    <option key={setId} value={setId}>
                      {setId}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="create-tournament__wide">
              <BanlistPreviewSection preview={preview} />
            </div>

            <div className="create-tournament__wide">
              <TournamentClockFields value={clocks} onChange={setClocks} />
            </div>
          </CreateFormSection>

          <CreateFormSection id={sectionId("bots")} step={4} section={FORM_SECTIONS[3]}>
            <div className="create-tournament__toggle create-tournament__wide">
              <Switch
                checked={allowBots}
                onChange={setAllowBots}
                label={t("tournaments.create.allowBots")}
                description={t("tournaments.create.allowBotsDesc")}
              />
              <FieldError message={errorFor("allowBots")} />
            </div>
            {allowBots ? (
              <div className="create-tournament__toggle create-tournament__wide">
                <Switch
                  checked={randomBotStyles}
                  onChange={setRandomBotStyles}
                  label={t("tournaments.create.randomBotStyles")}
                  description={t("tournaments.create.randomBotStylesDesc")}
                />
              </div>
            ) : null}
          </CreateFormSection>

          <CreateFormSection id={sectionId("admin")} step={5} section={FORM_SECTIONS[4]}>
            <Field
              className="create-tournament__wide"
              label={t("tournaments.create.password")}
              type="password"
              autoComplete="new-password"
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              error={errorFor("password")}
            />
          </CreateFormSection>
        </div>

        <aside className="create-tournament__rail">
          <TournamentEventPreview
            name={name}
            official={isOfficial}
            passwordProtected={password.length > 0}
            startsAt={startsAtMs}
            structure={structure}
            topCut={topCut}
            bestOf={bestOf}
            maxPlayers={maxPlayers}
          />

          <section className="tournaments-card tournaments-estimates" aria-label={t("tournaments.create.estimates")}>
            <header className="tournaments-card__header">
              <h2 className="tournaments-card__title">{t("tournaments.create.estimates")}</h2>
            </header>
            <div className="tournaments-card__content">
              {structure === "swiss" ? (
                <>
                  <p className="create-tournament__estimate">
                    <Icons.LayoutGrid size={15} aria-hidden="true" />
                    {t("tournaments.create.estimateRounds", { rounds: swissRoundCount(maxPlayers) })}
                  </p>
                  <p className="create-tournament__estimate">
                    <Icons.Trophy size={15} aria-hidden="true" />
                    {getCutEstimate({ topCut, maxPlayers, t })}
                  </p>
                </>
              ) : (
                <p className="create-tournament__estimate">
                  <Icons.Trophy size={15} aria-hidden="true" />
                  {t("tournaments.create.estimateBracket")}
                </p>
              )}
              <p className="tournaments-note">{t("tournaments.create.estimateNote")}</p>
            </div>
          </section>

          <section className="tournaments-card create-tournament__summary">
            <header className="tournaments-card__header">
              <h2 className="tournaments-card__title">{t("tournaments.create.summary")}</h2>
            </header>
            <div className="tournaments-card__content">
              <ul className="create-tournament__checklist">
                {checklist.map((item) => (
                  <li key={item.key} data-done={item.done || undefined}>
                    <span className="create-tournament__check" aria-hidden="true">
                      {item.done ? <Icons.Check size={10} /> : null}
                    </span>
                    {t(item.labelKey)}
                  </li>
                ))}
              </ul>
              {failure ? (
                <Alert tone="danger" title={t("tournaments.error.create")}>
                  {messageFor(failure, t)}
                </Alert>
              ) : null}
              {errors.length ? (
                <ul className="tournaments-reasons" aria-label={t("tournaments.error.create")}>
                  {errors.map((error) => (
                    <li key={`${error.field}:${error.code}`}>{messageFor(error, t)}</li>
                  ))}
                </ul>
              ) : null}
              <div className="create-tournament__actions">
                <Button type="submit" size="lg" disabled={submitting} full>
                  {t("tournaments.create.submit")}
                </Button>
                <Button type="button" variant="ghost" onClick={onCancel} full>
                  {t("common.cancel")}
                </Button>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </form>
  );
}

type CreateFormSectionParams = {
  id: string;
  step: number;
  section: (typeof FORM_SECTIONS)[number];
  children: ReactNode;
};

function CreateFormSection({ id, step, section, children }: CreateFormSectionParams) {
  const { t } = useTranslation();
  return (
    <section className="tournaments-card create-tournament__section" id={id} aria-labelledby={`${id}-title`}>
      <header className="create-tournament__section-head">
        <h2 className="tournaments-card__title" id={`${id}-title`}>
          <span className="create-tournament__step" aria-hidden="true">
            {step}
          </span>
          {t(section.titleKey)}
        </h2>
        <p>{t(section.hintKey)}</p>
      </header>
      <div className="create-tournament__grid">{children}</div>
    </section>
  );
}

function FieldError({ message }: { message: string | undefined }) {
  if (!message) {
    return null;
  }
  return (
    <span className="aegis-field__message" data-error>
      {message}
    </span>
  );
}

function BanlistPreviewSection({ preview }: { preview: ReturnType<typeof previewBanlist> }) {
  const getCardName = useTranslatedCardName();
  const { t } = useTranslation();
  return (
    <section className="tournaments-preview" aria-label={t("tournaments.create.preview")}>
      <h3>{t("tournaments.create.preview")}</h3>
      {preview.kind === "unrestricted" ? <p>{t("tournaments.create.previewNone")}</p> : null}
      {preview.kind === "unknown_set" ? <p>{t("tournaments.reason.banlistSetUnknown")}</p> : null}
      {preview.kind === "resolved" ? (
        <>
          <p>{t("tournaments.create.previewCount", { count: preview.cards.length, date: preview.asOf })}</p>
          <ul className="tournaments-banlist">
            {preview.cards.map((card) => (
              <li key={card.cardId}>
                <span className="tournaments-banlist__name">{getCardName(card.cardId)}</span>
                <span className="tournaments-banlist__id">{card.cardId}</span>
                <Badge tone={card.status === "banned" ? "danger" : "warning"}>{t(restrictionKey(card.status))}</Badge>
                <span className="tournaments-banlist__copies">
                  {t("tournaments.detail.copies", { count: card.allowedCopies })}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

type CutEstimateParams = { topCut: boolean; maxPlayers: number; t: Translate };

function getCutEstimate({ topCut, maxPlayers, t }: CutEstimateParams): string {
  if (!topCut) {
    return t("tournaments.create.estimateNoCut");
  }
  const size = topCutSize(maxPlayers);
  if (size > 0) {
    return t("tournaments.create.estimateCut", { size });
  }
  return t("tournaments.create.estimateCutZero");
}

function messageFor(error: { code: string } | undefined, t: Translate): string | undefined {
  if (!error) {
    return undefined;
  }
  const key = reasonKey(error.code);
  return key ? t(key) : t("tournaments.reason.unknown", { code: error.code });
}
