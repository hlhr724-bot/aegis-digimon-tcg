import { useState, type CSSProperties } from "react";
import { getCardDefinition } from "@aegis/shared";
import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";
import { useCardTranslations } from "@/i18n/useCardTranslations";
import { getTranslatedCardName } from "@/i18n/getTranslatedCardName";
import {
  computeDeckDrawOdds,
  DRAW_ODDS_LAST_TURN,
  MAX_KEY_CARDS,
  type DeckDrawOddsRow,
} from "@/screens/deckSimulation/computeDeckDrawOdds";
import { SimulationSelect } from "@/screens/deckSimulation/SimulationSelect";
import type { CountMap } from "@/screens/deckCounts";
import "@/screens/deckBuilder.css";

interface DeckDrawOddsProps {
  main: CountMap;
}

const DEFAULT_FOCUS_TURN = 3;

const toPercent = (probability: number) => Math.round(probability * 100);
const formatPercent = (probability: number) => `${toPercent(probability)}%`;

export function DeckDrawOdds({ main }: DeckDrawOddsProps) {
  const { t } = useTranslation();
  const translations = useCardTranslations();
  const [keyCardIds, setKeyCardIds] = useState<string[]>([]);
  const [goingFirst, setGoingFirst] = useState(true);
  const [mulligan, setMulligan] = useState(true);
  const [focusTurn, setFocusTurn] = useState(DEFAULT_FOCUS_TURN);
  const cardName = (cardId: string) =>
    getTranslatedCardName({ name: getCardDefinition(cardId)?.nameEn ?? cardId, translations });
  const activeKeyCards = keyCardIds.filter((cardId) => (main[cardId] ?? 0) > 0);
  const odds = computeDeckDrawOdds({ main, keyCardIds: activeKeyCards, goingFirst, mulligan });
  const candidates = Object.keys(main)
    .filter((cardId) => (main[cardId] ?? 0) > 0 && !activeKeyCards.includes(cardId))
    .map((cardId) => ({ cardId, name: cardName(cardId) }))
    .sort((left, right) => left.name.localeCompare(right.name) || left.cardId.localeCompare(right.cardId));
  const turns = Array.from({ length: DRAW_ODDS_LAST_TURN + 1 }, (_, turn) => turn);
  const turnLabel = (turn: number) => (turn === 0 ? t("deckOdds.openingShort") : t("deckOdds.turnShort", { turn }));
  const rowName = (row: DeckDrawOddsRow) =>
    row.kind === "card" ? cardName(row.cardId!) : row.kind === "combo" ? t("deckOdds.allKeyCards") : undefined;
  const sensitivityRows = odds.rows.filter((row) => row.curveWithOneMore !== undefined);

  return (
    <section className="deck-sim deck-draw-odds" aria-label={t("deckOdds.title")}>
      <div className="deck-stat-label">{t("deckOdds.title")}</div>
      <div className="deck-sim__controls">
        <SimulationSelect
          wrapperClassName="deck-sim__grow"
          aria-label={t("deckOdds.addKeyCard")}
          value=""
          disabled={activeKeyCards.length >= MAX_KEY_CARDS || candidates.length === 0}
          onChange={(event) => {
            const cardId = event.target.value;
            if (cardId !== "") setKeyCardIds([...activeKeyCards, cardId]);
          }}
        >
          <option value="">{t("deckOdds.addKeyCard")}</option>
          {candidates.map((candidate) => (
            <option key={candidate.cardId} value={candidate.cardId}>
              {candidate.name} ({candidate.cardId})
            </option>
          ))}
        </SimulationSelect>
        <div className="deck-segmented deck-sim__segmented" role="group" aria-label={t("deckOdds.order")}>
          <button type="button" aria-pressed={goingFirst} onClick={() => setGoingFirst(true)}>
            {t("deckOdds.goingFirst")}
          </button>
          <button type="button" aria-pressed={!goingFirst} onClick={() => setGoingFirst(false)}>
            {t("deckOdds.goingSecond")}
          </button>
        </div>
        <label className="deck-sim__check">
          <input type="checkbox" checked={mulligan} onChange={(event) => setMulligan(event.target.checked)} />
          {t("deckOdds.mulligan")}
        </label>
      </div>
      {activeKeyCards.length > 0 ? (
        <ul className="deck-draw-odds__chips">
          {activeKeyCards.map((cardId) => (
            <li key={cardId}>
              <button
                type="button"
                className="deck-draw-odds__chip"
                aria-label={t("deckOdds.removeKeyCard", { card: cardName(cardId) })}
                onClick={() => setKeyCardIds(activeKeyCards.filter((id) => id !== cardId))}
              >
                <span className="deck-draw-odds__chip-name">{cardName(cardId)}</span>
                <Icons.X size={12} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="deck-sim__hint">{t("deckOdds.empty")}</p>
      )}
      {odds.rows.length > 0 ? (
        <div className="deck-draw-odds__table-wrap">
          <table className="deck-draw-odds__table">
            <colgroup>
              <col className="deck-draw-odds__name-col" />
              {turns.map((turn) => (
                <col key={turn} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th scope="col">
                  <span className="aegis-sr-only">{t("deckOdds.keyCards")}</span>
                </th>
                {turns.map((turn) => (
                  <th key={turn} scope="col">
                    <button
                      type="button"
                      className="deck-draw-odds__turn"
                      aria-pressed={turn === focusTurn}
                      onClick={() => setFocusTurn(turn)}
                    >
                      {turnLabel(turn)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {odds.rows.map((row) => {
                const name = rowName(row);
                return (
                  <tr key={row.key} data-kind={row.kind}>
                    <th scope="row">
                      <span className="deck-draw-odds__row-label">
                        <span className="deck-draw-odds__row-name">
                          {name ?? t("deckOdds.rookies", { count: row.copies })}
                        </span>
                        {row.kind === "card" ? <span className="deck-draw-odds__copies">×{row.copies}</span> : null}
                      </span>
                    </th>
                    {row.curve.map((probability, turn) => (
                      <td
                        key={turn}
                        data-focus={turn === focusTurn}
                        style={{ "--odds": toPercent(probability) } as CSSProperties}
                      >
                        {formatPercent(probability)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {sensitivityRows.length > 0 ? (
        <ul className="deck-draw-odds__sensitivity">
          {sensitivityRows.map((row) => {
            const before = row.curve[focusTurn]!;
            const after = row.curveWithOneMore![focusTurn]!;
            return (
              <li key={row.key}>
                <span className="deck-draw-odds__delta" aria-hidden="true">
                  +{toPercent(after) - toPercent(before)}
                </span>
                <span>
                  {t("deckOdds.withOneMore", {
                    card: cardName(row.cardId!),
                    turn: turnLabel(focusTurn),
                    before: formatPercent(before),
                    after: formatPercent(after),
                  })}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
      <p className="deck-sim__note">{t("deckOdds.note")}</p>
    </section>
  );
}
