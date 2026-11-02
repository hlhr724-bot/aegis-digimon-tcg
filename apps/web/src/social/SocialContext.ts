import { createContext } from "react";
import type { SocialConnection } from "@/social/SocialConnection";

export const SocialContext = createContext<SocialConnection>({
  connected: false,
  friends: [],
  invites: [],
  revision: 0,
  dismissNotice: () => {},
  invite: () => {},
  answer: () => {},
  refresh: () => {},
});
