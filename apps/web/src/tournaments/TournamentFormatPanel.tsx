import type { ReactNode } from "react";
import { deckFormatSettings } from "@aegis/shared/deckFormat";
import { swissRoundCount, topCutSize } from "@aegis/shared/tournaments/index";
import { playsScoredRounds } from "@aegis/shared/tournaments/playsScoredRounds";
import { eventTiebreakers } from "@/tournaments/eventTiebreakers";
import { tiebreakerHelpKey } from "@/tournaments/tiebreakerHelpKey";
import { tiebreakerLabelKey } from "@/tournaments/tiebreakerLabelKey";
import { HelpTip } from "@/design/HelpTip";
import { Panel } from "@/design/primitives";
import type { Translate } from "@/i18n/translationTypes";
import { useTranslation } from "@/i18n/useTranslation";
import { deckFormatLabel } from "@/screens/deckFormatLabel";
import { banlistModeKey, structureKey } from "@/tournaments/labels";
import type { TournamentDetail } from "@/tournaments/types";

type Props = { detail: TournamentDetail };

type SizeBand = { min: number; max: number | null; value: number };

const FIELD_SIZE_BREAKPOINTS = [8, 16, 32, 64, 128, 256, 512];

const CARD_POOL_RULE_HELP_KEYS = {
  standard: "tournaments.formatHelp.cardPool.standard",
  pauper: "tournaments.formatHelp.cardPool.pauper",
  unlimited: "tournaments.formatHelp.cardPool.unlimited",
} as const;

function sizeBands(valueFor: (players: number) => number): SizeBand[] {
  const bands: SizeBand[] = [];
  let min = 1;
  for (const max of [...FIELD_SIZE_BREAKPOINTS, null]) {
    const value = valueFor(max ?? min);
    const previous = bands.at(-1);
    if (previous && previous.value === value) {
      previous.max = max;
    } else {
      bands.push({ min, max, value });
    }
    if (max !== null) {
      min = max + 1;
    }
  }
  return bands;
}

function describeRange({ min, max }: SizeBand, t: Translate): string {
  if (max === null) {
    return t("tournaments.formatHelp.range.over", { min: min - 1 });
  }
  if (min === 1) {
    return t("tournaments.formatHelp.range.upTo", { max });
  }
  return t("tournaments.formatHelp.range.between", { min, max });
}

function SizeScale({ bands, describe }: { bands: SizeBand[]; describe: (band: SizeBand) => string }) {
  return (
    <ul className="tournaments-format__scale">
      {bands.map((band) => (
        <li key={band.min}>{describe(band)}</li>
      ))}
    </ul>
  );
}

function FormatRow({ label, help, children }: { label: string; help: ReactNode; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <>
      <dt>
        {label}
        <HelpTip label={t("tournaments.formatHelp.label", { setting: label })}>{help}</HelpTip>
      </dt>
      <dd>{children}</dd>
    </>
  );
}

function plannedSwissRounds(detail: TournamentDetail): number | null {
  return detail.phases?.find((phase) => phase.kind === "swiss")?.plannedRounds ?? null;
}

function isFieldOpen(detail: TournamentDetail): boolean {
  return detail.status === "draft" || detail.status === "registration" || detail.status === "check_in";
}

function describeTopCut(detail: TournamentDetail, t: Translate): string {
  if (!detail.topCutEnabled) {
    return t("tournaments.format.topCutOff");
  }
  if (detail.topCutSize === null) {
    if (!isFieldOpen(detail)) return t("tournaments.format.topCutOn");
    const chosen = detail.rules?.program?.topCutSize ?? null;
    return chosen === null
      ? t("tournaments.format.setAtCheckInClose")
      : t("tournaments.format.topCutChosen", { count: chosen });
  }
  if (detail.topCutSize === 0) {
    return t("tournaments.format.topCutNone");
  }
  return t("tournaments.format.topCutSize", { count: detail.topCutSize });
}

const STRUCTURE_HELP_KEYS = {
  swiss: "tournaments.formatHelp.structure.swiss",
  round_robin: "tournaments.formatHelp.structure.roundRobin",
  single_elimination: "tournaments.formatHelp.structure.singleElimination",
} as const;

