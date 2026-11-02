import type { RuntimeObjectDescriptor } from "#api/engine/snapshot/RuntimeObjectDescriptor";

type HydrateParams = { value: object; payload: unknown };
type Factory = {
  key: string;
  prototype?: object;
  allocate: () => object;
  hydrate: (params: HydrateParams) => void;
  describe: (value: object) => unknown;
};
type TrackParams = { value: object; key: string };
type HydrateObjectParams = HydrateParams & { key: string };

export class RuntimeObjectRegistry {
  #factories = new Map<string, Factory>();
  #keys = new WeakMap<object, string>();
  #prototypeKeys = new Map<object, string>();
  #snapshotsEnabled = true;

  get snapshotsEnabled(): boolean {
    return this.#snapshotsEnabled;
  }

  disableSnapshots(): void {
    this.#snapshotsEnabled = false;
  }

  registerFactory(factory: Factory): void {
    if (factory.key.length === 0 || this.#factories.has(factory.key)) {
      throw new Error(`Invalid or duplicate runtime object factory: ${factory.key}`);
    }
    if (factory.prototype !== undefined) {
      if (factory.prototype === Object.prototype || this.#prototypeKeys.has(factory.prototype)) {
        throw new Error("Invalid or duplicate runtime object prototype");
      }
      this.#prototypeKeys.set(factory.prototype, factory.key);
    }
    this.#factories.set(factory.key, factory);
  }

  track({ value, key }: TrackParams): void {
    if (value === null || typeof value !== "object") {
      throw new Error("Expected a runtime object");
    }
    if (!this.#factories.has(key)) {
      throw new Error(`Unknown runtime object factory: ${key}`);
    }
    const previous = this.#keys.get(value);
    if (previous !== undefined && previous !== key) {
      throw new Error("Runtime object already belongs to a different factory");
    }
    this.#keys.set(value, key);
  }

  describe(value: object): RuntimeObjectDescriptor | undefined {
    const key = this.#keys.get(value) ?? this.#prototypeKeys.get(Object.getPrototypeOf(value) as object);
    if (key === undefined) {
      return undefined;
    }
    this.track({ value, key });
    return { key, payload: this.#factories.get(key)!.describe(value) };
  }

  allocate(key: string): object {
    const factory = this.#factories.get(key);
    if (factory === undefined) {
      throw new Error(`Unknown runtime object factory: ${key}`);
    }
    const value = factory.allocate();
    if (value === null || typeof value !== "object") {
      throw new Error(`Runtime object factory did not allocate an object: ${key}`);
    }
    if (this.#keys.has(value)) {
      throw new Error("Runtime object factory reused an allocated object");
    }
    this.track({ value, key });
    return value;
  }

  hydrate({ value, key, payload }: HydrateObjectParams): void {
    if (this.#keys.get(value) !== key) {
      throw new Error("Runtime object factory does not own the allocated object");
    }
    this.#factories.get(key)!.hydrate({ value, payload });
  }
}
