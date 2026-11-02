import { ArenaInputDevice } from "@/game/input/ArenaInputDevice";
import type { ReactNode, RefObject } from "react";
import { useTranslation } from "@/i18n/useTranslation";
import { useArenaInput } from "@/game/input/useArenaInput";
import { ArenaInputCommand } from "@/game/input/ArenaInputCommand";
import { ArenaInputPrompts } from "@/game/input/ArenaInputPrompts";
import "@/game/input/arenaInput.css";

type Props = {
  root: RefObject<HTMLElement | null>;
  cancelable: boolean;
  onCancel: () => void;
};

type GlyphShape = "face" | "pad";

const keyboardLabels = {
  confirm: "Enter",
  cancel: "Esc",
  inspect: "I",
  turn: "T",
  regions: "Q E",
  navigate: "↑↓←→",
  scroll: "PgUp PgDn",
};

type HintProps = {
  glyph: string;
  shape?: GlyphShape;
  button?: string;
  secondary?: boolean;
  children: ReactNode;
};

function Hint({ glyph, shape, button, secondary, children }: HintProps) {
  return (
    <span className="arena-input-hint" data-secondary={secondary || undefined}>
      <kbd className="arena-input-glyph" data-shape={shape} data-button={button}>
        {glyph}
      </kbd>
      {children}
    </span>
  );
}

export function ArenaInput({ root, cancelable, onCancel }: Props) {
  const { t } = useTranslation();
  const { device, layout, getPrompts, inSurface, canCancel, canInspect, reordering } = useArenaInput({
    root,
    onCancel,
  });
  if (!device) {
    return null;
  }
  const gamepad = device === ArenaInputDevice.GAMEPAD.value ? layout : undefined;
  const face = gamepad ? "face" : undefined;
  const labels = gamepad ? { ...gamepad.labels, navigate: "✥", scroll: "RS" } : keyboardLabels;
  return (
    <>
      <ArenaInputPrompts
        getPrompts={getPrompts}
        face={!!gamepad}
        layout={gamepad?.value}
        glyphs={{
          [ArenaInputCommand.CONFIRM.value]: labels.confirm,
          [ArenaInputCommand.CANCEL.value]: labels.cancel,
          [ArenaInputCommand.TURN.value]: labels.turn,
          [ArenaInputCommand.INSPECT.value]: labels.inspect,
        }}
      />
      {reordering ? (
        <aside className="arena-input-hints" aria-label={t("game.input.controls")} data-arena-input-device={device}>
          <span className="arena-input-hint">{t("game.input.reorder")}</span>
        </aside>
      ) : inSurface ? null : (
        <aside
          className="arena-input-hints"
          aria-label={t("game.input.controls")}
          data-arena-input-device={device}
          data-arena-input-layout={gamepad?.value}
        >
          <Hint glyph={labels.confirm} shape={face} button="confirm">
            {t("game.input.select")}
          </Hint>
          {canCancel || cancelable ? (
            <Hint glyph={labels.cancel} shape={face} button="cancel">
              {t("common.cancel")}
            </Hint>
          ) : null}
          {canInspect ? (
            <Hint glyph={labels.inspect} shape={face} button="inspect">
              {t("game.input.inspect")}
            </Hint>
          ) : null}
          <Hint glyph={labels.regions} secondary>
            {t("game.input.region")}
          </Hint>
          <Hint glyph={labels.scroll} shape={gamepad ? "pad" : undefined} secondary>
            {t("game.input.scroll")}
          </Hint>
          <Hint glyph={labels.navigate} shape={gamepad ? "pad" : undefined} secondary>
            {t("game.input.navigate")}
          </Hint>
        </aside>
      )}
    </>
  );
}
