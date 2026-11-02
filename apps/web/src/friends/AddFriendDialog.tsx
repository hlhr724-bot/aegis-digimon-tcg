import { useContext, useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { MatchHistoryEntry } from "@aegis/shared/replays";
import { SocialContext } from "@/social/SocialContext";
import { AddFriendButton } from "@/friends/AddFriendButton";
import { friendsApi } from "@/friends/friendsApi";
import { getFriendErrorKey } from "@/friends/getFriendErrorKey";
import { accountApi } from "@/account/client";
import { Alert, Avatar, Button, Dialog, IconButton } from "@/design/primitives";
import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";
import type { TranslationKey } from "@/i18n/translationTypes";
import "@/friends/friends.css";

const RECENT_OPPONENT_LIMIT = 5;

type AddFriendDialogParams = { onClose: () => void };

export function AddFriendDialog({ onClose }: AddFriendDialogParams) {
  const { t } = useTranslation();
  const social = useContext(SocialContext);
  const titleId = useId();
  const inputId = useId();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<TranslationKey>();
  const [opponents, setOpponents] = useState<MatchHistoryEntry[]>([]);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => input.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    let active = true;
    void accountApi
      .matches({ page: 1, limit: 25 })
      .then((page) => {
        if (!active) {
          return;
        }
        const byOpponent = new Map<string, MatchHistoryEntry>();
        for (const match of page.matches) {
          if (match.canAddOpponent && !byOpponent.has(match.opponentName)) {
            byOpponent.set(match.opponentName, match);
          }
        }
        setOpponents([...byOpponent.values()].slice(0, RECENT_OPPONENT_LIMIT));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  async function sendRequest(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(undefined);
    try {
      const result = await friendsApi.add({ displayName: name.trim() });
      setNotice(result.accepted ? "friends.accepted" : "friends.sent");
      setName("");
      social.refresh();
    } catch (error) {
      setNotice(getFriendErrorKey(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog className="add-friend-dialog" labelledBy={titleId} onClose={onClose} closeOnBackdrop={!name}>
      <header className="add-friend-header">
        <h2 id={titleId}>{t("friends.add")}</h2>
        <IconButton label={t("common.close")} variant="ghost" onClick={onClose}>
          <Icons.X size={20} />
        </IconButton>
      </header>
      <p className="add-friend-hint">{t("friends.addDialog.hint")}</p>
      <form className="add-friend-form" onSubmit={(event) => void sendRequest(event)}>
        <label className="add-friend-field" htmlFor={inputId}>
          <Icons.User size={18} />
          <span className="aegis-sr-only">{t("friends.displayName")}</span>
          <input
            ref={input}
            id={inputId}
            autoComplete="off"
            maxLength={32}
            value={name}
            placeholder={t("friends.displayName")}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </label>
        <Button type="submit" full disabled={busy || !name.trim()}>
          {t("friends.addDialog.send")}
        </Button>
      </form>
      {notice ? (
        <Alert tone={notice === "friends.sent" || notice === "friends.accepted" ? "success" : "danger"}>
          {t(notice)}
        </Alert>
      ) : null}
      {opponents.length ? (
        <section className="add-friend-recent" aria-labelledby={`${titleId}-recent`}>
          <h3 id={`${titleId}-recent`}>{t("friends.addDialog.recent")}</h3>
          <ul>
            {opponents.map((match) => (
              <li key={match.id}>
                <Avatar name={match.opponentName} avatarId={match.opponentAvatarId} size={36} />
                <strong>{match.opponentName}</strong>
                <AddFriendButton matchId={match.id} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Dialog>
  );
}
