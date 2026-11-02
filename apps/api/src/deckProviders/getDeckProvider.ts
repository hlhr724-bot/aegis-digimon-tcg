import { digilabProvider } from "#api/deckProviders/providers/digilab";

export function getDeckProvider(id: unknown) {
  return id === digilabProvider.value ? digilabProvider : undefined;
}
