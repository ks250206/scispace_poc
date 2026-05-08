import { describe, expect, it, vi } from "vitest";
import {
  calculateTerminalGrid,
  clearTerminalScrollbackRows,
  executeTerminalFsCommand,
  handleTerminalInput,
  normalizeTerminalOutput,
  scrollTerminalToBottom,
  terminalCommandLineText,
  writeTerminalOutput,
} from "./TerminalPanel";
import type { BashShell } from "@wterm/just-bash";

describe("terminal input handling", () => {
  it("keeps terminal grid sizing stable under workspace scale", () => {
    const base = {
      viewportWidth: 800,
      viewportHeight: 400,
      charWidth: 8,
      rowHeight: 16,
      horizontalPadding: 24,
      verticalPadding: 16,
      workspaceScale: 1,
    };

    expect(calculateTerminalGrid(base)).toEqual({ cols: 97, rows: 24 });
    expect(
      calculateTerminalGrid({
        ...base,
        viewportWidth: 1600,
        viewportHeight: 800,
        charWidth: 16,
        rowHeight: 32,
        workspaceScale: 2,
      }),
    ).toEqual({ cols: 97, rows: 24 });
    expect(
      calculateTerminalGrid({
        ...base,
        viewportWidth: 400,
        viewportHeight: 200,
        charWidth: 4,
        rowHeight: 8,
        workspaceScale: 0.5,
      }),
    ).toEqual({ cols: 97, rows: 24 });
  });

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

  it("scrolls terminal output containers to the bottom", () => {
    const animationFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callback(0);
        return 1;
      });
    const terminalElement = document.createElement("div");
    const viewportElement = document.createElement("div");
    Object.defineProperty(terminalElement, "scrollHeight", { value: 1200 });
    Object.defineProperty(viewportElement, "scrollHeight", { value: 800 });

    scrollTerminalToBottom(terminalElement, viewportElement);

    expect(terminalElement.scrollTop).toBe(1200);
    expect(viewportElement.scrollTop).toBe(800);
    animationFrame.mockRestore();
  });

  it("upgrades visible clear output to clear scrollback too", () => {
    expect(normalizeTerminalOutput("\x1b[2J\x1b[H")).toBe("\x1b[3J\x1b[2J\x1b[H");
  });

  it("removes rendered scrollback rows when clear output is written", () => {
    const animationFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callback(0);
        return 1;
      });
    const writes: string[] = [];
    const terminalElement = document.createElement("div");
    const scrollbackRow = document.createElement("div");
    const visibleRow = document.createElement("div");
    scrollbackRow.className = "term-row term-scrollback-row";
    visibleRow.className = "term-row";
    terminalElement.append(scrollbackRow, visibleRow);

    writeTerminalOutput("\x1b[2J\x1b[H", (data) => writes.push(data), terminalElement);

    expect(writes).toEqual(["\x1b[3J\x1b[2J\x1b[H"]);
    expect(terminalElement.querySelector(".term-scrollback-row")).toBeNull();
    expect(terminalElement.querySelector(".term-row")).toBe(visibleRow);
    animationFrame.mockRestore();
  });

  it("can remove rendered scrollback rows directly", () => {
    const terminalElement = document.createElement("div");
    terminalElement.innerHTML = `
      <div class="term-row term-scrollback-row"></div>
      <div class="term-row"></div>
    `;

    clearTerminalScrollbackRows(terminalElement);

    expect(terminalElement.querySelectorAll(".term-scrollback-row")).toHaveLength(0);
    expect(terminalElement.querySelectorAll(".term-row")).toHaveLength(1);
  });

  it("supports cwd-based virtual fs navigation and file-list style output", () => {
    const result = executeTerminalFsCommand(
      "cd ~/raw && ls",
      { cwd: "/home/user" },
      [
        {
          id: "raw-dir",
          path: "~/raw",
          name: "raw",
          kind: "directory",
          createdAt: 1,
        },
        {
          id: "waveform-file",
          path: "~/raw/waveform.csv",
          name: "waveform.csv",
          kind: "file",
          datasetId: "waveform",
          text: "time,signal\n0,1",
          createdAt: 1,
        },
      ],
      [
        {
          id: "waveform",
          name: "waveform.csv",
          sourcePath: "~/raw/waveform.csv",
          columns: [
            { id: "time", name: "time", dataType: "number" },
            { id: "signal", name: "signal", dataType: "number" },
          ],
          rows: [{ time: 0, signal: 1 }],
          createdBy: "upload",
          createdAt: 1,
        },
      ],
    );

    expect(result).toMatchObject({ cwd: "/home/user/raw", exitCode: 0 });
    expect(result.output).toContain("[dataset] ~/raw/waveform.csv");
  });

  it("reads raw file contents relative to the terminal cwd", () => {
    const result = executeTerminalFsCommand(
      "cat waveform.csv",
      { cwd: "/home/user/raw" },
      [
        {
          id: "waveform-file",
          path: "~/raw/waveform.csv",
          name: "waveform.csv",
          kind: "file",
          text: "time,signal\n0,1",
          createdAt: 1,
        },
      ],
      [],
    );

    expect(result).toMatchObject({ exitCode: 0, output: "time,signal\n0,1" });
  });

  it("formats history commands for the terminal command line", () => {
    expect(terminalCommandLineText("file-list ~/raw")).toBe("scispace file-list ~/raw");
  });
});
