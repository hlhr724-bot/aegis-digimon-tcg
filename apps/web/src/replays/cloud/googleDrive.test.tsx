// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MAX_REPLAY_BYTES } from "@aegis/shared";
import type { ReadyReplay } from "../files";
import { CloudAuthError } from "./provider";
import { createGoogleDriveProvider, DRIVE_SCOPE, DRIVE_STORAGE_KEYS, GOOGLE_IDENTITY_SCRIPT } from "./googleDrive";

const VIEW_LINK = "https://drive.google.com/file/d/file-1/view";

function readyReplay(matchId = "match-1", viewerSeat: 0 | 1 = 0): ReadyReplay {
  return {
    kind: "ready",
    summary: {
      id: matchId,
      players: ["Tai", "Matt"],
      mode: "casual",
      startedAt: 0,
      finishedAt: Date.UTC(2026, 9, 9),
      winnerSeat: 0,
      frameCount: 3,
    },
    viewerSeat,
    data: btoa("\x1f\x8breplay"),
  };
}

interface Call {
  url: URL;
  method: string;
  headers: Record<string, string>;
  body?: BodyInit | null;
}

/** A tiny Drive: routes by method and path, and records every request for assertions. */
function stubDrive({
  existing = [] as Record<string, unknown>[],
  folders = [] as { id: string }[],
  listed = [] as Record<string, unknown>[],
  uploadStatus = 200,
  file = "content",
} = {}) {
  const calls: Call[] = [];
  const fetchMock = vi.fn<typeof fetch>(async (input, init = {}) => {
    const url = new URL(String(input));
    const call = {
      url,
      method: init.method ?? "GET",
      headers: (init.headers ?? {}) as Record<string, string>,
      body: init.body,
    };
    calls.push(call);
    const json = (value: unknown, status = 200) =>
      new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
    if (url.pathname.startsWith("/upload/")) {
      const statusNow = uploadStatus;
      uploadStatus = 200;
      return statusNow === 200
        ? json({ id: "file-1", name: "aegis-match-1-player-1.aegis-replay", webViewLink: VIEW_LINK })
        : json({}, statusNow);
    }
    if (call.method === "POST") return json({ id: `folder-${calls.length}` });
    if (url.searchParams.get("alt") === "media") return new Response(file, { status: 200 });
    const query = url.searchParams.get("q") ?? "";
    if (query.includes("vnd.google-apps.folder")) return json({ files: folders });
    if (query.includes("matchId")) return json({ files: existing });
    return json({ files: listed });
  });
  vi.stubGlobal("fetch", fetchMock);
  const uploads = () => calls.filter((call) => call.url.pathname.startsWith("/upload/"));
  return { calls, fetchMock, uploads };
}

/** Stands in for Google Identity Services; `grant` decides what the pop-up returns. */
function stubIdentity(grant: { access_token?: string; error?: string } = { access_token: "fresh-token" }) {
  type TokenConfig = { client_id: string; scope: string; callback: (response: Record<string, unknown>) => void };
  const requestAccessToken = vi.fn<(overrides?: { prompt?: string }) => void>();
  const initTokenClient = vi.fn<
    (config: TokenConfig) => { requestAccessToken: (overrides?: { prompt?: string }) => void }
  >((config) => ({
    requestAccessToken: (overrides?: { prompt?: string }) => {
      requestAccessToken(overrides);
      config.callback({ ...grant, expires_in: 3599 });
    },
  }));
  const revoke = vi.fn<(token: string) => void>();
  window.google = { accounts: { oauth2: { initTokenClient, hasGrantedAllScopes: () => true, revoke } } };
  return { initTokenClient, requestAccessToken, revoke };
}

function signIn(expiresInMs = 3_600_000) {
  localStorage.setItem(
    DRIVE_STORAGE_KEYS.token,
    JSON.stringify({ token: "live-token", expiresAt: Date.now() + expiresInMs }),
  );
  localStorage.setItem(DRIVE_STORAGE_KEYS.linked, "1");
}

/** jsdom's Blob lacks `text()`, and Node's Response cannot read a jsdom Blob. */
function readText(blob: Blob): Promise<string> {
  if (typeof blob.text === "function") return blob.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsBinaryString(blob);
  });
}

