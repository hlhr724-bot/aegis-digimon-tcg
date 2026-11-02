import { useId, useState } from "react";
import { Button } from "@/design/primitives";
import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";
import { HandoffQrCode } from "@/game/handoff/HandoffQrCode";
import "@/game/handoff/deviceHandoff.css";

type DeviceHandoffSettingsParams = {
  url: string;
};

export function DeviceHandoffSettings({ url }: DeviceHandoffSettingsParams) {
  const { t } = useTranslation();
  const titleId = useId();
  const [shown, setShown] = useState(false);
  return (
    <section className="game-handoff" aria-labelledby={titleId}>
      <h3 id={titleId} className="game-arena-settings__title">
        {t("game.handoff.title")}
      </h3>
      <div className="game-arena-settings__panel game-handoff__panel">
        <p className="game-handoff__hint">{t("game.handoff.hint")}</p>
        <Button
          size="sm"
          variant="secondary"
          icon={Icons.Devices}
          aria-expanded={shown}
          onClick={() => setShown((current) => !current)}
        >
          {t(shown ? "game.handoff.hide" : "game.handoff.show")}
        </Button>
        {shown ? (
          <div className="game-handoff__code">
            <HandoffQrCode url={url} label={t("game.handoff.qrLabel")} />
            <span className="game-handoff__url">{url}</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
