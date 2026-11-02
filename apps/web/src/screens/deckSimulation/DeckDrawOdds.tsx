import { useState } from "react";
import { getCardDefinition } from "@aegis/shared";
import { useTranslation } from "@/i18n/useTranslation";
import { useCardTranslations } from "@/i18n/useCardTranslations";
import { getTranslatedCardName } from "@/i18n/getTranslatedCardName";
import {
  computeDeckDrawOdds,
  DRAW_ODDS_LAST_TURN,
  MAX_KEY_CARDS,
  type DeckDrawOddsRow,
} from "@/screens/deckSimulation/computeDeckDrawOdds";
import type { CountMap } from "@/screens/deckCounts";
import "@/screens/deckBuilder.css";

interface DeckDrawOddsProps {
  main: CountMap;
}

const DEFAULT_FOCUS_TURN = 3;

function formatPercent(probability: number): string {
  return `${Math.round(probability * 100)}%`;
}

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
  const rowLabel = (row: DeckDrawOddsRow) =>
    row.kind === "card"
      ? `${cardName(row.cardId!)} ×${row.copies}`
      : row.kind === "combo"
        ? t("deckOdds.allKeyCards")
        : t("deckOdds.rookies", { count: row.copies });

  return (
    <section className="deck-draw-odds" aria-label={t("deckOdds.title")}>
      <div className="deck-stat-label">{t("deckOdds.title")}</div>
      <div className="deck-draw-odds__controls">
        <select
          className="deck-draw-odds__picker"
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
        </select>
        <div className="deck-draw-odds__toggles">
          <button type="button" className="deck-draw-odds__toggle" onClick={() => setGoingFirst(!goingFirst)}>
            {goingFirst ? t("deckOdds.goingFirst") : t("deckOdds.goingSecond")}
          </button>
          <label className="deck-draw-odds__check">
            <input type="checkbox" checked={mulligan} onChange={(event) => setMulligan(event.target.checked)} />
            {t("deckOdds.mulligan")}
          </label>
        </div>
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
                {cardName(cardId)} ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="deck-draw-odds__hint">{t("deckOdds.empty")}</p>
      )}
      {odds.rows.length > 0 ? (
        <div className="deck-draw-odds__table-wrap">
          <table className="deck-draw-odds__table">
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
                      {turn === 0 ? t("deckOdds.openingShort") : t("deckOdds.turnShort", { turn })}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {odds.rows.map((row) => (
                <tr key={row.key} data-kind={row.kind}>
                  <th scope="row">{rowLabel(row)}</th>
                  {row.curve.map((probability, turn) => (
                    <td key={turn} data-focus={turn === focusTurn}>
                      <span
                        className="deck-draw-odds__bar"
                        style={{ height: `${Math.round(probability * 100)}%` }}
                        aria-hidden="true"
                      />
                      <span className="deck-draw-odds__value">{formatPercent(probability)}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {odds.rows.some((row) => row.curveWithOneMore !== undefined) ? (
        <ul className="deck-draw-odds__sensitivity">
          {odds.rows
            .filter((row) => row.curveWithOneMore !== undefined)
            .map((row) => (
              <li key={row.key}>
                {t("deckOdds.withOneMore", {
                  card: cardName(row.cardId!),
                  turn: focusTurn === 0 ? t("deckOdds.openingShort") : t("deckOdds.turnShort", { turn: focusTurn }),
                  before: formatPercent(row.curve[focusTurn]!),
                  after: formatPercent(row.curveWithOneMore![focusTurn]!),
                })}
              </li>
            ))}
        </ul>
      ) : null}
      <p className="deck-draw-odds__note">{t("deckOdds.note")}</p>
    </section>
  );
}
