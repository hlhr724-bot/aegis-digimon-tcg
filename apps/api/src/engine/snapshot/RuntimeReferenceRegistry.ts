import type { RuntimeReferenceDescriptor } from "#api/engine/snapshot/RuntimeReferenceDescriptor";

type Factory = {
  key: string;
  describe: (value: object) => unknown | undefined;
  resolve: (payload: unknown) => object;
  beginDecode?: () => void;
};

export class RuntimeReferenceRegistry {
  #factories = new Map<string, Factory>();

  registerFactory(factory: Factory): void {
    if (factory.key.length === 0 || this.#factories.has(factory.key)) {
      throw new Error(`Invalid or duplicate runtime reference factory: ${factory.key}`);
    }
    this.#factories.set(factory.key, factory);
  }

  describe(value: object): RuntimeReferenceDescriptor | undefined {
    for (const [key, factory] of this.#factories) {
      const payload = factory.describe(value);
      if (payload !== undefined) {
        return { key, payload };
      }
    }
    return undefined;
  }

  beginDecode(): void {
    for (const factory of this.#factories.values()) {
      factory.beginDecode?.();
    }
  }

  resolve({ key, payload }: RuntimeReferenceDescriptor): object {
    const factory = this.#factories.get(key);
    if (factory === undefined) {
      throw new Error(`Unknown runtime reference factory: ${key}`);
    }
    const value = factory.resolve(payload);
    if (value === null || typeof value !== "object") {
      throw new Error(`Runtime reference factory did not return an object: ${key}`);
    }
    return value;
  }
}
