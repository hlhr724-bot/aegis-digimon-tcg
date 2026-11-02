import type { TriggerInfo } from "#api/engine/effects/context/triggers";

export class MatchedTriggerHistory {
  #events = new WeakSet<TriggerInfo>();
  #references = new Set<WeakRef<TriggerInfo>>();
  #finalizer = new FinalizationRegistry<WeakRef<TriggerInfo>>((reference) => {
    this.#references.delete(reference);
  });

  has(event: TriggerInfo): boolean {
    return this.#events.has(event);
  }

  add(event: TriggerInfo): void {
    if (this.#events.has(event)) {
      return;
    }
    this.#events.add(event);
    const reference = new WeakRef(event);
    this.#references.add(reference);
    this.#finalizer.register(event, reference);
  }

  snapshot(): TriggerInfo[] {
    const events: TriggerInfo[] = [];
    for (const reference of this.#references) {
      const event = reference.deref();
      if (event === undefined) {
        this.#references.delete(reference);
      } else {
        events.push(event);
      }
    }
    return events;
  }

  restore(value: unknown): void {
    if (
      !Array.isArray(value) ||
      value.some((event) => event === null || typeof event !== "object" || Array.isArray(event))
    ) {
      throw new Error("Invalid matched trigger history");
    }
    this.#events = new WeakSet();
    this.#references.clear();
    for (const event of value) {
      this.add(event as TriggerInfo);
    }
  }
}
