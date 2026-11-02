export type Arena3dDeviceSignals = {
  maxTextureSize: number;
  rendererName: string;
  hardwareConcurrency: number;
  deviceMemoryGigabytes: number | undefined;
  coarsePointer: boolean;
  finePointerAvailable: boolean;
  screenShortSide: number;
};
