const UNSAFE_CHARACTERS = new RegExp("[\\p{Cc}\\u202A-\\u202E\\u2066-\\u2069]", "gu");

export function normalizeReplayNoteText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(UNSAFE_CHARACTERS, " ").replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