async function metadataOf(call: Call) {
  const text = await readText(call.body as Blob);
  const json = text.slice(text.indexOf("{"), text.indexOf("\r\n--"));
  return { text, metadata: JSON.parse(json) as Record<string, unknown> };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  delete window.google;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  document.head.querySelectorAll("script").forEach((script) => script.remove());
});

describe("Google Drive provider", () => {
  it("asks for the drive.file scope only and remembers the device", async () => {
    const identity = stubIdentity();
    const drive = createGoogleDriveProvider("client-id");
    expect(drive.isLinked()).toBe(false);

    await drive.connect();

    expect(identity.initTokenClient).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: "client-id", scope: DRIVE_SCOPE }),
    );
    expect(DRIVE_SCOPE).toBe("https://www.googleapis.com/auth/drive.file");
    expect(drive.isConnected()).toBe(true);
    expect(drive.isLinked()).toBe(true);
  });

  it("remembers the Google account and hints it on the next sign-in", async () => {
    const identity = stubIdentity();
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ user: { emailAddress: "tai@example.com" } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const drive = createGoogleDriveProvider("client-id");

    await drive.connect();
    await waitFor(() => expect(localStorage.getItem(DRIVE_STORAGE_KEYS.account)).toBe("tai@example.com"));
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/drive/v3/about");
    expect(identity.initTokenClient.mock.calls[0]![0]).not.toHaveProperty("login_hint");

    await drive.connect();
    expect(identity.initTokenClient.mock.calls[1]![0]).toMatchObject({ login_hint: "tai@example.com" });
    expect(identity.requestAccessToken).toHaveBeenLastCalledWith({ prompt: "" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await drive.disconnect();
    expect(localStorage.getItem(DRIVE_STORAGE_KEYS.account)).toBeNull();
  });

  it("rejects a sign-in the player cancels", async () => {
    stubIdentity({ error: "access_denied" });
    const drive = createGoogleDriveProvider("client-id");
    await expect(drive.connect()).rejects.toBeInstanceOf(CloudAuthError);
    expect(drive.isLinked()).toBe(false);
  });

  it("creates the Aegis Replays folder once and uploads a multipart file into it", async () => {
    signIn();
    const drive = stubDrive();
    const provider = createGoogleDriveProvider("client-id");

    const saved = await provider.upload(readyReplay());

    expect(saved).toMatchObject({ id: "file-1", webViewLink: VIEW_LINK });
    const folderCreate = drive.calls.find(
      (call) => call.method === "POST" && !call.url.pathname.startsWith("/upload/"),
    );
    expect(JSON.parse(String(folderCreate!.body))).toEqual({
      name: "Aegis Replays",
      mimeType: "application/vnd.google-apps.folder",
    });
    const [upload] = drive.uploads();
    expect(upload!.url.origin + upload!.url.pathname).toBe("https://www.googleapis.com/upload/drive/v3/files");
    expect(upload!.url.searchParams.get("uploadType")).toBe("multipart");
    expect(upload!.headers.Authorization).toBe("Bearer live-token");
    expect(upload!.headers["Content-Type"]).toMatch(/^multipart\/related; boundary=/);
    const { text, metadata } = await metadataOf(upload!);
    expect(metadata).toEqual({
      name: "aegis-match-1-player-1.aegis-replay",
      mimeType: "application/gzip",
      parents: [expect.stringMatching(/^folder-/)],
      appProperties: { aegisReplay: "1", matchId: "match-1", viewerSeat: "0", players: "Tai vs Matt" },
    });
    expect(text).toContain("Content-Type: application/gzip\r\n\r\n\x1f");

    await provider.upload(readyReplay("match-2"));
    expect(
      drive.calls.filter((call) => call.url.searchParams.get("q")?.includes("vnd.google-apps.folder")),
    ).toHaveLength(1);
    expect(drive.uploads()).toHaveLength(2);
    expect(localStorage.getItem(DRIVE_STORAGE_KEYS.folder)).toMatch(/^folder-/);
  });

  it("reuses an existing folder found by name", async () => {
    signIn();
    const drive = stubDrive({ folders: [{ id: "existing-folder" }] });
    await createGoogleDriveProvider("client-id").upload(readyReplay());
    expect(drive.calls.some((call) => call.method === "POST" && !call.url.pathname.startsWith("/upload/"))).toBe(false);
    expect((await metadataOf(drive.uploads()[0]!)).metadata.parents).toEqual(["existing-folder"]);
  });

  it("does not upload the same match and seat twice", async () => {
    signIn();
    const drive = stubDrive({ existing: [{ id: "earlier", name: "earlier.aegis-replay", webViewLink: VIEW_LINK }] });
    const provider = createGoogleDriveProvider("client-id");

    const [first, second] = await Promise.all([provider.upload(readyReplay()), provider.upload(readyReplay())]);

    expect(first).toBe(second);
    expect(first.id).toBe("earlier");
    expect(drive.uploads()).toHaveLength(0);
    const query = drive.calls[0]!.url.searchParams.get("q")!;
    expect(query).toContain("appProperties has { key='matchId' and value='match-1' }");
    expect(query).toContain("appProperties has { key='viewerSeat' and value='0' }");
  });

  it("finds the folder again when the remembered one was deleted", async () => {
    signIn();
    localStorage.setItem(DRIVE_STORAGE_KEYS.folder, "deleted-folder");
    const drive = stubDrive({ uploadStatus: 404, folders: [{ id: "new-folder" }] });

    await createGoogleDriveProvider("client-id").upload(readyReplay());

    expect(drive.uploads()).toHaveLength(2);
    expect((await metadataOf(drive.uploads()[1]!)).metadata.parents).toEqual(["new-folder"]);
  });

  it("drops an expired or rejected session instead of calling Drive", async () => {
    signIn(30_000);
    const drive = stubDrive();
    const provider = createGoogleDriveProvider("client-id");
    expect(provider.isConnected()).toBe(false);
    await expect(provider.upload(readyReplay())).rejects.toBeInstanceOf(CloudAuthError);
    expect(drive.fetchMock).not.toHaveBeenCalled();

    signIn();
    drive.fetchMock.mockResolvedValueOnce(new Response("{}", { status: 401 }));
    await expect(provider.list()).rejects.toBeInstanceOf(CloudAuthError);
    expect(provider.isConnected()).toBe(false);
    expect(provider.isLinked()).toBe(true);
  });

  it("lists Aegis replays newest first and downloads one within the size limit", async () => {
    signIn();
    const drive = stubDrive({
      listed: [
        {
          id: "file-1",
          name: "a.aegis-replay",
          createdTime: "2026-10-09T12:00:00Z",
          size: "2048",
          webViewLink: VIEW_LINK,
          appProperties: { players: "Tai vs Matt" },
        },
      ],
    });
    const provider = createGoogleDriveProvider("client-id");

    const files = await provider.list();

    expect(files).toEqual([
      {
        id: "file-1",
        name: "a.aegis-replay",
        createdAt: Date.parse("2026-10-09T12:00:00Z"),
        bytes: 2048,
        webViewLink: VIEW_LINK,
        players: "Tai vs Matt",
      },
    ]);
    const listing = drive.calls[0]!.url.searchParams;
    expect(listing.get("orderBy")).toBe("createdTime desc");
    expect(listing.get("pageSize")).toBe("20");
    expect(listing.get("q")).toContain("key='aegisReplay' and value='1'");

    const blob = await provider.download(files[0]!);
    expect(await readText(blob)).toBe("content");
    expect(drive.calls.at(-1)!.url.pathname).toBe("/drive/v3/files/file-1");
    expect(drive.calls.at(-1)!.url.searchParams.get("alt")).toBe("media");

    await expect(provider.download({ ...files[0]!, bytes: MAX_REPLAY_BYTES + 1 })).rejects.toMatchObject({
      code: "size",
    });
  });

  it("forgets the device and revokes the token on disconnect", async () => {
    signIn();
    localStorage.setItem(DRIVE_STORAGE_KEYS.folder, "folder");
    const identity = stubIdentity();
    const provider = createGoogleDriveProvider("client-id");

    await provider.disconnect();

    expect(identity.revoke).toHaveBeenCalledWith("live-token");
    expect(provider.isLinked()).toBe(false);
    expect(provider.isConnected()).toBe(false);
    expect(localStorage.getItem(DRIVE_STORAGE_KEYS.folder)).toBeNull();
  });
});

