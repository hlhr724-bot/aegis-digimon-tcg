export type ActiveMatchEntry = {
  accountId: string;
  roomId: string;
};

export interface ActiveMatchDirectory {
  publish(entry: ActiveMatchEntry): Promise<void>;
  find(accountId: string): Promise<string | undefined>;
  release(entry: ActiveMatchEntry): Promise<void>;
}
