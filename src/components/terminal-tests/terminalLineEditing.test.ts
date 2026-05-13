import { describe, expect, it } from "vitest";
import type { BashShell } from "@wterm/just-bash";
import {
  handleKillLineRight,
  handleMoveWordLeft,
  handleMoveWordRight,
  handleTerminalInput,
} from "../TerminalPanel";

describe("terminal line editing", () => {
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

  it("kills the editable line to the right with Ctrl+K", async () => {
    const writes: string[] = [];
    const shell = {
      _line: "plot waveform.csv x=time",
      _cursor: 5,
      _write: (data: string) => writes.push(data),
      handleInput: async () => {},
    } as unknown as BashShell;

    handleKillLineRight(shell);
    expect(shell).toMatchObject({ _line: "plot ", _cursor: 5 });
    expect(writes).toEqual(["\x1b[K"]);

    await handleTerminalInput(shell, "\x0b");
    expect(shell).toMatchObject({ _line: "plot ", _cursor: 5 });
  });

  it("moves the editable cursor by space-delimited words", async () => {
    const writes: string[] = [];
    const shell = {
      _line: "plot waveform.csv x=time",
      _cursor: 24,
      _write: (data: string) => writes.push(data),
      handleInput: async () => {},
    } as unknown as BashShell;

    handleMoveWordLeft(shell);
    expect(shell).toMatchObject({ _cursor: 18 });
    expect(writes).toEqual(["\x1b[6D"]);

    await handleTerminalInput(shell, "\x1b[1;3D");
    expect(shell).toMatchObject({ _cursor: 5 });
    expect(writes).toEqual(["\x1b[6D", "\x1b[13D"]);

    await handleTerminalInput(shell, "\x1b[1;3C");
    expect(shell).toMatchObject({ _cursor: 17 });
    expect(writes).toEqual(["\x1b[6D", "\x1b[13D", "\x1b[12C"]);

    handleMoveWordRight(shell);
    expect(shell).toMatchObject({ _cursor: 24 });
    expect(writes).toEqual(["\x1b[6D", "\x1b[13D", "\x1b[12C", "\x1b[7C"]);
  });
});
