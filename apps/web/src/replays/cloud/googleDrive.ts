import { MAX_REPLAY_BYTES } from "@aegis/shared";
import { ReplayFileError, replayBlob, replayFileName, type ReadyReplay } from "../files";
import { CloudAuthError, CloudRequestError, type CloudReplayFile, type ReplayCloudProvider } from "./provider";

/** Only files this app creates or the player opens with it; no restricted-scope review. */
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const DRIVE_FOLDER_NAME = "Aegis Replays";
export const GOOGLE_IDENTITY_SCRIPT = "https://accounts.google.com/gsi/client";
const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";
const DRIVE_ABOUT = "https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const FILE_FIELDS = "id,name,createdTime,size,webViewLink,appProperties";
const LIST_LIMIT = 20;
/** Drive caps each app property at 124 bytes for key and value together. */
const APP_PROPERTY_BYTES = 124;
/** Treat a token as expired a minute early so a request never starts with seconds left. */
const EXPIRY_MARGIN_MS = 60_000;

export const DRIVE_STORAGE_KEYS = {
  token: "aegis.drive.token",
  linked: "aegis.drive.linked",
  folder: "aegis.drive.folder",
  /** The Google account last connected here, sent as `login_hint` to skip the account chooser. */
  account: "aegis.drive.account",
} as const;

interface TokenResponse {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
}

interface GoogleOAuth2 {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    login_hint?: string;
    callback: (response: TokenResponse) => void;
    error_callback?: (error: { type?: string }) => void;
  }): { requestAccessToken(overrides?: { prompt?: string }): void };
  hasGrantedAllScopes(response: TokenResponse, scope: string): boolean;
  revoke(token: string, done?: () => void): void;
}

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2 } };
  }
}

interface DriveFile {
  id: string;
  name: string;
  createdTime?: string;
  size?: string;
  webViewLink?: string;
  appProperties?: Record<string, string>;
}

