import { useState } from "react";
import { Button } from "@/design/primitives";
import { useTranslation } from "@/i18n/useTranslation";
import { friendsApi } from "@/friends/friendsApi";
import { getFriendErrorKey } from "@/friends/getFriendErrorKey";
import type { TranslationKey } from "@/i18n/translationTypes";

type AddFriendButtonParams = { matchId: string };

export function AddFriendButton({ matchId }: AddFriendButtonParams) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [notice, setNotice] = useState<TranslationKey>();
  async function addFriend() {
    setBusy(true);
    setNotice(undefined);
    try {
      const result = await friendsApi.add({ matchId });
      setSent(true);
      setNotice(result.accepted ? "friends.accepted" : "friends.sent");
    } catch (error) {
      setNotice(getFriendErrorKey(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="friends-add-action">
      <Button size="sm" variant="ghost" disabled={busy || sent} onClick={() => void addFriend()}>
        {t(sent ? "friends.sent" : "friends.add")}
      </Button>
      {notice ? <span role="status">{t(notice)}</span> : null}
    </span>
  );
}
