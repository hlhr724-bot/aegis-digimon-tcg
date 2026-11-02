export function copyWithoutSharedBacking(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}
