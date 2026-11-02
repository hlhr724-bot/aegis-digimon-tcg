import { useCallback, useState } from "react";
import type { MatchChat } from "./useMatchChat";
import { useUnreadChatCount } from "./useUnreadChatCount";

export interface MatchChatWindow {
  open: boolean;
  unread: number;
  show: () => void;
  close: () => void;
  toggle: () => void;
}

export function useMatchChatWindow({
  chat,
  resultShown,
}: {
  chat: MatchChat | undefined;
  resultShown: boolean;
}): MatchChatWindow {
  const [open, setOpen] = useState(false);
  const unread = useUnreadChatCount(chat?.entries, open);
  const [resultSeen, setResultSeen] = useState(false);

  if (resultShown !== resultSeen) {
    setResultSeen(resultShown);
    if (resultShown && chat && chat.entries.length > 0) setOpen(true);
  }

  const show = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((current) => !current), []);
  return { open, unread, show, close, toggle };
}
