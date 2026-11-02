import { useEffect, useId, useRef, useState } from "react";
import { getCardDefinition } from "@aegis/shared";
import { Button } from "../design/primitives";
import { CardFull } from "../design/cards";
import { useTranslation } from "../i18n";
import { CardPromptFrame } from "./overlay/combat/CardPromptFrame";
import "./AppFusionChoiceOverlay.css";

export interface AppFusionRoute {
  linkedInstanceId: string;
  linkedCardId: string;
  projectedCost: number;
}

export interface AppFusionChoiceOverlayProps {
  resultCardId: string;
  hostCardId: string;
  routes: readonly AppFusionRoute[];
  onConfirm: (linkedInstanceId: string) => void;
  onNormalEvolution?: () => void;
  onCancel: () => void;
}

/** Controlled confirmation surface for a server-projected App Fusion route. */
export function AppFusionChoiceOverlay({
  resultCardId,
  hostCardId,
  routes,
  onConfirm,
  onNormalEvolution,
  onCancel,
}: AppFusionChoiceOverlayProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const initialFocusRef = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(routes[0]?.linkedInstanceId ?? null);
  const selected = routes.find((route) => route.linkedInstanceId === selectedId);

  useEffect(() => {
    initialFocusRef.current?.focus();
  }, []);

  useEffect(() => {
    if (selectedId !== null && !routes.some((route) => route.linkedInstanceId === selectedId)) {
      setSelectedId(null);
    }
  }, [routes, selectedId]);

  const resultName = getCardDefinition(resultCardId)?.nameEn ?? resultCardId;
  const hostName = getCardDefinition(hostCardId)?.nameEn ?? hostCardId;

  return (
    <CardPromptFrame
      cardId={resultCardId}
      surface="center"
      className="app-fusion-choice"
      label={t("overlay.appFusionTitle")}
      eyebrow={t("overlay.appFusionMaterial")}
      title={t("overlay.appFusionTitle")}
      description={t("overlay.appFusionDetail", { result: resultName, host: hostName })}
      onBack={onCancel}
    >
      <fieldset className="app-fusion-choice__routes">
        <legend>{t("overlay.appFusionMaterial")}</legend>
        {routes.length === 0 ? <p role="status">{t("overlay.appFusionUnavailable")}</p> : null}
        {routes.map((route, index) => {
          const id = `${titleId}-material-${route.linkedInstanceId}`;
          return (
            <label className="app-fusion-choice__route" htmlFor={id} key={route.linkedInstanceId}>
              <input
                ref={index === 0 ? initialFocusRef : undefined}
                id={id}
                type="radio"
                name={`${titleId}-material`}
                value={route.linkedInstanceId}
                checked={selectedId === route.linkedInstanceId}
                onChange={() => setSelectedId(route.linkedInstanceId)}
              />
              <CardFull cardId={route.linkedCardId} width={58} />
              <span>
                {getCardDefinition(route.linkedCardId)?.nameEn ?? route.linkedCardId}
                <small>{t("overlay.appFusionCost", { cost: route.projectedCost })}</small>
              </span>
            </label>
          );
        })}
      </fieldset>
      <div className="game-actions-row">
        <Button full disabled={selected === undefined} onClick={() => selected && onConfirm(selected.linkedInstanceId)}>
          {t("overlay.appFusionConfirm")}
        </Button>
        {onNormalEvolution ? (
          <Button full variant="secondary" onClick={onNormalEvolution}>
            {t("overlay.appFusionNormal")}
          </Button>
        ) : null}
        <Button full variant="ghost" data-arena-cancel onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      </div>
    </CardPromptFrame>
  );
}