describe("Drive save on the match result", () => {
  async function renderPrompt(props: { replayFile?: ReadyReplay; clientId?: string }) {
    if (props.clientId) vi.stubEnv("VITE_GOOGLE_CLIENT_ID", props.clientId);
    vi.resetModules();
    const { ReplaySavePrompt } = await import("../ReplaySavePrompt");
    const { I18nProvider } = await import("../../i18n");
    const onDownloadReplay = vi.fn<() => void>();
    render(
      <I18nProvider>
        <ReplaySavePrompt onDownloadReplay={onDownloadReplay} replayFile={props.replayFile} />
      </I18nProvider>,
    );
    return { onDownloadReplay };
  }

  it("uploads silently when auto-save is on and the session is live", async () => {
    signIn();
    localStorage.setItem("aegis.drive.autosave", "on");
    const drive = stubDrive();

    await renderPrompt({ clientId: "client-id", replayFile: readyReplay() });

    expect(await screen.findByText("Saved to Google Drive")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Watch now" }).getAttribute("href")).toBe(VIEW_LINK);
    expect(drive.uploads()).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Save to Google Drive" })).toBeNull();
  });

  it("waits for a click when the session expired, then signs in and uploads", async () => {
    signIn(-1);
    localStorage.setItem("aegis.drive.autosave", "on");
    const drive = stubDrive();
    const identity = stubIdentity();

    await renderPrompt({ clientId: "client-id", replayFile: readyReplay() });

    expect(screen.getByText(/Drive sign-in expired/)).toBeTruthy();
    expect(drive.fetchMock).not.toHaveBeenCalled();
    expect(identity.requestAccessToken).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Reconnect and save" }));

    expect(await screen.findByText("Saved to Google Drive")).toBeTruthy();
    expect(identity.requestAccessToken).toHaveBeenCalledWith({ prompt: "" });
    expect(drive.uploads()).toHaveLength(1);
  });

  it("keeps the download when the upload fails", async () => {
    signIn();
    localStorage.setItem("aegis.drive.autosave", "off");
    const drive = stubDrive({ uploadStatus: 500 });
    const { onDownloadReplay } = await renderPrompt({ clientId: "client-id", replayFile: readyReplay() });

    fireEvent.click(screen.getByRole("button", { name: "Save to Google Drive" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Couldn't save to Google Drive");
    expect(drive.uploads()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Download file" }));
    expect(onDownloadReplay).toHaveBeenCalled();
  });

  it("shows no Drive control and loads nothing from Google without a client id", async () => {
    stubDrive();
    await renderPrompt({ replayFile: readyReplay() });
    expect(screen.getByRole("button", { name: "Download file" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save to Google Drive" })).toBeNull();
    expect(document.querySelector(`script[src="${GOOGLE_IDENTITY_SCRIPT}"]`)).toBeNull();
  });

  it("offers no Drive save without a replay file, as for a spectator", async () => {
    signIn();
    localStorage.setItem("aegis.drive.autosave", "on");
    const drive = stubDrive();
    await renderPrompt({ clientId: "client-id" });
    expect(screen.queryByRole("button", { name: "Save to Google Drive" })).toBeNull();
    expect(drive.fetchMock).not.toHaveBeenCalled();
  });
});

describe("Drive settings and library", () => {
  async function load(clientId = "client-id") {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", clientId);
    vi.resetModules();
    return {
      ...(await import("./CloudReplaySettings")),
      ...(await import("./CloudReplayLibrary")),
      ...(await import("../../i18n")),
    };
  }

  it("connects from Settings when auto-save is turned on", async () => {
    const identity = stubIdentity();
    const { CloudReplaySettings, I18nProvider } = await load();
    render(
      <I18nProvider>
        <CloudReplaySettings />
      </I18nProvider>,
    );
    const toggle = screen.getByRole("switch", { name: /Save replays to Google Drive automatically/ });

    fireEvent.click(toggle);

    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("true"));
    expect(identity.requestAccessToken).toHaveBeenCalledWith(undefined);
    expect(localStorage.getItem("aegis.drive.autosave")).toBe("on");
    expect(screen.getByText("Google Drive is connected on this device.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(await screen.findByRole("button", { name: "Connect Google Drive" })).toBeTruthy();
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });

  it("lists Drive replays and opens one in the local viewer", async () => {
    signIn();
    stubDrive({
      listed: [{ id: "file-1", name: "a.aegis-replay", createdTime: "2026-10-09T12:00:00Z", webViewLink: VIEW_LINK }],
    });
    const { CloudReplayLibrary, I18nProvider } = await load();
    const onOpen = vi.fn<(file: Blob) => Promise<void>>(async () => undefined);
    render(
      <I18nProvider>
        <CloudReplayLibrary onOpen={onOpen} />
      </I18nProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Watch now/ }));

    await waitFor(() => expect(onOpen).toHaveBeenCalled());
    expect(await readText(onOpen.mock.calls[0]![0])).toBe("content");
    expect(screen.getByRole("link", { name: "Open in Drive" }).getAttribute("href")).toBe(VIEW_LINK);
  });
});

describe("Google Drive sharing and trash", () => {
  function stubMutations(status = 200) {
    const calls: Call[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input, init = {}) => {
        calls.push({
          url: new URL(String(input)),
          method: init.method ?? "GET",
          headers: (init.headers ?? {}) as Record<string, string>,
          body: init.body,
        });
        return new Response(status === 204 ? null : "{}", { status });
      }),
    );
    return calls;
  }

  it("grants and removes the anyone-with-link reader permission", async () => {
    signIn();
    const calls = stubMutations();
    const provider = createGoogleDriveProvider("client-id");
    await provider.share("file-1");
    await provider.unshare("file-1");
    expect(calls.map((call) => [call.method, call.url.pathname])).toEqual([
      ["POST", "/drive/v3/files/file-1/permissions"],
      ["DELETE", "/drive/v3/files/file-1/permissions/anyoneWithLink"],
    ]);
    expect(JSON.parse(String(calls[0]!.body))).toEqual({ role: "reader", type: "anyone" });
    expect(calls.every((call) => call.headers.Authorization === "Bearer live-token")).toBe(true);
  });

  it("moves a file to the trash and treats a missing file or permission as done", async () => {
    signIn();
    const calls = stubMutations(404);
    const provider = createGoogleDriveProvider("client-id");
    await provider.trash("file-1");
    await provider.unshare("file-1");
    expect(calls[0]).toMatchObject({ method: "PATCH" });
    expect(calls[0]!.url.pathname).toBe("/drive/v3/files/file-1");
    expect(JSON.parse(String(calls[0]!.body))).toEqual({ trashed: true });
    await expect(provider.share("file-1")).rejects.toMatchObject({ status: 404 });
  });

  it("needs a live session and links to the Drive viewer", async () => {
    stubMutations();
    const provider = createGoogleDriveProvider("client-id");
    await expect(provider.trash("file-1")).rejects.toBeInstanceOf(CloudAuthError);
    expect(provider.viewLink("file-1")).toBe(VIEW_LINK);
  });
});

it("persists consent-filtered cover IDs in Drive metadata and restores them without downloading the replay", async () => {
  signIn();
  const drive = stubDrive({
    listed: [{ id: "icons", name: "replay", appProperties: { players: "Tai vs Matt", deckIcon0: "BT1-010" } }],
  });
  const provider = createGoogleDriveProvider("client-id");
  const replay = readyReplay();
  replay.summary.deckIcons = ["BT1-010", null];
  await provider.upload(replay);
  const metadata = await readText(drive.uploads()[0]!.body as Blob);
  expect(metadata).toContain('"deckIcon0":"BT1-010"');
  expect(metadata).not.toContain('"deckIcon1"');
  expect(metadata).not.toContain('"mainDeck"');
  expect((await provider.list())[0]?.deckIcons).toEqual(["BT1-010", null]);
});
