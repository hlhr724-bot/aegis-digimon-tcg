import type { RuntimeCallback } from "#api/engine/snapshot/RuntimeCallback";
import type { RuntimeCallbackDescriptor } from "#api/engine/snapshot/RuntimeCallbackDescriptor";

type TrackParams = RuntimeCallbackDescriptor & { callback: RuntimeCallback };

type RegisterParams = {
  key: string;
  create: (payload: unknown) => RuntimeCallback;
  snapshotPayload?: (payload: unknown) => unknown;
};

export class RuntimeCallbackRegistry {
  #factories = new Map<string, RegisterParams>();
  #descriptors = new WeakMap<RuntimeCallback, RuntimeCallbackDescriptor>();

  registerFactory(factory: RegisterParams): void {
    const { key } = factory;
    if (key.length === 0 || this.#factories.has(key)) {
      throw new Error(`Invalid or duplicate runtime callback factory: ${key}`);
    }
    this.#factories.set(key, factory);
  }

  create<T extends RuntimeCallback>({ key, payload }: RuntimeCallbackDescriptor): T {
    const factory = this.#factories.get(key);
    if (factory === undefined) {
      throw new Error(`Unknown runtime callback factory: ${key}`);
    }
    const callback = factory.create(payload);
    if (typeof callback !== "function") {
      throw new Error(`Runtime callback factory did not return a function: ${key}`);
    }
    this.track({ callback, key, payload });
    return callback as T;
  }

  track({ callback, key, payload }: TrackParams): void {
    if (typeof callback !== "function" || !this.#factories.has(key)) {
      throw new Error(`Invalid runtime callback registration: ${key}`);
    }
    if (this.#descriptors.has(callback)) {
      throw new Error("Runtime callback already has a snapshot descriptor");
    }
    this.#descriptors.set(callback, { key, payload });
  }

  describe(callback: RuntimeCallback): RuntimeCallbackDescriptor {
    const descriptor = this.#descriptors.get(callback);
    if (descriptor === undefined) {
      throw new Error("Runtime callback has no snapshot descriptor");
    }
    const snapshotPayload = this.#factories.get(descriptor.key)!.snapshotPayload;
    return {
      key: descriptor.key,
      payload: snapshotPayload === undefined ? descriptor.payload : snapshotPayload(descriptor.payload),
    };
  }
}
