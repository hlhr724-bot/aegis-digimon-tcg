export type CapturedSearchRootDigest = {
  file: string;
  action: number;
  report: unknown;
  rollouts: { action: number; sample: number; reward: number; valid: boolean; reason: string; state: string }[];
};
