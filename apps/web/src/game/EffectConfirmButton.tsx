import { useEffect } from "react";
import { Button } from "../design/primitives";
import { useTranslation } from "../i18n";

const TYPING_TARGETS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function EffectConfirmButton({ onConfirm }: { onConfirm: () => void }) {
  const { t } = useTranslation();
  useEffect(() => {
    const confirmOnEnter = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== "Enter" || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target && (TYPING_TARGETS.has(target.tagName) || target.isContentEditable)) return;
      event.preventDefault();
      onConfirm();
    };
    window.addEventListener("keydown", confirmOnEnter);
    return () => window.removeEventListener("keydown", confirmOnEnter);
  }, [onConfirm]);
  return (
    <div className="effect-confirm">
      <Button size="md" aria-label={t("game.effectConfirmLabel")} onClick={onConfirm}>
        {t("game.effectConfirm")}
      </Button>
      <kbd aria-hidden="true">Enter</kbd>
    </div>
  );
}
