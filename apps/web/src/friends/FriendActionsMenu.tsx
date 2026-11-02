import { useState } from "react";
import { DropdownMenu } from "radix-ui";
import { RemoveFriendDialog } from "@/friends/RemoveFriendDialog";
import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";
import { friendsApi } from "@/friends/friendsApi";

type FriendActionsMenuParams = {
  accountId: string;
  displayName: string;
  canRemove: boolean;
  busy: boolean;
  onAction: (action: () => Promise<unknown>) => Promise<void>;
  onChallenge?: () => void;
  challengeDisabled?: boolean;
};

export function FriendActionsMenu({
  accountId,
  displayName,
  canRemove,
  busy,
  onAction,
  onChallenge,
  challengeDisabled = false,
}: FriendActionsMenuParams) {
  const { t } = useTranslation();
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  return (
    <>
      <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger asChild>
          <button type="button" className="friends-more" aria-label={t("friends.more", { name: displayName })}>
            <Icons.MoreHorizontal size={20} />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="friends-more-actions"
            data-arena-native-input
            align="end"
            sideOffset={8}
            collisionPadding={12}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
              }
            }}
          >
            {onChallenge ? (
              <DropdownMenu.Item disabled={busy || challengeDisabled} onSelect={onChallenge}>
                <Icons.Swords size={16} />
                {t("friends.challenge")}
              </DropdownMenu.Item>
            ) : null}
            {canRemove ? (
              <DropdownMenu.Item disabled={busy} onSelect={() => setConfirmingRemove(true)}>
                {t("friends.remove")}
              </DropdownMenu.Item>
            ) : null}
            <DropdownMenu.Item disabled={busy} onSelect={() => void onAction(() => friendsApi.block(accountId))}>
              {t("friends.block")}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {confirmingRemove ? (
        <RemoveFriendDialog
          displayName={displayName}
          busy={busy}
          onClose={() => setConfirmingRemove(false)}
          onConfirm={() => {
            setConfirmingRemove(false);
            void onAction(() => friendsApi.remove(accountId));
          }}
        />
      ) : null}
    </>
  );
}