export function TournamentFormatPanel({ detail }: Props) {
  const { t } = useTranslation();
  const scoredRounds = playsScoredRounds(detail.structure);
  const isRoundRobin = detail.structure === "round_robin";
  const format = detail.format ?? "standard";
  const cardPool = deckFormatSettings(format);
  const chosenRounds = detail.rules?.program?.rounds ?? null;
  const chosenTopCut = detail.rules?.program?.topCutSize ?? null;
  const rounds = plannedSwissRounds(detail) ?? chosenRounds;
  const tiebreakers = scoredRounds ? eventTiebreakers(detail.rules) : [];
  const fixedAtCheckInClose = <p>{t("tournaments.formatHelp.fixedAtCheckInClose")}</p>;
  const banlistLabel =
    detail.banlistPolicy.mode === "as_of_set"
      ? t("tournaments.banlist.asOfSet", { set: detail.banlistPolicy.setId })
      : t(banlistModeKey(detail.banlistPolicy));

  const roundsHelp = isRoundRobin ? (
    <>
      <p>{t("tournaments.formatHelp.roundRobinRounds")}</p>
      {fixedAtCheckInClose}
    </>
  ) : chosenRounds !== null ? (
    <p>{t("tournaments.formatHelp.roundsChosen", { count: chosenRounds })}</p>
  ) : (
    <>
      <p>{t("tournaments.formatHelp.swissRounds")}</p>
      <SizeScale
        bands={sizeBands(swissRoundCount)}
        describe={(band) =>
          t("tournaments.formatHelp.scale.rounds", { range: describeRange(band, t), count: band.value })
        }
      />
      {fixedAtCheckInClose}
    </>
  );

  const topCutHelp = !detail.topCutEnabled ? (
    <p>{t("tournaments.formatHelp.topCutOff")}</p>
  ) : chosenTopCut !== null ? (
    <p>{t("tournaments.formatHelp.topCutChosen", { count: chosenTopCut })}</p>
  ) : (
    <>
      <p>{t("tournaments.formatHelp.topCut")}</p>
      <SizeScale
        bands={sizeBands(topCutSize)}
        describe={(band) =>
          band.value === 0
            ? t("tournaments.formatHelp.scale.noCut", { range: describeRange(band, t) })
            : t("tournaments.formatHelp.scale.cut", { range: describeRange(band, t), count: band.value })
        }
      />
      {fixedAtCheckInClose}
    </>
  );

  return (
    <Panel className="tournaments-format">
      <h3>{t("tournaments.detail.format")}</h3>
      <dl>
        <FormatRow label={t("tournaments.create.structure")} help={<p>{t(STRUCTURE_HELP_KEYS[detail.structure])}</p>}>
          {t(structureKey(detail.structure))}
        </FormatRow>

        {scoredRounds ? (
          <FormatRow
            label={t(isRoundRobin ? "tournaments.format.rounds" : "tournaments.format.swissRounds")}
            help={roundsHelp}
          >
            {rounds === null
              ? t("tournaments.format.setAtCheckInClose")
              : t("tournaments.format.roundCount", { count: rounds })}
          </FormatRow>
        ) : null}

        {scoredRounds ? (
          <FormatRow label={t("tournaments.format.topCut")} help={topCutHelp}>
            {describeTopCut(detail, t)}
          </FormatRow>
        ) : null}

        {tiebreakers.length > 0 ? (
          <FormatRow
            label={t("tournaments.format.tiebreakers")}
            help={
              <>
                <p>{t("tournaments.formatHelp.tiebreakers")}</p>
                <ol className="tournaments-format__scale">
                  {tiebreakers.map((tiebreaker) => (
                    <li key={tiebreaker}>
                      <strong>{t(tiebreakerLabelKey(tiebreaker))}</strong>
                      {t(tiebreakerHelpKey(tiebreaker))}
                    </li>
                  ))}
                </ol>
                <p>{t("tournaments.formatHelp.tiebreakersFinal")}</p>
              </>
            }
          >
            <ol className="tournaments-format__order">
              {tiebreakers.map((tiebreaker) => (
                <li key={tiebreaker}>{t(tiebreakerLabelKey(tiebreaker))}</li>
              ))}
            </ol>
          </FormatRow>
        ) : null}

        <FormatRow
          label={t("tournaments.detail.cardPool")}
          help={
            <>
              <p>{t("tournaments.formatHelp.cardPool")}</p>
              <p>{t(CARD_POOL_RULE_HELP_KEYS[cardPool.rules])}</p>
              {cardPool.set === "all" ? null : <p>{t("tournaments.formatHelp.cardPool.set", { set: cardPool.set })}</p>}
            </>
          }
        >
          {deckFormatLabel(format, t)}
        </FormatRow>

        <FormatRow
          label={t("tournaments.create.bestOf")}
          help={<p>{t(detail.bestOf === 3 ? "tournaments.formatHelp.bestOf3" : "tournaments.formatHelp.bestOf1")}</p>}
        >
          {t("tournaments.bestOf", { count: detail.bestOf })}
        </FormatRow>

        <FormatRow
          label={t("tournaments.create.banlist")}
          help={
            <p>
              {t(
                detail.banlistPolicy.mode === "none"
                  ? "tournaments.formatHelp.banlistNone"
                  : "tournaments.formatHelp.banlist",
              )}
            </p>
          }
        >
          {banlistLabel}
        </FormatRow>

        {detail.allowBots ? (
          <FormatRow label={t("tournaments.format.bots")} help={<p>{t("tournaments.formatHelp.bots")}</p>}>
            {t("tournaments.format.botsAllowed")}
          </FormatRow>
        ) : null}
      </dl>
    </Panel>
  );
}
