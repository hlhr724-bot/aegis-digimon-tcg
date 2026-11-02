type Params = {
  mutated: boolean;
  structural: boolean;
  deferredLastFrame: boolean;
  measured: boolean;
};

export function shouldDeferArenaDomRead({ mutated, structural, deferredLastFrame, measured }: Params): boolean {
  return mutated && measured && !structural && !deferredLastFrame;
}
