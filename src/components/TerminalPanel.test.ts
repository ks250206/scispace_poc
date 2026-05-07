import { describe, expect, it } from "vitest";
import { handleTerminalInput } from "./TerminalPanel";
import type { BashShell } from "@wterm/just-bash";

describe("terminal input handling", () => {
  it("handles delete escape sequence as forward delete instead of printing [3~", async () => {
    const writes: string[] = [];
    const shell = {
      _line: "abcd",
      _cursor: 2,
      _write: (data: string) => writes.push(data),
      handleInput: async (data: string) => {
        writes.push(`input:${data}`);
      },
    } as unknown as BashShell;

    await handleTerminalInput(shell, "\x1b[3~");

    expect(shell).toMatchObject({ _line: "abd", _cursor: 2 });
    expect(writes).toEqual(["d\x1b[K", "\x1b[1D"]);
  });

  it("preserves input around delete escape sequences", async () => {
    const inputs: string[] = [];
    const writes: string[] = [];
    const shell = {
      _line: "abcd",
      _cursor: 1,
      _write: (data: string) => writes.push(data),
      handleInput: async (data: string) => {
        inputs.push(data);
      },
    } as unknown as BashShell;

    await handleTerminalInput(shell, "x\x1b[3~y");

    expect(inputs).toEqual(["x", "y"]);
    expect(shell).toMatchObject({ _line: "acd", _cursor: 1 });
    expect(writes).toEqual(["cd\x1b[K", "\x1b[2D"]);
  });
});
