import type { ReadyReplay } from "../files";

export interface CloudReplayFile {
  deckIcons?: [string | null, string | null];
  id: string;
  name: string;
  createdAt: number;
  bytes?: number;
  /** Where the player opens the file in the provider's own web app. */
  webViewLink?: string;
  /** "Name vs Name", when the file was saved by Aegis with its match summary. */
  players?: string;
}

/**
 * Storage the player owns, reached straight from the browser. Our API never sees the
 * provider's tokens or the replay bytes on this path.
 */
export interface ReplayCloudProvider {
  readonly name: string;
  /** Remembered on this device after a successful connect, even once the session expires. */
  isLinked(): boolean;
  /** A live session exists, so calls run without asking the player to sign in. */
  isConnected(): boolean;
  /** Loads the sign-in library early, so `connect` can open its pop-up inside the click. */
  prepare(): Promise<void>;
  /** Must run from a user gesture: it may open the provider's sign-in pop-up. */
  connect(): Promise<void>;
  /** Idempotent per match and seat: a second call returns the file saved before. */
  upload(replay: ReadyReplay): Promise<CloudReplayFile>;
  list(): Promise<CloudReplayFile[]>;
  download(file: Pick<CloudReplayFile, "id" | "bytes">): Promise<Blob>;
  /** Lets anyone with the link read the file, so the server can serve a public replay with its API key. */
  share(fileId: string): Promise<void>;
  /** Removes the link permission; a file that is already private or gone counts as done. */
  unshare(fileId: string): Promise<void>;
  /** Moves the file to the provider's trash, where the player can still restore it. */
  trash(fileId: string): Promise<void>;
  viewLink(fileId: string): string;
  disconnect(): Promise<void>;
  subscribe(listener: () => void): () => void;
}

/** The session is missing or expired; the player has to connect again with a click. */
export class CloudAuthError extends Error {
  constructor() {
    super("cloud_auth");
  }
}

export class CloudRequestError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`cloud_request_${status}`);
    this.status = status;
  }
}