function readStorage(storage: () => Storage, key: string): string | undefined {
  try {
    return storage().getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeStorage(storage: () => Storage, key: string, value: string | undefined): void {
  try {
    if (value === undefined) storage().removeItem(key);
    else storage().setItem(key, value);
  } catch {
    // Without storage the session still works until the page closes.
  }
}

const local = () => localStorage;

function quote(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function fitAppProperty(key: string, value: string): string {
  const encoder = new TextEncoder();
  const budget = APP_PROPERTY_BYTES - encoder.encode(key).length;
  let fitted = value;
  while (encoder.encode(fitted).length > budget) fitted = Array.from(fitted).slice(0, -1).join("");
  return fitted;
}

function toCloudFile(file: DriveFile): CloudReplayFile {
  return {
    id: file.id,
    name: file.name,
    createdAt: file.createdTime ? Date.parse(file.createdTime) : 0,
    bytes: file.size === undefined ? undefined : Number(file.size),
    webViewLink: file.webViewLink,
    players: file.appProperties?.players,
    ...(file.appProperties?.deckIcon0 || file.appProperties?.deckIcon1
      ? {
          deckIcons: [file.appProperties?.deckIcon0 || null, file.appProperties?.deckIcon1 || null] as [
            string | null,
            string | null,
          ],
        }
      : {}),
  };
}

/** Drive's fixed id for the "anyone with the link" permission. */
const ANYONE_PERMISSION = "anyoneWithLink";

export function driveViewLink(fileId: string): string {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
}

async function ignoreMissing(work: Promise<unknown>): Promise<void> {
  try {
    await work;
  } catch (error) {
    if (!(error instanceof CloudRequestError && error.status === 404)) throw error;
  }
}

let identityScript: Promise<GoogleOAuth2> | undefined;

function loadGoogleIdentity(): Promise<GoogleOAuth2> {
  const ready = window.google?.accounts?.oauth2;
  if (ready) return Promise.resolve(ready);
  identityScript ??= new Promise<GoogleOAuth2>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GOOGLE_IDENTITY_SCRIPT;
    script.async = true;
    script.onload = () => {
      const oauth = window.google?.accounts?.oauth2;
      if (oauth) resolve(oauth);
      else reject(new Error("google_identity_unavailable"));
    };
    script.onerror = () => {
      identityScript = undefined;
      script.remove();
      reject(new Error("google_identity_unavailable"));
    };
    document.head.append(script);
  });
  return identityScript;
}

export function createGoogleDriveProvider(clientId: string): ReplayCloudProvider {
  const listeners = new Set<() => void>();
  const uploads = new Map<string, Promise<CloudReplayFile>>();
  let identity: GoogleOAuth2 | undefined;
  let folder: Promise<string> | undefined;

  const notify = () => {
    for (const listener of listeners) listener();
  };

  function accessToken(): string | undefined {
    const stored = readStorage(local, DRIVE_STORAGE_KEYS.token);
    if (!stored) return undefined;
    try {
      const { token, expiresAt } = JSON.parse(stored) as { token?: unknown; expiresAt?: unknown };
      if (typeof token === "string" && typeof expiresAt === "number" && expiresAt - EXPIRY_MARGIN_MS > Date.now())
        return token;
    } catch {
      // A malformed entry counts as no session.
    }
    return undefined;
  }

  function dropSession() {
    writeStorage(local, DRIVE_STORAGE_KEYS.token, undefined);
    notify();
  }

  async function request(
    url: string,
    init: { method?: string; headers?: Record<string, string>; body?: BodyInit } = {},
  ) {
    const token = accessToken();
    if (!token) throw new CloudAuthError();
    const response = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
    if (response.status === 401) {
      dropSession();
      throw new CloudAuthError();
    }
    if (!response.ok) throw new CloudRequestError(response.status);
    return response;
  }

  async function search(query: string, options: Record<string, string> = {}): Promise<DriveFile[]> {
    const params = new URLSearchParams({ q: query, spaces: "drive", fields: `files(${FILE_FIELDS})`, ...options });
    const response = await request(`${DRIVE_FILES}?${params}`);
    return ((await response.json()) as { files?: DriveFile[] }).files ?? [];
  }

  async function findOrCreateFolder(): Promise<string> {
    const cached = readStorage(local, DRIVE_STORAGE_KEYS.folder);
    if (cached) return cached;
    const [found] = await search(
      `mimeType=${quote(FOLDER_MIME)} and name=${quote(DRIVE_FOLDER_NAME)} and trashed=false`,
      { pageSize: "1" },
    );
    let id = found?.id;
    if (!id) {
      const response = await request(`${DRIVE_FILES}?fields=id`, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=UTF-8" },
        body: JSON.stringify({ name: DRIVE_FOLDER_NAME, mimeType: FOLDER_MIME }),
      });
      id = ((await response.json()) as { id: string }).id;
    }
    writeStorage(local, DRIVE_STORAGE_KEYS.folder, id);
    return id;
  }

  function folderId(): Promise<string> {
    folder ??= findOrCreateFolder().catch((error: unknown) => {
      folder = undefined;
      throw error;
    });
    return folder;
  }

  async function rememberAccount(token: string) {
    try {
      const response = await fetch(DRIVE_ABOUT, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) return;
      const email = ((await response.json()) as { user?: { emailAddress?: string } }).user?.emailAddress;
      if (email) writeStorage(local, DRIVE_STORAGE_KEYS.account, email);
    } catch {
      // Without the hint the next sign-in shows Google's account chooser.
    }
  }

  function forgetFolder() {
    folder = undefined;
    writeStorage(local, DRIVE_STORAGE_KEYS.folder, undefined);
  }

  async function sendFile(replay: ReadyReplay, parent: string): Promise<DriveFile> {
    const boundary = `aegis-replay-${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    const players = replay.summary.players.join(" vs ");
    const metadata = {
      name: replayFileName(replay),
      mimeType: "application/gzip",
      parents: [parent],
      appProperties: {
        aegisReplay: "1",
        ...(replay.summary.deckIcons?.[0]
          ? { deckIcon0: fitAppProperty("deckIcon0", replay.summary.deckIcons[0]) }
          : {}),
        ...(replay.summary.deckIcons?.[1]
          ? { deckIcon1: fitAppProperty("deckIcon1", replay.summary.deckIcons[1]) }
          : {}),
        matchId: fitAppProperty("matchId", replay.summary.id),
        viewerSeat: String(replay.viewerSeat),
        players: fitAppProperty("players", players),
      },
    };
    const body = new Blob(
      [
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
        `--${boundary}\r\nContent-Type: application/gzip\r\n\r\n`,
        replayBlob(replay),
        `\r\n--${boundary}--\r\n`,
      ],
      { type: `multipart/related; boundary=${boundary}` },
    );
    const response = await request(`${DRIVE_UPLOAD}?uploadType=multipart&fields=${FILE_FIELDS}`, {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    });
    return (await response.json()) as DriveFile;
  }

  async function uploadOnce(replay: ReadyReplay): Promise<CloudReplayFile> {
    const [existing] = await search(
      [
        `appProperties has { key='aegisReplay' and value='1' }`,
        `appProperties has { key='matchId' and value=${quote(fitAppProperty("matchId", replay.summary.id))} }`,
        `appProperties has { key='viewerSeat' and value=${quote(String(replay.viewerSeat))} }`,
        "trashed=false",
      ].join(" and "),
      { pageSize: "1" },
    );
    if (existing) return toCloudFile(existing);
    try {
      return toCloudFile(await sendFile(replay, await folderId()));
    } catch (error) {
      // The remembered folder was deleted from Drive: find or create it again, once.
      if (!(error instanceof CloudRequestError && error.status === 404)) throw error;
      forgetFolder();
      return toCloudFile(await sendFile(replay, await folderId()));
    }
  }

  return {
    name: "Google Drive",
    isLinked: () => readStorage(local, DRIVE_STORAGE_KEYS.linked) === "1",
    isConnected: () => accessToken() !== undefined,
    async prepare() {
      identity ??= await loadGoogleIdentity();
    },
    async connect() {
      // With the library already loaded the pop-up opens in the same task as the click,
      // which is what browsers require before they allow it.
      const oauth = identity ?? (await loadGoogleIdentity());
      identity = oauth;
      const linked = readStorage(local, DRIVE_STORAGE_KEYS.linked) === "1";
      const account = readStorage(local, DRIVE_STORAGE_KEYS.account);
      await new Promise<void>((resolve, reject) => {
        const client = oauth.initTokenClient({
          client_id: clientId,
          scope: DRIVE_SCOPE,
          ...(account ? { login_hint: account } : {}),
          callback: (response) => {
            if (response.error || !response.access_token || !oauth.hasGrantedAllScopes(response, DRIVE_SCOPE)) {
              reject(new CloudAuthError());
              return;
            }
            const expiresAt = Date.now() + Number(response.expires_in ?? 3600) * 1000;
            // Shared by every tab, so a new tab auto-saves until the hour-long token expires.
            writeStorage(local, DRIVE_STORAGE_KEYS.token, JSON.stringify({ token: response.access_token, expiresAt }));
            writeStorage(local, DRIVE_STORAGE_KEYS.linked, "1");
            if (!account) void rememberAccount(response.access_token);
            notify();
            resolve();
          },
          error_callback: () => reject(new CloudAuthError()),
        });
        client.requestAccessToken(linked ? { prompt: "" } : undefined);
      });
    },
    upload(replay) {
      const key = `${replay.summary.id}:${replay.viewerSeat}`;
      let pending = uploads.get(key);
      if (!pending) {
        pending = uploadOnce(replay);
        uploads.set(key, pending);
        pending.catch(() => uploads.delete(key));
      }
      return pending;
    },
    async list() {
      const files = await search(`appProperties has { key='aegisReplay' and value='1' } and trashed=false`, {
        orderBy: "createdTime desc",
        pageSize: String(LIST_LIMIT),
      });
      return files.map(toCloudFile);
    },
    async download(file) {
      if (file.bytes !== undefined && file.bytes > MAX_REPLAY_BYTES) throw new ReplayFileError("size");
      const response = await request(`${DRIVE_FILES}/${encodeURIComponent(file.id)}?alt=media`);
      if (Number(response.headers.get("Content-Length") ?? 0) > MAX_REPLAY_BYTES) {
        await response.body?.cancel();
        throw new ReplayFileError("size");
      }
      return response.blob();
    },
    async share(fileId) {
      await request(`${DRIVE_FILES}/${encodeURIComponent(fileId)}/permissions?fields=id`, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=UTF-8" },
        body: JSON.stringify({ role: "reader", type: "anyone" }),
      });
    },
    async unshare(fileId) {
      await ignoreMissing(
        request(`${DRIVE_FILES}/${encodeURIComponent(fileId)}/permissions/${ANYONE_PERMISSION}`, {
          method: "DELETE",
        }),
      );
    },
    async trash(fileId) {
      await ignoreMissing(
        request(`${DRIVE_FILES}/${encodeURIComponent(fileId)}?fields=id`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json; charset=UTF-8" },
          body: JSON.stringify({ trashed: true }),
        }),
      );
    },
    viewLink: driveViewLink,
    async disconnect() {
      const token = accessToken();
      writeStorage(local, DRIVE_STORAGE_KEYS.token, undefined);
      writeStorage(local, DRIVE_STORAGE_KEYS.linked, undefined);
      writeStorage(local, DRIVE_STORAGE_KEYS.account, undefined);
      forgetFolder();
      uploads.clear();
      notify();
      if (!token) return;
      try {
        (identity ?? (await loadGoogleIdentity())).revoke(token);
      } catch {
        // The local session is gone either way; the grant stays listed in the Google account.
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
