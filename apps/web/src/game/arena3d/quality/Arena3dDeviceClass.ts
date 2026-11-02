export const Arena3dDeviceClass = {
  DESKTOP: { name: "DESKTOP", value: "desktop", touchFirst: false },
  TABLET: { name: "TABLET", value: "tablet", touchFirst: true },
  PHONE: { name: "PHONE", value: "phone", touchFirst: true },
} as const;

export type Arena3dDeviceClass = (typeof Arena3dDeviceClass)[keyof typeof Arena3dDeviceClass]["value"];

export type Arena3dDeviceClassEntry = (typeof Arena3dDeviceClass)[keyof typeof Arena3dDeviceClass];
