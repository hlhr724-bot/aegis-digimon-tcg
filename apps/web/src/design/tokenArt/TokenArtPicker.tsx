import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";
import { useRef, useState } from "react";
import { tokenDefinitions } from "@aegis/shared/cards/tokens";
import { cardImageUrls } from "@aegis/shared/cards/images";
import { toStorableDataUrl } from "@/design/battlefield";
import { useTokenArt } from "@/design/tokenArt/useTokenArt";
import { tokenArtStore } from "@/design/tokenArt/tokenArtStore";
import { useTranslation } from "@/i18n/useTranslation";

type TokenArtOptionParams = { cardId: string; name: string };

const customizableTokens = tokenDefinitions.filter((token) => token.cardId !== "TOKEN-SelfDeleteFamiliar-Token");

function TokenArtOption({ cardId, name }: TokenArtOptionParams) {
  const { t } = useTranslation();
  const custom = useTokenArt(cardId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function uploadImage(file: File | undefined) {
    if (!file) {
      return;
    }
    setError(undefined);
    if (!file.type.startsWith("image/")) {
      setError(t("settings.sleeveInvalid"));
      return;
    }
    setBusy(true);
    try {
      tokenArtStore.set({ cardId, dataUrl: await toStorableDataUrl(file) });
    } catch {
      setError(t("settings.sleeveUploadError"));
    } finally {
      setBusy(false);
    }
  }

  function removeImage() {
    try {
      tokenArtStore.set({ cardId });
      setError(undefined);
    } catch {
      setError(t("settings.sleeveUploadError"));
    }
  }

  return (
    <div className="settings-token-option" role="group" aria-label={name} aria-busy={busy}>
      <span className="settings-sleeve-preview">
        <img src={custom ?? cardImageUrls(cardId)[0]} alt={name} />
      </span>
      <strong>{name}</strong>
      <button type="button" className="settings-token-upload" disabled={busy} onClick={() => fileRef.current?.click()}>
        {busy ? t("settings.sleeveUploading") : t("settings.playmatUpload")}
      </button>
      <input
        ref={fileRef}
        hidden
        type="file"
        accept="image/*"
        disabled={busy}
        aria-label={`${t("settings.playmatUpload")}: ${name}`}
        onChange={(event) => {
          void uploadImage(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      {custom ? (
        <button type="button" className="settings-sleeve-remove" disabled={busy} onClick={removeImage}>
          {t("settings.playmatRemove")}
        </button>
      ) : null}
      {error ? (
        <p className="settings-sleeve-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TokenArtPicker() {
  const getCardName = useTranslatedCardName();
  return (
    <div className="settings-sleeve-grid settings-token-grid">
      {customizableTokens.map((token) => (
        <TokenArtOption key={token.cardId} cardId={token.cardId} name={getCardName(token.cardId)} />
      ))}
    </div>
  );
}
