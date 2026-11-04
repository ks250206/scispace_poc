import { describe, expect, it, vi } from "vite-plus/test";
import {
  clearTerminalScrollbackRows,
  normalizeTerminalOutput,
  scrollTerminalToBottom,
  writeTerminalOutput,
} from "../TerminalPanel";

describe("terminal output", () => {
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
});
