const CHUNK_LOAD_FAILURE =
  /Unable to preload CSS for|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/;

export function isChunkLoadError(error: unknown): boolean {
  return error instanceof Error && CHUNK_LOAD_FAILURE.test(error.message);
}
