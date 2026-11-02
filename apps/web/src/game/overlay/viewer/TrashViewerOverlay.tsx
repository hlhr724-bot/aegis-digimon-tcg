import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";
import { useTranslatedCardText } from "@/i18n/useTranslatedCardText";
import { useState } from "react";
import { createPortal } from "react-dom";
import { getCardDefinition } from "@aegis/shared";
import { Button } from "../../../design/primitives";
import { CardBack } from "../../../design/cards";
import { useTranslation } from "../../../i18n";
import { securityCardEffects } from "../../securityCardEffects";
import type { ActivatableEntry } from "../../boardModel";
import { Scrim } from "../Scrim";
import { CardArt } from "../CardArt";
import { cardEffectClausesForTiming } from "../effectText";
import { EffectText } from "../../EffectText";
import { CardZoomOverlay } from "./CardZoomOverlay";
import type { EffectSourceMark } from "@/game/effectMarks/EffectSourceMark";
import { getEffectSourceMarkLabelKey } from "@/game/effectMarks/getEffectSourceMarkLabelKey";

/**
 * Modal listing every card in a player's trash (public information). Cards are
 * laid out newest-first in a wrapped grid of thumbnails; hovering one shows a
 * large preview on the right. The trash stays server-owned: the only action is
 * activating a `[Trash] [Main]` effect the server projected onto a card.
 */
