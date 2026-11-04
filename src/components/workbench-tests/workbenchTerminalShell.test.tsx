import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { renderWorkbench, setupWorkbenchSuite, storeState } from "./workbenchTestUtils";

const execute = (command: string) =>
  act(async () => storeState().sendCommandToTerminalLine(command, { execute: true }));

const renderTerminal = async () => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.classList.contains("terminal-viewport")
      ? new DOMRect(0, 0, 900, 400)
      : new DOMRect();
  });
  await renderWorkbench();
  const terminal = await screen.findByRole("group", { name: "Terminal" });
  await waitFor(() => expect(terminal.textContent).toContain("scispace-repl:~>"));
  return terminal;
};

describe("Workbench terminal shell", () => {
  setupWorkbenchSuite();

  it("keeps shell command failures on stderr and preserves the exit code", async () => {
    const terminal = await renderTerminal();

    await execute("unsafe on");
    await screen.findByText("unsafe");
    await execute("shell");
    await waitFor(() => expect(terminal.textContent).toContain("unsafe-shell:~$"));

    await execute(
      "scispace nonexistent-command >/home/user/failed-output; echo failure-status:$?; " +
        "test ! -s /home/user/failed-output && echo failure-stdout-empty",
    );
    await waitFor(() => {
      expect(terminal.textContent).toContain("failure-status:1");
      expect(terminal.textContent).toContain("failure-stdout-empty");
      expect(
        terminal.textContent?.match(/Unknown scispace command: nonexistent-command/g),
      ).toHaveLength(1);
    });

    await execute(
      "scispace help >/home/user/success-output; echo success-status:$?; " +
        "test -s /home/user/success-output && echo success-stdout-present",
    );
    await waitFor(() => {
      expect(terminal.textContent).toContain("success-status:0");
      expect(terminal.textContent).toContain("success-stdout-present");
    });
  });
  it("keeps shell argument boundaries and resolves virtual file paths", async () => {
    await renderTerminal();
    await execute("unsafe on");
    await screen.findByText("unsafe");
    await execute("shell");
    await screen.findByText("just-bash shell");
    await execute("scispace plot-set seed-plot title='Sample \"A\" = C:\\raw'");
    const title = 'Sample "A" = C:\\raw';
    await waitFor(() => expect(storeState().plotSpecs[0]?.title).toBe(title));
    const recorded = storeState().commandHistory.at(-1)?.command;
    if (!recorded) throw new Error("Missing recorded command");
    await act(async () => storeState().runScispace("plot-set seed-plot title=Other"));
    fireEvent.click(await screen.findByRole("button", { name: "Run " + recorded }));
    await waitFor(() => expect(storeState().plotSpecs[0]?.title).toBe(title));

    await execute("scispace file-list ~/raw");
    await waitFor(() =>
      expect(storeState().commandHistory.at(-1)).toMatchObject({
        command: "file-list ~/raw",
        status: "success",
        output: expect.stringContaining("waveform.csv"),
      }),
    );
    await execute("cd /home/user/raw && scispace file-list .");
    await waitFor(() =>
      expect(
        storeState().commandHistory.filter((entry) => entry.command === "file-list ~/raw"),
      ).toHaveLength(2),
    );
    await execute("scispace file-list ../");
    await waitFor(() =>
      expect(storeState().commandHistory.at(-1)).toMatchObject({ status: "error" }),
    );
  });

  it.each(["\n", "\r\n"])("reviews and runs a multiline paste (%j)", async (newline) => {
    await renderTerminal();
    const input = screen.getByRole("textbox", { name: "Terminal" });
    const text =
      ["file-list ~/raw", "unknown-for-paste", "lsdata"].join(newline) +
      (newline === "\r\n" ? newline : "");
    const paste = () => fireEvent.paste(input, { clipboardData: { getData: () => text } });
    paste();
    const dialog = await screen.findByRole("dialog", { name: "Run pasted SciSpace commands?" });
    expect(dialog.textContent).toContain("file-list ~/raw\nunknown-for-paste\nlsdata");
    expect(storeState().commandHistory).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(storeState().commandHistory).toHaveLength(0);
    await act(async () => {});
    paste();
    await screen.findByRole("dialog", { name: "Run pasted SciSpace commands?" });
    fireEvent.click(screen.getByRole("button", { name: "Run commands" }));
    await waitFor(() =>
      expect(storeState().commandHistory.map(({ command, status }) => [command, status])).toEqual([
        ["file-list ~/raw", "success"],
        ["unknown-for-paste", "error"],
        ["lsdata", "success"],
      ]),
    );
  });
});
