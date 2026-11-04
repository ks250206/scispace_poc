import { act, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { renderWorkbench, setupWorkbenchSuite, storeState } from "./workbenchTestUtils";

describe("Workbench terminal shell", () => {
  setupWorkbenchSuite();

  it("keeps shell command failures on stderr and preserves the exit code", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.classList.contains("terminal-viewport")
        ? new DOMRect(0, 0, 900, 400)
        : new DOMRect();
    });
    await renderWorkbench();
    const terminal = await screen.findByRole("group", { name: "Terminal" });
    const execute = (command: string) =>
      act(async () => storeState().sendCommandToTerminalLine(command, { execute: true }));

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
});
