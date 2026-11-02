import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";
import { Button } from "../../../design/primitives";
import { Icons } from "../../../design/icons";
import { useTranslation } from "../../../i18n";
import { CardArt } from "../CardArt";

import { CardPromptFrame } from "./CardPromptFrame";
import { useEffectPromptPosition } from "@/game/effectPromptPosition";

export function BlockOverlay({
  attackerCardId,
  blockers,
  mustBlock = false,
  onBlock,
  onDecline,
}: {
  attackerCardId?: string;
  blockers: { permanentId: string; cardId: string; currentDP: number; sourceCount: number }[];
  /** Collision requires blocking while a blocker is available. */
  mustBlock?: boolean;
  onBlock: (permanentId: string) => void;
  onDecline: () => void;
}) {
  const getCardName = useTranslatedCardName();
  const { t } = useTranslation();
  const effectPromptPosition = useEffectPromptPosition();
  const forced = mustBlock && blockers.length > 0;
  return (
    <CardPromptFrame
      cardId={attackerCardId}
      fallback={<Icons.Swords size={32} />}
      className={`block-overlay${blockers.length ? "" : " block-overlay--empty"}`}
      surface={blockers.length ? "center" : effectPromptPosition}
      label={t("overlay.blockWindow")}
      eyebrow={
        <>
          {t("overlay.blockWindow")}
          {forced ? (
            <>
              {" "}
              · <span>{t("overlay.blockForced")}</span>
            </>
          ) : null}
        </>
      }
      title={t(blockers.length ? "overlay.blockChooseCard" : "overlay.noBlockers")}
      description={
        blockers.length ? <span>{t(forced ? "overlay.blockForcedPrompt" : "overlay.blockPrompt")}</span> : undefined
      }
    >
      {blockers.length ? (
        <div className="counter-overlay__gallery block-overlay__gallery">
          {blockers.map((blocker, index) => {
            const sourceLabel = t(blocker.sourceCount === 1 ? "overlay.sourceCountOne" : "overlay.sourceCountMany", {
              count: blocker.sourceCount,
            });
            return (
              <button
                key={blocker.permanentId}
                type="button"
                className="counter-overlay__card"
                aria-label={`${getCardName(blocker.cardId)}, ${blocker.currentDP.toLocaleString()} DP, ${sourceLabel}, ${t("overlay.cardCopy", { index: index + 1, total: blockers.length })}`}
                onClick={() => onBlock(blocker.permanentId)}
              >
                <CardArt cardId={blocker.cardId} width={112} />
                <strong>{getCardName(blocker.cardId)}</strong>
                <span className="counter-overlay__card-id">{blocker.cardId}</span>
                <span className="block-overlay__dp">{blocker.currentDP.toLocaleString()} DP</span>
                <span>{sourceLabel}</span>
                <span className="counter-overlay__card-id">
                  {index + 1} / {blockers.length}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
      {!forced ? (
        <Button full variant="secondary" icon={Icons.Shield} onClick={onDecline}>
          {t("overlay.takeAttack")}
        </Button>
      ) : null}
    </CardPromptFrame>
  );
}
