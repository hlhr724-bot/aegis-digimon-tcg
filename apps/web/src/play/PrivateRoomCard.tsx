import { useState } from "react";
import { Button, Field } from "@/design/primitives";
import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";
import "@/play/privateRoomCard.css";

const MIN_ROOM_CODE_LENGTH = 4;
const MAX_ROOM_CODE_LENGTH = 6;

type PrivateRoomCardParams = {
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
};

export function PrivateRoomCard({ onCreateRoom, onJoinRoom }: PrivateRoomCardParams) {
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const joinable = code.length >= MIN_ROOM_CODE_LENGTH;
  return (
    <section className="private-room-card" aria-labelledby="private-room-card-title">
      <header className="private-room-card__header">
        <span className="private-room-card__icon" aria-hidden="true">
          <Icons.Link2 size={18} />
        </span>
        <div>
          <h2 id="private-room-card-title">{t("lobby.mode.private")}</h2>
          <p>{t("lobby.mode.privateDesc")}</p>
        </div>
      </header>
      <div className="private-room-card__options">
        <div className="private-room-card__option">
          <p>{t("lobby.createHint")}</p>
          <Button icon={Icons.Plus} onClick={onCreateRoom}>
            {t("lobby.createRoom")}
          </Button>
        </div>
        <form
          className="private-room-card__option"
          onSubmit={(event) => {
            event.preventDefault();
            if (joinable) {
              onJoinRoom(code);
            }
          }}
        >
          <p>{t("lobby.joinHint")}</p>
          <div className="private-room-card__join">
            <Field
              className="private-room-card__code"
              label={t("lobby.roomCodePlaceholder")}
              name="privateRoomCode"
              autoComplete="off"
              spellCheck={false}
              maxLength={MAX_ROOM_CODE_LENGTH}
              placeholder={t("lobby.roomCodePlaceholder")}
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
            />
            <Button type="submit" variant="secondary" icon={Icons.LogIn} disabled={!joinable}>
              {t("lobby.joinRoom")}
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
