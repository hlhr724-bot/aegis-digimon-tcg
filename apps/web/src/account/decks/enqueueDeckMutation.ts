type Params = {
  pending: Map<string, Promise<void>>;
  deckId: string;
  perform: () => Promise<void>;
};

export function enqueueDeckMutation({ pending, deckId, perform }: Params): Promise<void> {
  const previous = pending.get(deckId) ?? Promise.resolve();
  const mutation = previous.catch(() => undefined).then(perform);
  pending.set(deckId, mutation);
  void mutation
    .finally(() => {
      if (pending.get(deckId) === mutation) {
        pending.delete(deckId);
      }
    })
    .catch(() => undefined);
  return mutation;
}
