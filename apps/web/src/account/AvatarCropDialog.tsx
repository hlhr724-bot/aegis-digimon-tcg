import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Dialog } from "../design/primitives";
import { useTranslation } from "../i18n";
import { AVATAR_EDGE } from "./encodeAvatarWithinLimit";
import {
  CENTRED_AVATAR_CROP,
  MAX_AVATAR_ZOOM,
  MIN_AVATAR_ZOOM,
  clampAvatarCrop,
  cropSourceRect,
  dragToOffset,
  renderAvatarCrop,
  type AvatarCrop,
} from "./normalizeAvatarImage";

/** Keyboard nudge, as a fraction of the room the picture has around the crop window. */
const KEY_NUDGE = 0.08;
const ZOOM_STEP = 0.1;

/**
 * Lets the player frame their picture before it is uploaded. The square stage draws exactly the
 * region that will be exported, so what they see is what the API and every other player gets.
 */
export function AvatarCropDialog({
  image,
  busy,
  onCancel,
  onConfirm,
}: {
  image: ImageBitmap;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (blob: Blob) => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const hintId = useId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | undefined>(undefined);
  const [crop, setCrop] = useState<AvatarCrop>(CENTRED_AVATAR_CROP);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const { sx, sy, side } = cropSourceRect(crop, image.width, image.height);
    context.imageSmoothingQuality = "high";
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, sx, sy, side, side, 0, 0, canvas.width, canvas.height);
  }, [crop, image]);

  useEffect(() => {
    draw();
  }, [draw]);

  function move(dx: number, dy: number) {
    const stage = canvasRef.current?.getBoundingClientRect().width ?? 0;
    setCrop((current) => {
      const next = dragToOffset(current, dx, dy, image.width, image.height, stage);
      return clampAvatarCrop({ zoom: current.zoom, ...next });
    });
  }

  function zoomTo(zoom: number) {
    setCrop((current) => clampAvatarCrop({ ...current, zoom }));
  }

  async function confirm() {
    if (saving || busy) return;
    setSaving(true);
    setFailed(false);
    try {
      await onConfirm(await renderAvatarCrop(image, crop));
    } catch {
      setFailed(true);
      setSaving(false);
    }
  }

  const disabled = saving || busy;
  return (
    <Dialog
      className="avatar-crop"
      labelledBy={titleId}
      onClose={disabled ? undefined : onCancel}
      closeOnBackdrop={false}
    >
      <header>
        <h2 id={titleId}>{t("account.avatar.cropTitle")}</h2>
      </header>
      <p id={hintId} className="avatar-crop__hint">
        {t("account.avatar.cropHint")}
      </p>
      <canvas
        ref={canvasRef}
        className="avatar-crop__stage"
        width={AVATAR_EDGE}
        height={AVATAR_EDGE}
        tabIndex={0}
        aria-label={t("account.avatar.cropStage")}
        aria-describedby={hintId}
        onPointerDown={(event) => {
          if (disabled) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
          };
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          move(event.clientX - drag.x, event.clientY - drag.y);
          dragRef.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
          };
        }}
        onPointerUp={(event) => {
          if (dragRef.current?.pointerId === event.pointerId) dragRef.current = undefined;
        }}
        onPointerCancel={() => {
          dragRef.current = undefined;
        }}
        onWheel={(event) => {
          if (disabled) return;
          event.preventDefault();
          zoomTo(crop.zoom - Math.sign(event.deltaY) * ZOOM_STEP);
        }}
        onKeyDown={(event) => {
          if (disabled) return;
          const stage = event.currentTarget.getBoundingClientRect().width || 1;
          const nudge = stage * KEY_NUDGE;
          if (event.key === "ArrowLeft") move(nudge, 0);
          else if (event.key === "ArrowRight") move(-nudge, 0);
          else if (event.key === "ArrowUp") move(0, nudge);
          else if (event.key === "ArrowDown") move(0, -nudge);
          else if (event.key === "+" || event.key === "=") zoomTo(crop.zoom + ZOOM_STEP);
          else if (event.key === "-" || event.key === "_") zoomTo(crop.zoom - ZOOM_STEP);
          else return;
          event.preventDefault();
        }}
      />
      <label className="avatar-crop__zoom">
        <span>{t("account.avatar.cropZoom")}</span>
        <input
          type="range"
          min={MIN_AVATAR_ZOOM}
          max={MAX_AVATAR_ZOOM}
          step={0.01}
          value={crop.zoom}
          disabled={disabled}
          onChange={(event) => zoomTo(Number(event.target.value))}
        />
      </label>
      {failed ? <p role="alert">{t("account.avatar.uploadError")}</p> : null}
      <footer>
        <button type="button" className="aegis-button aegis-button--ghost" disabled={disabled} onClick={onCancel}>
          {t("common.cancel")}
        </button>
        <button type="button" className="aegis-button" disabled={disabled} onClick={() => void confirm()}>
          {saving || busy ? t("account.avatar.saving") : t("account.avatar.cropSave")}
        </button>
      </footer>
    </Dialog>
  );
}
