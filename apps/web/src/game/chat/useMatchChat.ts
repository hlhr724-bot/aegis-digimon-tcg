import { useCallback, useEffect, useRef, useState } from "react";
import { CHAT_CHANNEL, CHAT_COOLDOWN_MS, type ChatBroadcast, type ChatMessage, type Seat } from "@aegis/shared";
import { playSound } from "../../design/sound";
import type { AegisRoom } from "../../net/client";
import { isChatSoundEnabled } from "./chatSound";

const HISTORY_LIMIT = 50;
/** Network jitter can bring two sends closer together on the server than they left the client. */
const COOLDOWN_MARGIN_MS = 250;

export interface ChatEntry extends ChatBroadcast {
  id: number;
  /** Sent by this client: the viewer's seat, or this spectator's own session. */
  own: boolean;
}

export interface MatchChat {
  roomId?: string;
  /** Oldest first, without whatever the viewer has muted. */
  entries: readonly ChatEntry[];
  /** The newest player message from each seat, for the speech bubbles. */
  latest: Partial<Record<Seat, ChatEntry>>;
  mutedOpponent: boolean;
  setMutedOpponent: (muted: boolean) => void;
  mutedSpectators: boolean;
  setMutedSpectators: (muted: boolean) => void;
  /** Absent while there is no open room to send through. */
  send: ((message: ChatMessage) => void) | undefined;
  /** True while the server would drop a new message from this sender. */
  coolingDown: boolean;
}

/**
 * Listens on the chat channel of `room`. Messages are shown only after the server echoes
 * them, so a message the server dropped never appears as sent.
 */
export function useMatchChat({
  room,
  viewerSeat,
  spectating,
}: {
  room: AegisRoom | undefined;
  viewerSeat: Seat;
  spectating: boolean;
}): MatchChat {
  const [entries, setEntries] = useState<readonly ChatEntry[]>([]);
  const [mutedOpponent, setMutedOpponent] = useState(false);
  const [mutedSpectators, setMutedSpectators] = useState(false);
  const [coolingDown, setCoolingDown] = useState(false);
  const nextIdRef = useRef(0);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!room) return;
    return room.onMessage<ChatBroadcast>(CHAT_CHANNEL, (broadcast) => {
      const { sender } = broadcast;
      const own =
        sender.kind === "player" ? !spectating && sender.seat === viewerSeat : sender.sessionId === room.sessionId;
      const entry = { ...broadcast, id: nextIdRef.current++, own };
      setEntries((previous) => [...previous.slice(1 - HISTORY_LIMIT), entry]);
      const viewer = { viewerSeat, spectating, mutedOpponent, mutedSpectators };
      if (!own && isChatSoundEnabled() && isEntryShown({ entry, viewer })) {
        playSound("prompt");
      }
    });
  }, [room, viewerSeat, spectating, mutedOpponent, mutedSpectators]);

  useEffect(() => () => clearTimeout(cooldownTimerRef.current), []);

  const send = useCallback(
    (message: ChatMessage) => {
      if (!room?.connection?.isOpen || cooldownTimerRef.current !== undefined) return;
      room.send(CHAT_CHANNEL, message);
      setCoolingDown(true);
      cooldownTimerRef.current = setTimeout(() => {
        cooldownTimerRef.current = undefined;
        setCoolingDown(false);
      }, CHAT_COOLDOWN_MS + COOLDOWN_MARGIN_MS);
    },
    [room],
  );

  const viewer = { viewerSeat, spectating, mutedOpponent, mutedSpectators };
  const shown = entries.filter((entry) => isEntryShown({ entry, viewer }));
  const latest: Partial<Record<Seat, ChatEntry>> = {};
  for (const entry of shown) if (entry.sender.kind === "player") latest[entry.sender.seat] = entry;

  return {
    roomId: room?.roomId,
    entries: shown,
    latest,
    mutedOpponent,
    setMutedOpponent,
    mutedSpectators,
    setMutedSpectators,
    send: room ? send : undefined,
    coolingDown,
  };
}

type ChatViewer = {
  viewerSeat: Seat;
  spectating: boolean;
  mutedOpponent: boolean;
  mutedSpectators: boolean;
};

type IsEntryShownParams = {
  entry: Pick<ChatEntry, "own" | "sender">;
  viewer: ChatViewer;
};

function isEntryShown({ entry, viewer }: IsEntryShownParams): boolean {
  if ((entry.sender.kind === "spectator") !== viewer.spectating) {
    return false;
  }
  if (entry.own) {
    return true;
  }
  if (entry.sender.kind === "spectator") {
    return !viewer.mutedSpectators;
  }
  return !(viewer.mutedOpponent && !viewer.spectating && entry.sender.seat !== viewer.viewerSeat);
}
