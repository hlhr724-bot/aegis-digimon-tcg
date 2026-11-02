import { describe, expect, it } from "vitest";
import { HELP, parseReplayArgs, usageFor, UsageError } from "./args.js";

describe("parseReplayArgs", () => {
  it("parses every command with its options", () => {
    expect(parseReplayArgs(["fetch", "42"])).toEqual({ command: "fetch", reportId: 42 });
    expect(parseReplayArgs(["fetch", "42", "--out", "a.json", "--url", "https://x"])).toEqual({
      command: "fetch",
      reportId: 42,
      out: "a.json",
      url: "https://x",
    });
    expect(parseReplayArgs(["extract", "m-1", "--log-dir", "logs", "--out", "b.json"])).toEqual({
      command: "extract",
      matchId: "m-1",
      logDir: "logs",
      out: "b.json",
    });
    expect(parseReplayArgs(["run", "r.json"])).toEqual({ command: "run", file: "r.json", json: false });
    expect(parseReplayArgs(["run", "r.json", "--until", "12", "--json"])).toEqual({
      command: "run",
      file: "r.json",
      until: 12,
      json: true,
    });
    expect(parseReplayArgs(["run", "r.json", "--export", "r.aegis-replay"])).toEqual({
      command: "run",
      file: "r.json",
      json: false,
      export: "r.aegis-replay",
    });
    expect(parseReplayArgs(["inputs", "r.json", "--from", "3", "--to", "9"])).toEqual({
      command: "inputs",
      file: "r.json",
      from: 3,
      to: 9,
    });
    expect(parseReplayArgs(["scaffold", "r.json", "--until", "7", "--out", "x.test.ts", "--issue", "88"])).toEqual({
      command: "scaffold",
      file: "r.json",
      until: 7,
      out: "x.test.ts",
      issue: "88",
    });
  });

  it("keeps every digit of a Discord-sized issue id", () => {
    expect(
      parseReplayArgs(["scaffold", "r.json", "--until", "7", "--out", "x.test.ts", "--issue", "1562378958815887410"]),
    ).toMatchObject({ issue: "1562378958815887410" });
  });

  it("answers help in every spelling", () => {
    expect(parseReplayArgs([])).toEqual({ command: "help" });
    expect(parseReplayArgs(["--help"])).toEqual({ command: "help" });
    expect(parseReplayArgs(["help"])).toEqual({ command: "help" });
    expect(parseReplayArgs(["help", "run"])).toEqual({ command: "help", topic: "run" });
    expect(parseReplayArgs(["scaffold", "-h"])).toEqual({ command: "help", topic: "scaffold" });
    expect(usageFor()).toBe(HELP);
    expect(usageFor("fetch")).toContain("pnpm replay fetch <reportId>");
  });

  it.each([
    [["nope"], /Unknown command "nope"/],
    [["run"], /needs its argument/],
    [["run", "a.json", "b.json"], /Unexpected argument "b.json"/],
    [["run", "a.json", "--until=-1"], /--until must be a non-negative integer/],
    [["run", "a.json", "--until", "x"], /--until must be a non-negative integer/],
    [["run", "a.json", "--out", "b"], /"run" does not take --out/],
    [["inputs", "a.json", "--from", "5", "--to", "2"], /--from 5 is after --to 2/],
    [["fetch", "0"], /positive integer/],
    [["fetch", "abc"], /positive integer/],
    [["scaffold", "a.json", "--out", "x.test.ts"], /needs --until/],
    [["scaffold", "a.json", "--until", "3"], /needs --out/],
    [["scaffold", "a.json", "--until", "3", "--out", "x.ts"], /must end in \.test\.ts/],
    [["run", "a.json", "--bogus"], /bogus/],
    [["inputs", "a.json", "--export", "b.aegis-replay"], /"inputs" does not take --export/],
    [
      ["scaffold", "a.json", "--until", "3", "--out", "x.test.ts", "--export", "b"],
      /"scaffold" does not take --export/,
    ],
    [["extract", "m-1", "--export", "b"], /"extract" does not take --export/],
    [["fetch", "42", "--export", "b"], /"fetch" does not take --export/],
  ])("rejects %j", (argv, message) => {
    expect(() => parseReplayArgs(argv)).toThrow(UsageError);
    expect(() => parseReplayArgs(argv)).toThrow(message);
  });

  it("names the command a usage error belongs to, so its usage can be shown", () => {
    let caught: unknown;
    try {
      parseReplayArgs(["scaffold", "a.json", "--until", "3"]);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(UsageError);
    expect((caught as UsageError).topic).toBe("scaffold");
  });
});
