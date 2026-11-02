import type { ParticipantView } from "@aegis/shared/tournaments/index";

type Params = { participants: readonly ParticipantView[]; accountId: string | undefined };

export function ownParticipant({ participants, accountId }: Params): ParticipantView | undefined {
  return accountId === undefined
    ? undefined
    : participants.find((participant) => participant.kind === "human" && participant.accountId === accountId);
}
