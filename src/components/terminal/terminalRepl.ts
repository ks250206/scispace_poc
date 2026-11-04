import { BashShell } from "@wterm/just-bash";
import { quoteCommandToken, tokenizeCommand } from "../../domain/scispace/commandUtils";
import { resolveShellRawPath } from "./terminalFs";
import type { EditableBashShell, TerminalMode } from "./terminalTypes";

export const tabSequence = "\t";

const scispaceReplCommands = [
  "help",
  "lsdata",
  "dataset-new",
  "dataset-calc",
  "table",
  "table-edit",
  "table-range",
  "plot",
  "plot-set",
  "plot-axis",
  "plot-grid",
  "plot-series",
  "plot-annotation",
  "plot-schema",
  "plot-apply-schema",
  "file-list",
  "file-mkdir",
  "file-rename",
  "file-move",
  "file-delete",
  "upload-open",
  "import-open",
  "import-preview",
  "import-set",
  "import-column",
  "import-line",
  "import-cancel",
  "import-confirm",
  "elt",
] as const;

const scispaceReplLocalCommands = ["help", "clear", "repl", "unsafe", "shell"] as const;
const scispaceReplCompletionCommands = [
  ...scispaceReplLocalCommands,
  ...scispaceReplCommands.filter((command) => command !== "help"),
].sort();
const shellOnlyCommands = new Set(["cat", "cd", "ls", "pwd", "rm"]);

export const terminalCommandLineText = (command: string, wrapForShell = false): string => {
  if (!wrapForShell) return command;
  const tokens = tokenizeCommand(stripScispacePrefix(command));
  const args = tokens.map((token) => "'" + token.replaceAll("'", "'\\''") + "'");
  return ["scispace", ...args].join(" ");
};

const virtualFileCommands = new Set([
  "file-list",
  "file-mkdir",
  "file-rename",
  "file-move",
  "file-delete",
]);

export const scispaceReplCommandLine = (
  command: string,
  args: string[],
  cwd = "/home/user",
): string => {
  const normalizedArgs = virtualFileCommands.has(command)
    ? args.map((arg, index) => {
        if (index === 0) return resolveShellRawPath(arg, cwd);
        if (command === "file-move" && arg.startsWith("to=")) {
          return "to=" + resolveShellRawPath(arg.slice(3), cwd);
        }
        return arg;
      })
    : args;
  return [command, ...normalizedArgs].map(quoteCommandToken).join(" ");
};

export const stripScispacePrefix = (commandLine: string): string =>
  commandLine.trim().replace(/^scispace\s+/, "");

export const terminalPrompt = (mode: TerminalMode, cwd: string): string => {
  const path = cwd.replace("/home/user", "~");
  return mode === "repl" ? `scispace-repl:${path}> ` : `unsafe-shell:${path}$ `;
};

const terminalCrlf = (output: string): string => output.replace(/\r?\n/g, "\r\n");

export const terminalPromptOutput = (output: string, mode: TerminalMode, cwd: string): string =>
  `\r\n${terminalCrlf(output)}\r\n${terminalPrompt(mode, cwd)}`;

export const terminalControlResult = (
  command: string,
  args: string[],
  state: { mode: TerminalMode; unsafe: boolean },
): { handled: boolean; mode: TerminalMode; unsafe: boolean; output: string; exitCode: number } => {
  const next = { ...state };
  if (command === "repl") {
    next.mode = "repl";
    return { handled: true, ...next, output: "Entered scispace REPL", exitCode: 0 };
  }

  if (command === "unsafe") {
    const setting = args[0];
    if (setting === "on") {
      next.unsafe = true;
      return { handled: true, ...next, output: "Unsafe mode enabled", exitCode: 0 };
    }
    if (setting === "off") {
      next.unsafe = false;
      next.mode = "repl";
      return {
        handled: true,
        ...next,
        output: "Unsafe mode disabled; returned to scispace REPL",
        exitCode: 0,
      };
    }
    return { handled: true, ...next, output: "Usage: unsafe on|off", exitCode: 1 };
  }

  if (command === "shell") {
    if (!state.unsafe) {
      return {
        handled: true,
        ...next,
        output: "shell is disabled. Run `unsafe on` before entering just-bash shell.",
        exitCode: 1,
      };
    }
    next.mode = "bash";
    return { handled: true, ...next, output: "Entered unsafe just-bash shell", exitCode: 0 };
  }

  if (command === "exit") {
    if (state.mode === "bash") {
      next.mode = "repl";
      return { handled: true, ...next, output: "Returned to scispace REPL", exitCode: 0 };
    }
    return { handled: true, ...next, output: "Already in scispace REPL", exitCode: 0 };
  }

  return { handled: false, ...next, output: "", exitCode: 0 };
};

export const terminalControlCommandFromInput = (
  data: string,
  line: string | undefined,
  mode: TerminalMode,
): { command: string; args: string[] } | undefined => {
  if (mode !== "bash" || !/[\r\n]/.test(data)) return undefined;
  const commandLine = line?.trim() ?? "";
  if (commandLine === "exit") return { command: "exit", args: [] };
  if (commandLine === "scispace repl") return { command: "repl", args: [] };
  if (commandLine === "unsafe off") return { command: "unsafe", args: ["off"] };
  return undefined;
};

export const terminalReplScispaceCommandFromInput = (
  data: string,
  line: string | undefined,
  mode: TerminalMode,
): string | undefined => {
  if (mode !== "repl" || !/[\r\n]/.test(data)) return undefined;
  return stripScispacePrefix(line?.trim() ?? "");
};

export const terminalReplShellCommandMessage = (command: string): string | undefined =>
  shellOnlyCommands.has(command)
    ? `\`${command}\` is only available in unsafe just-bash shell. Use scispace commands such as \`file-list [path]\` in the REPL.`
    : undefined;

export const replTabCompletion = (line: string): { insert?: string; choices?: string[] } => {
  const trimmedLeft = line.trimStart();
  if (trimmedLeft.includes(" ")) return {};
  const matches = scispaceReplCompletionCommands.filter((command) =>
    command.startsWith(trimmedLeft),
  );
  if (matches.length === 1) {
    const insert = matches[0].slice(trimmedLeft.length);
    return { insert: `${insert} ` };
  }
  return matches.length > 1 ? { choices: matches } : {};
};

export const applyReplTabCompletion = (shell: BashShell | null, cwd: string): boolean => {
  const editableShell = shell as unknown as EditableBashShell | null;
  if (!editableShell?._write || typeof editableShell._line !== "string") return false;
  if (editableShell._cursor !== editableShell._line.length) return false;
  const completion = replTabCompletion(editableShell._line);
  if (completion.insert) {
    editableShell._line += completion.insert;
    editableShell._cursor = editableShell._line.length;
    editableShell._write(completion.insert);
    return true;
  }
  if (completion.choices?.length) {
    editableShell._write(
      `\r\n${completion.choices.join("  ")}\r\n${terminalPrompt("repl", cwd)}${editableShell._line}`,
    );
    return true;
  }
  return false;
};

export const resetEditableLine = (shell: BashShell | null, commandLine: string): void => {
  const editableShell = shell as unknown as EditableBashShell | null;
  if (!editableShell) return;
  if (commandLine) {
    editableShell._history?.push(commandLine);
    editableShell._historyPos = -1;
  }
  editableShell._line = "";
  editableShell._cursor = 0;
  editableShell._buffer = "";
};
