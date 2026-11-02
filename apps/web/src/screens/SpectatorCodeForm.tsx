import { useState } from "react";
import { Button, Field } from "@/design/primitives";
import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";

export function SpectatorCodeForm({
  initialCode = "",
  onWatch,
}: {
  initialCode?: string;
  onWatch: (code: string) => void;
}) {
  const { t } = useTranslation();
  const [code, setCode] = useState(initialCode);
  return (
    <form
      className="watch-code"
      aria-labelledby="watch-code-title"
      onSubmit={(event) => {
        event.preventDefault();
        if (code.length === 6) onWatch(code);
      }}
    >
      <div className="watch-code__intro">
        <h2 id="watch-code-title" className="aegis-eyebrow">
          {t("spectator.codeTitle")}
        </h2>
        <p>{t("spectator.codeHint")}</p>
      </div>
      <div className="watch-code__entry">
        <Field
          label={t("spectator.code")}
          name="spectatorCode"
          autoComplete="off"
          spellCheck={false}
          maxLength={6}
          placeholder="ABC234"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ""))}
        />
        <Button type="submit" icon={Icons.Eye} disabled={code.length !== 6}>
          {t("spectator.watch")}
        </Button>
      </div>
    </form>
  );
}
