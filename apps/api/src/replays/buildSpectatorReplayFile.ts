import type { MatchReplay } from "@aegis/shared/replays";
import { SPECTATOR_REPLAY_SEAT } from "@aegis/shared/replays/spectatorReplaySeat";
import type { ParticipantReplayFile } from "#api/replays/recording";

type BuildSpectatorReplayFileParams = {
  replay: MatchReplay;
  hiddenIdentities: readonly boolean[];
  sharedDeckSeats?: readonly boolean[];
};

export function buildSpectatorReplayFile({
  replay,
  hiddenIdentities,
  sharedDeckSeats = [],
}: BuildSpectatorReplayFileParams): ParticipantReplayFile {
  const copy = structuredClone(replay);
  copy.viewerSeat = SPECTATOR_REPLAY_SEAT;
  copy.visibleHandSeats = [];
  for (const seat of [0, 1] as const) {
    if (hiddenIdentities[seat] || !sharedDeckSeats[seat]) {
      if (copy.decks) {
        copy.decks[seat] = null;
      }
      if (copy.deckIcons) {
        copy.deckIcons[seat] = null;
      }
    }
  }
  copy.players = copy.players.map((name, seat) => (hiddenIdentities[seat] ? `Player ${seat + 1}` : name)) as [
    string,
    string,
  ];
  for (const frame of copy.frames) {
    for (const player of frame.state.players) {
      player.hand = [] as never;
      player.spectatorNamesJson = "[]";
      player.manualInspectionJson = "[]";
      if (hiddenIdentities[player.seat]) {
        player.displayName = copy.players[player.seat];
        player.avatarId = "";
      }
    }
    frame.events = frame.events.filter((event) => event.kind !== "finalReveal");
  }
  const {
    decks: _decks,
    frames: _frames,
    format: _format,
    version: _version,
    viewerSeat: _viewerSeat,
    visibleHandSeats: _visibleHandSeats,
    ...summary
  } = copy;
  return { summary, json: JSON.stringify(copy) };
}
