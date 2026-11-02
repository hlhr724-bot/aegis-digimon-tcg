const STORAGE_KEY = "aegis:story-guest-token";

let sessionToken: string | undefined;

function readStoredToken(): string | undefined {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function storeToken(token: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, token);
  } catch {
    return;
  }
}

export function getStoryGuestToken(): string {
  const existing = readStoredToken() ?? sessionToken;
  if (existing) {
    return existing;
  }
  const token = crypto.randomUUID();
  sessionToken = token;
  storeToken(token);
  return token;
}
