import { describe, expect, it, vi } from "vitest";
import { spectateNextSeriesGame } from "@/net/spectateNextSeriesGame";

describe("spectating the next game of a series", () => {
  it("keeps asking until the next game admits spectators", async () => {
    const spectate = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("Match is not available to spectators"))
      .mockRejectedValueOnce(new Error("Match is not available to spectators"))
      .mockResolvedValue("next-game");
    const wait = vi.fn<(milliseconds: number) => Promise<void>>(async () => {});

    await expect(spectateNextSeriesGame({ spectate, isCancelled: () => false, now: () => 0, wait })).resolves.toBe(
      "next-game",
    );
    expect(spectate).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
  });

  it("gives up once the next game had its time to start", async () => {
    let time = 0;
    const spectate = vi
      .fn<() => Promise<string>>()
      .mockRejectedValue(new Error("Match is not available to spectators"));
    const wait = vi.fn<(milliseconds: number) => Promise<void>>(async (milliseconds) => {
      time += milliseconds;
    });

    await expect(spectateNextSeriesGame({ spectate, isCancelled: () => false, now: () => time, wait })).rejects.toThrow(
      "Match is not available to spectators",
    );
    expect(time).toBe(90_000);
  });

  it("stops asking when the spectator leaves", async () => {
    const spectate = vi
      .fn<() => Promise<string>>()
      .mockRejectedValue(new Error("Match is not available to spectators"));
    const wait = vi.fn<(milliseconds: number) => Promise<void>>(async () => {});

    await expect(spectateNextSeriesGame({ spectate, isCancelled: () => true, now: () => 0, wait })).rejects.toThrow(
      "Match is not available to spectators",
    );
    expect(spectate).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });
});
