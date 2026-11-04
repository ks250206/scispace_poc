import { describe, expect, it } from "vite-plus/test";
import type { BashShell } from "@wterm/just-bash";
import {
  applyReplTabCompletion,
  replTabCompletion,
  scispaceReplCommandLine,
  stripScispacePrefix,
  terminalCommandLineText,
  terminalControlCommandFromInput,
  terminalControlResult,
  terminalPrompt,
  terminalPromptOutput,
  terminalReplScispaceCommandFromInput,
  terminalReplShellCommandMessage,
} from "../TerminalPanel";

describe("terminal scispace repl", () => {
  it("formats history commands for the terminal command line", () => {
    expect(terminalCommandLineText("file-list ~/raw")).toBe("file-list ~/raw");
  });

  it("normalizes scispace repl command lines", () => {
    expect(scispaceReplCommandLine("file-list", ["~/raw"])).toBe("file-list ~/raw");
    expect(stripScispacePrefix("scispace file-list ~/raw")).toBe("file-list ~/raw");
    expect(stripScispacePrefix("file-list ~/raw")).toBe("file-list ~/raw");
  });

  it("controls unsafe shell transitions from the scispace repl", () => {
    expect(terminalPrompt("repl", "/home/user/raw")).toBe("scispace-repl:~/raw> ");
    expect(terminalPrompt("bash", "/home/user/raw")).toBe("unsafe-shell:~/raw$ ");
    expect(terminalPromptOutput("Entered scispace REPL", "repl", "/home/user")).toBe(
      "\r\nEntered scispace REPL\r\nscispace-repl:~> ",
    );
    expect(terminalPromptOutput("a\nb", "repl", "/home/user")).toBe(
      "\r\na\r\nb\r\nscispace-repl:~> ",
    );

    const denied = terminalControlResult("shell", [], { mode: "repl", unsafe: false });
    expect(denied).toMatchObject({ handled: true, mode: "repl", unsafe: false, exitCode: 1 });
    expect(denied.output).toContain("unsafe on");

    const unsafeOn = terminalControlResult("unsafe", ["on"], { mode: "repl", unsafe: false });
    expect(unsafeOn).toMatchObject({ handled: true, mode: "repl", unsafe: true, exitCode: 0 });

    const shell = terminalControlResult("shell", [], { mode: "repl", unsafe: true });
    expect(shell).toMatchObject({ handled: true, mode: "bash", unsafe: true, exitCode: 0 });

    const repl = terminalControlResult("exit", [], { mode: "bash", unsafe: true });
    expect(repl).toMatchObject({ handled: true, mode: "repl", unsafe: true, exitCode: 0 });

    const unsafeOff = terminalControlResult("unsafe", ["off"], { mode: "bash", unsafe: true });
    expect(unsafeOff).toMatchObject({
      handled: true,
      mode: "repl",
      unsafe: false,
      exitCode: 0,
    });
  });

  it("intercepts unsafe shell exit commands before just-bash handles them", () => {
    expect(terminalControlCommandFromInput("\r", "exit", "bash")).toEqual({
      command: "exit",
      args: [],
    });
    expect(terminalControlCommandFromInput("\r", "scispace repl", "bash")).toEqual({
      command: "repl",
      args: [],
    });
    expect(terminalControlCommandFromInput("\r", "unsafe off", "bash")).toEqual({
      command: "unsafe",
      args: ["off"],
    });
    expect(terminalControlCommandFromInput("\r", "exit", "repl")).toBeUndefined();
    expect(terminalControlCommandFromInput("x", "exit", "bash")).toBeUndefined();
  });

  it("intercepts repl commands before just-bash handles overlapping names", () => {
    expect(terminalReplScispaceCommandFromInput("\r", "help", "repl")).toBe("help");
    expect(terminalReplScispaceCommandFromInput("\r", "scispace help", "repl")).toBe("help");
    expect(terminalReplScispaceCommandFromInput("\r", "plot waveform.csv", "repl")).toBe(
      "plot waveform.csv",
    );
    expect(terminalReplScispaceCommandFromInput("\r", "ls raw", "repl")).toBe("ls raw");
    expect(terminalReplScispaceCommandFromInput("\r", "help", "bash")).toBeUndefined();
    expect(terminalReplScispaceCommandFromInput("x", "help", "repl")).toBeUndefined();
    expect(terminalReplShellCommandMessage("ls")).toContain("unsafe just-bash shell");
    expect(terminalReplShellCommandMessage("plot")).toBeUndefined();
  });

  it("supports basic scispace repl tab completion without taking over bash completion", () => {
    expect(replTabCompletion("dataset-")).toEqual({
      choices: ["dataset-calc", "dataset-new"],
    });
    expect(replTabCompletion("plo")).toEqual({
      choices: [
        "plot",
        "plot-annotation",
        "plot-apply-schema",
        "plot-axis",
        "plot-grid",
        "plot-schema",
        "plot-series",
        "plot-set",
      ],
    });
    expect(replTabCompletion("plot-sche")).toEqual({ insert: "ma " });
    expect(replTabCompletion("plot waveform")).toEqual({});

    const writes: string[] = [];
    const shell = {
      _line: "plot-sche",
      _cursor: 9,
      _write: (data: string) => writes.push(data),
    } as unknown as BashShell;

    expect(applyReplTabCompletion(shell, "/home/user")).toBe(true);
    expect(shell).toMatchObject({ _line: "plot-schema ", _cursor: 12 });
    expect(writes).toEqual(["ma "]);
  });
});
