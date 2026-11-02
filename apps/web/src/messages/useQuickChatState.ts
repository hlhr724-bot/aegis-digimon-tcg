import { useState } from "react";
import type { Friend } from "@aegis/shared/friends/Friend";
import type { QuickChatState } from "@/messages/QuickChatState";

type ChatView = { accountId?: string; friend?: Friend; expanded: boolean; showFriends: boolean };
type UseQuickChatStateParams = { accountId?: string };

export function useQuickChatState({ accountId }: UseQuickChatStateParams): QuickChatState {
  const [view, setView] = useState<ChatView>({ expanded: false, showFriends: true });
  const current = view.accountId === accountId ? view : { accountId, expanded: false, showFriends: true };
  function openChat(friend: Friend) {
    setView({ accountId, friend, expanded: true, showFriends: false });
  }
  function minimize() {
    setView({ ...current, expanded: false });
  }
  function showList() {
    setView({ ...current, expanded: true, showFriends: true });
  }
  function toggle() {
    setView({ ...current, expanded: !current.expanded });
  }
  return { ...current, openChat, minimize, showList, toggle };
}
