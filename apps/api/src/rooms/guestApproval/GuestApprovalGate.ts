import { GuestApproval } from "@aegis/shared/protocol/GuestApproval";
import type { GuestApprovalMessage } from "@aegis/shared/protocol/GuestApprovalMessage";
import type { GameState } from "@aegis/shared/schema/GameState";

type AdmitGuestParams = {
  guestSessionId: string;
  readyDeferred: boolean;
};

type GuestApprovalGateParams = {
  readState: () => GameState;
  readSeatedSessionIds: () => string[];
  findAccountId: (sessionId: string) => string | undefined;
  admitGuest: (params: AdmitGuestParams) => void;
  removeGuest: (guestSessionId: string) => void;
};

type HandleMessageParams = {
  senderSessionId: string;
  payload: unknown;
};

export class GuestApprovalGate {
  private hostSessionId: string | undefined;
  private deferredReadySessionId: string | undefined;
  private readonly declinedSessionIds = new Set<string>();
  private readonly declinedAccountIds = new Set<string>();

  constructor(private readonly params: GuestApprovalGateParams) {
    this.params.readState().guestApproval = GuestApproval.AWAITING_GUEST.value;
  }

  isHost(sessionId: string): boolean {
    return sessionId === this.hostSessionId;
  }

  isDeclinedAccount(accountId: string): boolean {
    return this.declinedAccountIds.has(accountId);
  }

  wasDeclined(sessionId: string): boolean {
    return this.declinedSessionIds.has(sessionId);
  }

  blocksMatchStart(): boolean {
    const status = this.params.readState().guestApproval;
    return Object.values(GuestApproval).some((entry) => entry.value === status && entry.blocksMatchStart);
  }

  noteSeated(sessionId: string): void {
    if (this.hostSessionId === undefined) {
      this.hostSessionId = sessionId;
      return;
    }
    if (sessionId !== this.hostSessionId) {
      this.params.readState().guestApproval = GuestApproval.PENDING.value;
    }
  }

  deferReady(sessionId: string): boolean {
    if (!this.blocksMatchStart() || this.isHost(sessionId)) {
      return false;
    }
    this.deferredReadySessionId = sessionId;
    return true;
  }

  noteGuestDeparted(sessionId: string): void {
    if (this.isHost(sessionId)) {
      return;
    }
    if (this.deferredReadySessionId === sessionId) {
      this.deferredReadySessionId = undefined;
    }
    this.declinedSessionIds.delete(sessionId);
    this.params.readState().guestApproval = GuestApproval.AWAITING_GUEST.value;
  }

  handleMessage({ senderSessionId, payload }: HandleMessageParams): void {
    if (!this.isHost(senderSessionId) || this.params.readState().guestApproval !== GuestApproval.PENDING.value) {
      return;
    }
    const message = readGuestApprovalMessage(payload);
    const guestSessionId = this.params.readSeatedSessionIds().find((sessionId) => !this.isHost(sessionId));
    if (
      !message ||
      guestSessionId === undefined ||
      message.guestSessionId !== guestSessionId ||
      this.declinedSessionIds.has(guestSessionId)
    ) {
      return;
    }
    if (message.accept) {
      this.params.readState().guestApproval = GuestApproval.APPROVED.value;
      const readyDeferred = this.deferredReadySessionId === guestSessionId;
      this.deferredReadySessionId = undefined;
      this.params.admitGuest({ guestSessionId, readyDeferred });
      return;
    }
    this.declinedSessionIds.add(guestSessionId);
    const accountId = this.params.findAccountId(guestSessionId);
    if (accountId !== undefined) {
      this.declinedAccountIds.add(accountId);
    }
    this.params.removeGuest(guestSessionId);
  }
}

function readGuestApprovalMessage(payload: unknown): GuestApprovalMessage | undefined {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }
  const { guestSessionId, accept } = payload as Partial<Record<keyof GuestApprovalMessage, unknown>>;
  if (typeof guestSessionId !== "string" || typeof accept !== "boolean") {
    return undefined;
  }
  return { guestSessionId, accept };
}
