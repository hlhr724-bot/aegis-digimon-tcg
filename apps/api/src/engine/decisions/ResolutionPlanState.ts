export type ResolutionPlanState = {
  order: string[];
  presets: Map<string, boolean>;
  seen: Set<string>;
  activationKeys: Map<object, Map<string, string>>;
  usedKeys: Set<string>;
  grantSourceInstances: Map<number, string>;
};
