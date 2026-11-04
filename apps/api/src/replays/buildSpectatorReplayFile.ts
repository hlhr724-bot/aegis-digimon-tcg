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
  const closedSeat = (seat: number) => hiddenIdentities[seat] === true || sharedDeckSeats[seat] !== true;
  const players = replay.players.map((name, seat) => (hiddenIdentities[seat] ? `Player ${seat + 1}` : name)) as [
    string,
    string,
  ];
  const copy: MatchReplay = {
    ...replay,
    viewerSeat: SPECTATOR_REPLAY_SEAT,
    visibleHandSeats: [],
    players,
    ...(replay.decks
      ? { decks: replay.decks.map((deck, seat) => (closedSeat(seat) ? null : deck)) as MatchReplay["decks"] }
      : {}),
    ...(replay.deckIcons
      ? {
          deckIcons: replay.deckIcons.map((icon, seat) => (closedSeat(seat) ? null : icon)) as MatchReplay["deckIcons"],
        }
      : {}),
    frames: replay.frames.map((frame) => ({
      ...frame,
      state: {
        ...frame.state,
        players: frame.state.players.map((player) => ({
          ...player,
          hand: [],
          spectatorNamesJson: "[]",
          manualInspectionJson: "[]",
          ...(hiddenIdentities[player.seat] ? { displayName: players[player.seat]!, avatarId: "", avatarUrl: "" } : {}),
        })),
      },
      events: frame.events.filter((event) => event.kind !== "finalReveal"),
    })) as unknown as MatchReplay["frames"],
  };
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
