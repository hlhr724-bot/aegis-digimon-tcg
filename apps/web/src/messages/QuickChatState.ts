import type { Friend } from "@aegis/shared/friends/Friend";

export type QuickChatState = {
  friend?: Friend;
  expanded: boolean;
  showFriends: boolean;
  openChat: (friend: Friend) => void;
  minimize: () => void;
  showList: () => void;
  toggle: () => void;
};
