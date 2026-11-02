import { useState } from "react";
import type { Permanent } from "@aegis/shared/schema/Permanent";
import { CardColor } from "@aegis/shared/schema/enums";
import { ManualAction } from "@aegis/shared/manual/ManualAction";
import { ManualKeyword } from "@aegis/shared/manual/ManualKeyword";
import type { ManualCommand } from "@aegis/shared/manual/ManualCommand";
import { useTranslation } from "@/i18n/useTranslation";
import "@/game/manual/manualFeatures.css";

type Props = { permanent: Permanent; send: (command: ManualCommand) => void };

export function ManualModifierControls({ permanent, send }: Props) {
  const { t } = useTranslation();
  const [security, setSecurity] = useState(permanent.securityAttackModifier);
  const [keywords, setKeywords] = useState<string[]>(Array.from(permanent.keywords));
  const [colors, setColors] = useState<CardColor[]>(Array.from(permanent.originalColorsOverride) as CardColor[]);
  return (
    <section className="manual-features__section" aria-label={t("manual.features.modifiers")}>
      <strong>{t("manual.features.securityAttack")}</strong>
      <div className="manual-table__dp-adjust">
        <button
          type="button"
          aria-label={t("manual.features.decreaseSecurity")}
          disabled={security <= -99}
          onClick={() => setSecurity(security - 1)}
        >
          −1
        </button>
        <output aria-label={t("manual.features.securityAttack")}>{security > 0 ? `+${security}` : security}</output>
        <button
          type="button"
          aria-label={t("manual.features.increaseSecurity")}
          disabled={security >= 99}
          onClick={() => setSecurity(security + 1)}
        >
          +1
        </button>
      </div>
      <details>
        <summary>
          {t("manual.features.keywords")} · {keywords.length}
        </summary>
        <div className="manual-features__chips" role="group" aria-label={t("manual.features.keywords")}>
          {Object.values(ManualKeyword).map((entry) => (
            <button
              key={entry.value}
              type="button"
              aria-pressed={keywords.includes(entry.value)}
              onClick={() =>
                setKeywords(
                  keywords.includes(entry.value)
                    ? keywords.filter((keyword) => keyword !== entry.value)
                    : [...keywords, entry.value],
                )
              }
            >
              {entry.value}
            </button>
          ))}
        </div>
      </details>
      <strong>{t("manual.features.colors")}</strong>
      <div className="manual-features__chips" role="group" aria-label={t("manual.features.colors")}>
        {Object.values(CardColor).map((color) => (
          <button
            key={color}
            type="button"
            aria-pressed={colors.includes(color)}
            onClick={() =>
              setColors(colors.includes(color) ? colors.filter((entry) => entry !== color) : [...colors, color])
            }
          >
            {t(`game.color.${color}`)}
          </button>
        ))}
        <button type="button" aria-pressed={!colors.length} onClick={() => setColors([])}>
          {t("manual.features.printedColors")}
        </button>
      </div>
      <button
        type="button"
        className="manual-table__primary"
        onClick={() =>
          send({
            action: ManualAction.MODIFIERS.value,
            permanentId: permanent.permanentId,
            securityAttackModifier: security,
            keywords,
            colors,
          })
        }
      >
        {t("manual.features.applyModifiers")}
      </button>
      <span className="manual-table__marker-hint">{t("manual.features.securityHelp")}</span>
    </section>
  );
}