export function TrashViewerOverlay({
  cardIds,
  artIds,
  instanceIds,
  effects,
  effectSourceMarks,
  title,
  sheet,
  countLabel,
  emptyLabel,
  preserveOrder = false,
  onActivateEffect,
  onClose,
}: {
  cardIds: string[];
  artIds?: string[];
  instanceIds?: string[];
  /** Server-projected `[Trash] [Main]` activations per card, aligned with `cardIds`. */
  effects?: readonly (readonly ActivatableEntry[])[];
  effectSourceMarks?: ReadonlyMap<string, EffectSourceMark>;
  preserveOrder?: boolean;
  title: string;
  /** Render as a bottom sheet with one scrollable row (touch layouts). */
  sheet?: boolean;
  /** Header count text; defaults to the trash card count. */
  countLabel?: string;
  /** Text shown when `cardIds` is empty; defaults to the trash empty message. */
  emptyLabel?: string;
  onActivateEffect?: (effect: ActivatableEntry) => void;
  onClose: () => void;
}) {
  const getCardName = useTranslatedCardName();
  const { t } = useTranslation();
  const translateCardText = useTranslatedCardText();
  const [sort, setSort] = useState<"recent" | "name">("recent");
  const countText = countLabel ?? t("overlay.trashCount", { count: cardIds.length });
  const emptyText = emptyLabel ?? t("overlay.trashEmpty");
  // Sort entries together: art and executable effects belong to a physical copy.
  const entries = cardIds.map((cardId, index) => ({ cardId, index, key: instanceIds?.[index] ?? String(index) }));
  if (!preserveOrder) {
    entries.reverse();
    if (sort === "name")
      entries.sort(
        (a, b) =>
          (getCardDefinition(a.cardId)?.nameEn ?? a.cardId).localeCompare(
            getCardDefinition(b.cardId)?.nameEn ?? b.cardId,
          ) ||
          a.cardId.localeCompare(b.cardId) ||
          b.index - a.index,
      );
  }
  const ordered = entries.map((entry) => entry.cardId);
  const orderedArts = entries.map((entry) => artIds?.[entry.index]);
  const orderedEffects = entries.map((entry) => effects?.[entry.index] ?? []);
  const orderedMarkLabels = entries.map((entry) => {
    const instanceId = instanceIds?.[entry.index];
    const mark = instanceId === undefined ? undefined : effectSourceMarks?.get(instanceId);
    return mark ? t(getEffectSourceMarkLabelKey(mark)) : undefined;
  });
  const totals = new Map<string, number>();
  for (const cardId of cardIds) totals.set(cardId, (totals.get(cardId) ?? 0) + 1);
  const copyLabels = entries.map((entry) => {
    const total = totals.get(entry.cardId) ?? 0;
    return total > 1
      ? t("overlay.cardCopy", {
          index: cardIds.slice(0, entry.index + 1).filter((id) => id === entry.cardId).length,
          total,
        })
      : undefined;
  });
  const canActivate = onActivateEffect !== undefined;
  const isActivatable = (index: number) => canActivate && (orderedEffects[index]?.length ?? 0) > 0;
  const [menuKey, setMenuKey] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState(() => {
    const firstActivatable = ordered.findIndex((_, index) => isActivatable(index));
    return entries[firstActivatable >= 0 ? firstActivatable : Math.max(0, ordered.findIndex(Boolean))]?.key;
  });
  const [zoomedKey, setZoomedKey] = useState<string | null>(null);
  const indexOf = (key: string | null | undefined) => {
    const index = entries.findIndex((entry) => entry.key === key);
    return index < 0 ? null : index;
  };
  const menuIndex = indexOf(menuKey);
  const zoomedIndex = indexOf(zoomedKey);
  const activeIndex = indexOf(activeKey) ?? 0;
  const zoomed = zoomedIndex === null ? undefined : ordered[zoomedIndex];
  const effectiveIndex = activeIndex;
  const preview = ordered[effectiveIndex];
  const sortControl =
    !preserveOrder && cardIds.length > 0 ? (
      <label className="trash-viewer__sort">
        {t("overlay.trashSort")}
        <select
          value={sort}
          onChange={(event) => {
            setSort(event.target.value as "recent" | "name");
            setActiveKey(entries[0]?.key);
            setMenuKey(null);
            setZoomedKey(null);
          }}
        >
          <option value="recent">{t("overlay.trashSortRecent")}</option>
          <option value="name">{t("overlay.trashSortName")}</option>
        </select>
      </label>
    ) : null;

  /** One button per effect of ONE card, so two copies never show two identical buttons side by side. */
  const activationButtonsFor = (index: number) => {
    const cardId = ordered[index];
    const cardEffects = orderedEffects[index] ?? [];
    if (!onActivateEffect || !cardId || cardEffects.length === 0) return null;
    const name = getCardName(cardId);
    return (
      <div
        className="trash-viewer__activations"
        style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}
      >
        {cardEffects.map((effect) => (
          <Button
            key={`${effect.instanceId}:${effect.effectKey}`}
            size="md"
            full
            title={translateCardText({ text: effect.description, cardId })}
            aria-label={`${t("game.activateMainEffect")}: ${name}`}
            onClick={() => {
              setMenuKey(null);
              onActivateEffect(effect);
            }}
          >
            {t("game.activateMainEffect")}
          </Button>
        ))}
      </div>
    );
  };
  const trashClauses = (cardId: string | undefined) => (cardId ? cardEffectClausesForTiming(cardId, "Trash") : []);
  /** Clicking an activatable card asks for confirmation: the card, its [Trash] clause, and activate or cancel. */
  const confirmDialog = (index: number) => {
    const cardId = ordered[index];
    if (!cardId) return null;
    const name = getCardName(cardId);
    return (
      <div className="trash-viewer__confirm" onClick={() => setMenuKey(null)}>
        <div
          className="trash-viewer__confirm-panel"
          role="dialog"
          aria-modal="true"
          aria-label={name}
          onClick={(event) => event.stopPropagation()}
        >
          <CardArt cardId={cardId} artId={orderedArts[index]} width={180} />
          <div className="trash-viewer__confirm-body">
            <strong>{name}</strong>
            <div className="trash-viewer__effect">
              {trashClauses(cardId).map((clause) => (
                <p key={clause}>
                  <EffectText text={clause} cardId={cardId} timing="Trash" surface="trash-confirm" allowContext />
                </p>
              ))}
            </div>
            {activationButtonsFor(index)}
            <Button size="md" full variant="ghost" onClick={() => setMenuKey(null)}>
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      </div>
    );
  };
  const openCard = (index: number) => {
    setActiveKey(entries[index]?.key);
    if (isActivatable(index)) setMenuKey(entries[index]?.key ?? null);
    else if (ordered[index]) setZoomedKey(entries[index]?.key ?? null);
  };

  const zoomOverlay = zoomed ? (
    <CardZoomOverlay
      cardId={zoomed}
      artId={zoomedIndex === null ? undefined : orderedArts[zoomedIndex]}
      onClose={() => setZoomedKey(null)}
    />
  ) : null;

  if (sheet) {
    return createPortal(
      <>
        <div
          className="card-action-sheet pile-viewer"
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={onClose}
        >
          <div className="card-action-sheet__panel" onClick={(e) => e.stopPropagation()}>
            <div className="card-action-sheet__grip" aria-hidden />
            <div className="trash-sheet__header">
              <strong>{title}</strong>
              <span>{countText}</span>
            </div>
            {sortControl}
            {ordered.length === 0 ? (
              <p className="trash-sheet__empty">{emptyText}</p>
            ) : (
              <div className="trash-sheet__row">
                {ordered.map((cardId, i) => (
                  <button
                    type="button"
                    key={entries[i]?.key}
                    aria-haspopup={isActivatable(i) ? "dialog" : undefined}
                    onClick={() => openCard(i)}
                  >
                    {cardId ? (
                      <CardArt cardId={cardId} artId={orderedArts[i]} width={96} />
                    ) : (
                      <CardBack width={96} useSelectedSleeve={false} />
                    )}
                    <figcaption>{cardId ? getCardName(cardId) : t("game.hiddenCard")}</figcaption>
                    {!preserveOrder && copyLabels[i] ? (
                      <span className="trash-viewer__label">{copyLabels[i]}</span>
                    ) : null}
                    {isActivatable(i) ? <span className="trash-viewer__label">{t("overlay.trashEffect")}</span> : null}
                    {orderedMarkLabels[i] ? (
                      <span className="trash-viewer__label" data-effect-mark>
                        {orderedMarkLabels[i]}
                      </span>
                    ) : null}
                    {preserveOrder && cardId
                      ? securityCardEffects(cardId).map((effect) => (
                          <span className="security-viewer__effect" key={effect.text}>
                            {effect.text}
                          </span>
                        ))
                      : null}
                  </button>
                ))}
              </div>
            )}
            {menuIndex !== null ? confirmDialog(menuIndex) : null}
            <div className="card-action-sheet__actions">
              <Button size="sm" full variant="ghost" data-arena-cancel onClick={onClose} autoFocus>
                {t("common.close")}
              </Button>
            </div>
          </div>
        </div>
        {zoomOverlay}
      </>,
      document.body,
    );
  }

  return createPortal(
    <>
      <Scrim onClick={onClose} className="game-modal pile-viewer">
        <div
          className="game-modal__panel"
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={(e) => e.stopPropagation()}
          style={{
            display: "flex",
            gap: 22,
            width: 820,
            maxWidth: "92%",
            maxHeight: "86%",
            padding: 24,
            background: "var(--ds-sheet)",
            borderRadius: 20,
            border: "1px solid var(--ds-line)",
            boxShadow: "var(--ds-shadow-raise)",
          }}
        >
          {/* left: header + wrapped thumbnail grid */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              flex: 1,
              minWidth: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 800,
                  color: "var(--ds-text)",
                  fontFamily: "var(--ds-font-display)",
                }}
              >
                {title}
              </div>
              <div
                style={{
                  fontFamily: "var(--ds-font-mono)",
                  fontSize: 11,
                  color: "var(--ds-text-3)",
                }}
              >
                {countText}
              </div>
            </div>
            {sortControl}
            {ordered.length === 0 ? (
              <div
                style={{
                  flex: 1,
                  display: "grid",
                  placeItems: "center",
                  color: "var(--ds-text-off)",
                  fontFamily: "var(--ds-font-mono)",
                  fontSize: 12,
                }}
              >
                {emptyText}
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  overflowY: "auto",
                  alignContent: "flex-start",
                  paddingRight: 4,
                }}
              >
                {ordered.map((cardId, i) => {
                  const def = getCardDefinition(cardId);
                  const sel = activeIndex === i;
                  const activatable = isActivatable(i);
                  return (
                    <div key={entries[i]?.key} className="trash-viewer__slot">
                      <button
                        type="button"
                        onMouseEnter={() => setActiveKey(entries[i]?.key)}
                        aria-haspopup={activatable ? "dialog" : undefined}
                        onClick={() => openCard(i)}
                        title={cardId ? getCardName(cardId) : t("game.hiddenCard")}
                        aria-label={[cardId ? getCardName(cardId) : t("game.hiddenCard"), orderedMarkLabels[i]]
                          .filter(Boolean)
                          .join(", ")}
                        onFocus={() => setActiveKey(entries[i]?.key)}
                        className="trash-viewer__card"
                        data-selected={sel || undefined}
                      >
                        {cardId ? (
                          <CardArt cardId={cardId} artId={orderedArts[i]} width={preserveOrder ? 96 : 64} />
                        ) : (
                          <CardBack width={96} useSelectedSleeve={false} />
                        )}
                        {preserveOrder ? (
                          <span className="security-viewer__name">
                            {def ? getCardName(def.cardId) : t("game.hiddenCard")}
                          </span>
                        ) : null}
                        {!preserveOrder && copyLabels[i] ? (
                          <span className="trash-viewer__label">{copyLabels[i]}</span>
                        ) : null}
                        {preserveOrder && cardId
                          ? securityCardEffects(cardId).map((effect) => (
                              <span className="security-viewer__badge" title={effect.text} key={effect.text}>
                                {effect.badge}
                              </span>
                            ))
                          : null}
                        {isActivatable(i) ? (
                          <span className="trash-viewer__label">{t("overlay.trashEffect")}</span>
                        ) : null}
                        {orderedMarkLabels[i] ? (
                          <span className="trash-viewer__label" data-effect-mark>
                            {orderedMarkLabels[i]}
                          </span>
                        ) : null}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* right: large preview of the hovered card */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              alignItems: "center",
              justifyContent: "space-between",
              flexShrink: 0,
            }}
          >
            {preview ? (
              <CardArt cardId={preview} artId={orderedArts[effectiveIndex]} width={260} />
            ) : ordered.length ? (
              <CardBack width={260} useSelectedSleeve={false} />
            ) : null}
            {preserveOrder && preview
              ? securityCardEffects(preview).map((effect) => (
                  <p className="security-viewer__effect" key={effect.text}>
                    {effect.text}
                  </p>
                ))
              : null}
            <Button size="md" variant="ghost" full data-arena-cancel onClick={onClose}>
              {t("common.close")}
            </Button>
          </div>
        </div>
      </Scrim>
      {menuIndex !== null ? confirmDialog(menuIndex) : null}
      {zoomOverlay}
    </>,
    document.body,
  );
}
