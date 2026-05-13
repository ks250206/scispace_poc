import { describe, expect, it } from "vitest";
import { terminalPrompt } from "./TerminalPanel";

describe("TerminalPanel public exports", () => {
  it("keeps terminal helper exports available from the panel facade", () => {
    expect(terminalPrompt("repl", "/home/user/raw")).toBe("scispace-repl:~/raw> ");
  });
});
