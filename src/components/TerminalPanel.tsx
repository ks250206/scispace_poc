import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Terminal, useTerminal } from "@wterm/react";
import "@wterm/react/css";
import type { WTerm } from "@wterm/dom";
import { BashShell } from "@wterm/just-bash";
import { defineCommand } from "just-bash";
import { useContextMenu } from "./context-menu/ContextMenuProvider";
import { formatVirtualFileList } from "../domain/scispace/fileCommands";
import type { Dataset, VirtualFile } from "../domain/types";
import { useScispaceStore } from "../store/scispaceStore";

const toBashPath = (path: string): string => path.replace(/^~\//, "/home/user/");
const deleteSequence = "\x1b[3~";
const clearVisibleScreenSequence = "\x1b[2J\x1b[H";
const clearScrollbackSequence = "\x1b[3J";
const tabSequence = "\t";

type EditableBashShell = {
  _buffer?: string;
  _cursor?: number;
  _history?: string[];
  _historyPos?: number;
  _line?: string;
  _tabComplete?: () => Promise<void>;
  _write?: (data: string) => void;
};

type TerminalMode = "repl" | "bash";

type TerminalSize = { cols: number; rows: number };
export type TerminalFsState = { cwd: string };

export type TerminalFsCommandResult = {
  clear?: boolean;
  cwd: string;
  exitCode: number;
  output: string;
};

type TerminalMetrics = {
  charWidth: number;
  horizontalPadding: number;
  rowHeight: number;
  verticalPadding: number;
};

const terminalLogicalRowHeight = 17;
const terminalBottomInsetRows = 1;

const defaultTerminalMetrics: TerminalMetrics = {
  charWidth: 8.4,
  horizontalPadding: 24,
  rowHeight: terminalLogicalRowHeight,
  verticalPadding: 16,
};

const scispaceReplCommands = [
  "help",
  "lsdata",
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

const workspaceScaleOrDefault = (scale: number): number => Math.max(0.1, scale || 1);

const buildInitialFiles = (files: VirtualFile[]): Record<string, string> =>
  Object.fromEntries([
    ["/home/user/README.txt", "SciSpace REPL. Try: help or file-list ~/raw\n"],
    ...files.filter((file) => file.text).map((file) => [toBashPath(file.path), file.text ?? ""]),
  ]);

const normalizeShellPath = (path: string): string => {
  if (path === "~") return "/home/user";
  if (path.startsWith("~/")) return toBashPath(path);
  return path.replace(/\/+$/, "") || "/";
};

const joinShellPath = (cwd: string, path?: string): string => {
  if (!path || path === ".") return cwd;
  if (path === "..") return cwd === "/home/user" ? cwd : cwd.slice(0, cwd.lastIndexOf("/"));
  if (path.startsWith("/") || path.startsWith("~")) return normalizeShellPath(path);
  return normalizeShellPath(`${cwd}/${path}`);
};

const shellPathToVirtualPath = (shellPath: string): string | undefined => {
  const normalized = normalizeShellPath(shellPath);
  if (normalized === "/home/user") return "~/raw";
  if (normalized === "/home/user/raw") return "~/raw";
  if (normalized.startsWith("/home/user/raw/"))
    return `~/${normalized.slice("/home/user/".length)}`;
  return undefined;
};

const shellPathForPrompt = (shellPath: string): string => shellPath.replace("/home/user", "~");

const isKnownDirectory = (path: string, files: VirtualFile[]): boolean => {
  const virtualPath = shellPathToVirtualPath(path);
  if (!virtualPath) return false;
  if (virtualPath === "~/raw") return true;
  return files.some((file) => file.kind === "directory" && file.path === virtualPath);
};

export const terminalCommandLineText = (command: string): string => command;

export const scispaceReplCommandLine = (command: string, args: string[]): string =>
  [command, ...args].join(" ").trim();

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

const resetEditableLine = (shell: BashShell | null, commandLine: string): void => {
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

export const executeTerminalFsCommand = (
  commandLine: string,
  state: TerminalFsState,
  files: VirtualFile[],
  datasets: Dataset[],
): TerminalFsCommandResult => {
  const commands = commandLine
    .split("&&")
    .map((command) => command.trim())
    .filter(Boolean);
  let cwd = state.cwd;
  const output: string[] = [];

  for (const commandText of commands) {
    const [command, ...args] = commandText.split(/\s+/);
    if (command === "pwd") {
      output.push(shellPathForPrompt(cwd));
      continue;
    }

    if (command === "cd") {
      const nextPath = joinShellPath(cwd, args[0] ?? "~");
      if (!isKnownDirectory(nextPath, files)) {
        return { cwd, exitCode: 1, output: `cd: no such directory: ${args[0] ?? "~"}` };
      }
      cwd = nextPath;
      continue;
    }

    if (command === "ls") {
      const target = shellPathToVirtualPath(joinShellPath(cwd, args[0]));
      if (!target) return { cwd, exitCode: 1, output: `ls: unsupported path: ${args[0] ?? "."}` };
      output.push(formatVirtualFileList(target, files, datasets));
      continue;
    }

    if (command === "cat") {
      const target = shellPathToVirtualPath(joinShellPath(cwd, args[0]));
      const file = target
        ? files.find((item) => item.kind === "file" && item.path === target)
        : undefined;
      if (!target || !file) {
        return { cwd, exitCode: 1, output: `cat: no such file: ${args[0] ?? ""}` };
      }
      output.push(file.text ?? "");
      continue;
    }

    if (command === "clear") {
      return { clear: true, cwd, exitCode: 0, output: clearVisibleScreenSequence };
    }

    return { cwd, exitCode: 127, output: `${command}: command not found` };
  }

  return { cwd, exitCode: 0, output: output.join("\n") };
};

const sumStylePixels = (style: CSSStyleDeclaration | undefined, properties: string[]): number =>
  style
    ? properties.reduce((total, property) => {
        return total + (Number.parseFloat(style.getPropertyValue(property)) || 0);
      }, 0)
    : 0;

const measureTerminalMetrics = (
  viewport: HTMLElement,
  terminal: HTMLElement | undefined,
  workspaceScale: number,
): TerminalMetrics => {
  const scale = workspaceScaleOrDefault(workspaceScale);
  const terminalStyle = terminal ? getComputedStyle(terminal) : undefined;
  const probe = document.createElement("span");
  probe.textContent = "M";
  probe.style.visibility = "hidden";
  probe.style.position = "absolute";
  probe.style.font = terminalStyle?.font ?? "14px Menlo, Consolas, monospace";
  viewport.append(probe);
  const charWidth = probe.getBoundingClientRect().width || defaultTerminalMetrics.charWidth * scale;
  probe.remove();

  const rowHeight =
    (terminalStyle
      ? Number.parseFloat(terminalStyle.getPropertyValue("--term-row-height")) ||
        defaultTerminalMetrics.rowHeight
      : defaultTerminalMetrics.rowHeight) * scale;

  return {
    charWidth,
    horizontalPadding:
      sumStylePixels(terminalStyle, ["padding-left", "padding-right"]) ||
      defaultTerminalMetrics.horizontalPadding,
    rowHeight,
    verticalPadding:
      sumStylePixels(terminalStyle, ["padding-top", "padding-bottom"]) ||
      defaultTerminalMetrics.verticalPadding,
  };
};

export const applyTerminalLogicalMetrics = (terminal: WTerm | null | undefined): void => {
  if (!terminal) return;
  terminal.element.style.setProperty("--term-row-height", `${terminalLogicalRowHeight}px`);
  (terminal as unknown as Record<string, number>)._rowHeight = terminalLogicalRowHeight;
};

const syncBashFiles = async (
  bash: BashShell["bash"] | null | undefined,
  files: VirtualFile[],
): Promise<void> => {
  if (!bash) return;
  await bash.fs.rm("/home/user/raw", { recursive: true, force: true });
  await bash.fs.mkdir("/home/user/raw", { recursive: true });
  await Promise.all(
    files
      .filter((file) => file.kind === "directory")
      .map((file) => bash.fs.mkdir(toBashPath(file.path), { recursive: true })),
  );
  await Promise.all(
    files
      .filter((file) => file.text)
      .map((file) => bash.fs.writeFile(toBashPath(file.path), file.text ?? "")),
  );
};

export const calculateTerminalGrid = ({
  viewportWidth,
  viewportHeight,
  charWidth,
  rowHeight,
  horizontalPadding,
  verticalPadding,
  workspaceScale,
}: {
  viewportWidth: number;
  viewportHeight: number;
  charWidth: number;
  rowHeight: number;
  horizontalPadding: number;
  verticalPadding: number;
  workspaceScale: number;
}): TerminalSize => {
  const scale = workspaceScaleOrDefault(workspaceScale);
  const logicalWidth = viewportWidth / scale;
  const logicalHeight = viewportHeight / scale;
  const logicalCharWidth = Math.max(1, charWidth / scale);
  const logicalRowHeight = Math.max(1, rowHeight / scale);
  return {
    cols: Math.max(1, Math.floor((logicalWidth - horizontalPadding) / logicalCharWidth)),
    rows: Math.max(1, Math.floor((logicalHeight - verticalPadding) / logicalRowHeight)),
  };
};

export const scrollTerminalToBottom = (
  terminalElement?: HTMLElement | null,
  viewportElement?: HTMLElement | null,
): void => {
  const scrollTargets = [
    terminalElement,
    terminalElement?.querySelector<HTMLElement>("[data-terminal-viewport]"),
    viewportElement,
  ].filter((element): element is HTMLElement => Boolean(element));

  window.requestAnimationFrame(() => {
    for (const element of scrollTargets) {
      element.scrollTop = element.scrollHeight;
    }
  });
};

export const normalizeTerminalOutput = (data: string): string =>
  data.replaceAll(
    clearVisibleScreenSequence,
    `${clearScrollbackSequence}${clearVisibleScreenSequence}`,
  );

export const clearTerminalScrollbackRows = (terminalElement?: HTMLElement | null): void => {
  terminalElement
    ?.querySelectorAll<HTMLElement>(".term-scrollback-row")
    .forEach((row) => row.remove());
};

export const writeTerminalOutput = (
  data: string,
  write: (data: string) => void,
  terminalElement?: HTMLElement | null,
  viewportElement?: HTMLElement | null,
): void => {
  const output = normalizeTerminalOutput(data);
  write(output);
  if (output.includes(clearScrollbackSequence)) {
    clearTerminalScrollbackRows(terminalElement);
    if (terminalElement) terminalElement.scrollTop = 0;
    if (viewportElement) viewportElement.scrollTop = 0;
  }
  scrollTerminalToBottom(terminalElement, viewportElement);
};

export const handleForwardDelete = (shell: BashShell | null): void => {
  const editableShell = shell as unknown as EditableBashShell | null;
  if (
    !editableShell ||
    typeof editableShell._line !== "string" ||
    typeof editableShell._cursor !== "number" ||
    typeof editableShell._write !== "function" ||
    editableShell._cursor >= editableShell._line.length
  ) {
    return;
  }
  const tail = editableShell._line.slice(editableShell._cursor + 1);
  editableShell._line = editableShell._line.slice(0, editableShell._cursor) + tail;
  editableShell._write(tail + "\x1b[K");
  if (tail.length > 0) editableShell._write(`\x1b[${tail.length}D`);
};

export const handleTerminalInput = async (shell: BashShell | null, data: string): Promise<void> => {
  if (!shell) return;
  let remaining = data;
  while (remaining.length > 0) {
    const deleteIndex = remaining.indexOf(deleteSequence);
    if (deleteIndex < 0) {
      await shell.handleInput(remaining);
      return;
    }
    const beforeDelete = remaining.slice(0, deleteIndex);
    if (beforeDelete) await shell.handleInput(beforeDelete);
    handleForwardDelete(shell);
    remaining = remaining.slice(deleteIndex + deleteSequence.length);
  }
};

export function TerminalPanel() {
  const { ref, write, resize } = useTerminal();
  const shellRef = useRef<BashShell | null>(null);
  const terminalRef = useRef<WTerm | null>(null);
  const terminalFsStateRef = useRef<TerminalFsState>({ cwd: "/home/user" });
  const terminalModeRef = useRef<{ mode: TerminalMode; unsafe: boolean }>({
    mode: "repl",
    unsafe: false,
  });
  const [terminalControlState, setTerminalControlState] = useState<{
    mode: TerminalMode;
    unsafe: boolean;
  }>({
    mode: "repl",
    unsafe: false,
  });
  const viewportRef = useRef<HTMLDivElement>(null);
  const commandLineRequestIdRef = useRef<string | undefined>(undefined);
  const [terminalSize, setTerminalSize] = useState<TerminalSize>();
  const files = useScispaceStore((state) => state.files);
  const datasets = useScispaceStore((state) => state.datasets);
  const workspaceScale = useScispaceStore((state) => state.viewport.scale);
  const runScispace = useScispaceStore((state) => state.runScispace);
  const terminalCommandLineRequest = useScispaceStore((state) => state.terminalCommandLineRequest);
  const { openContextMenu } = useContextMenu();
  const filesRef = useRef(files);
  const datasetsRef = useRef(datasets);

  const initialFiles = useMemo(() => buildInitialFiles(files), [files]);

  const syncTerminalSize = useCallback(() => {
    const viewport = viewportRef.current;
    const terminalInstance = terminalRef.current ?? ref.current?.instance;
    if (!viewport) return;

    const terminal = terminalInstance?.element;
    applyTerminalLogicalMetrics(terminalInstance);
    const metrics = measureTerminalMetrics(viewport, terminal, workspaceScale);
    const { width, height } = viewport.getBoundingClientRect();
    const { cols, rows } = calculateTerminalGrid({
      viewportWidth: width,
      viewportHeight: height,
      charWidth: metrics.charWidth,
      rowHeight: metrics.rowHeight,
      horizontalPadding: metrics.horizontalPadding,
      verticalPadding: metrics.verticalPadding + terminalLogicalRowHeight * terminalBottomInsetRows,
      workspaceScale,
    });
    setTerminalSize((current) =>
      current && current.cols === cols && current.rows === rows ? current : { cols, rows },
    );
    terminalInstance?.resize(cols, rows);
    applyTerminalLogicalMetrics(terminalInstance);
    resize(cols, rows);
    scrollTerminalToBottom(terminal, viewport);
  }, [ref, resize, workspaceScale]);

  const scrollToBottom = useCallback(() => {
    const terminalElement = terminalRef.current?.element ?? ref.current?.instance?.element;
    scrollTerminalToBottom(terminalElement, viewportRef.current);
  }, [ref]);

  const writeOutput = useCallback(
    (data: string) => {
      const terminalElement = terminalRef.current?.element ?? ref.current?.instance?.element;
      writeTerminalOutput(data, write, terminalElement, viewportRef.current);
    },
    [ref, write],
  );

  const applyTerminalControlState = useCallback(
    (nextState: { mode: TerminalMode; unsafe: boolean }) => {
      terminalModeRef.current = nextState;
      setTerminalControlState(nextState);
    },
    [],
  );

  const writeTerminalControlResult = useCallback(
    (result: ReturnType<typeof terminalControlResult>) => {
      const shell = shellRef.current;
      const editableShell = shell as unknown as EditableBashShell | null;
      if (result.mode === "repl" && shell) terminalFsStateRef.current = { cwd: shell.cwd };
      applyTerminalControlState({ mode: result.mode, unsafe: result.unsafe });
      resetEditableLine(shell, editableShell?._line?.trim() ?? "");
      writeOutput(terminalPromptOutput(result.output, result.mode, terminalFsStateRef.current.cwd));
      scrollToBottom();
    },
    [applyTerminalControlState, scrollToBottom, writeOutput],
  );

  const toggleUnsafeMode = useCallback(() => {
    writeTerminalControlResult(
      terminalControlResult(
        "unsafe",
        [terminalModeRef.current.unsafe ? "off" : "on"],
        terminalModeRef.current,
      ),
    );
  }, [writeTerminalControlResult]);

  const openTerminalContextMenu = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      openContextMenu({
        x: event.clientX,
        y: event.clientY,
        title: "Terminal",
        items: [
          {
            label: "Unsafe mode",
            active: terminalControlState.unsafe,
            onSelect: toggleUnsafeMode,
          },
          {
            label: "Enter scispace REPL",
            active: terminalControlState.mode === "repl",
            onSelect: () => {
              writeTerminalControlResult(
                terminalControlResult("repl", [], terminalModeRef.current),
              );
            },
          },
        ],
      });
    },
    [
      applyTerminalControlState,
      openContextMenu,
      terminalControlState.mode,
      terminalControlState.unsafe,
      toggleUnsafeMode,
      writeTerminalControlResult,
    ],
  );

  const handleReady = useCallback(
    async (terminal: WTerm) => {
      terminalRef.current = terminal;
      if (shellRef.current) return;
      applyTerminalLogicalMetrics(terminal);
      syncTerminalSize();
      const shell = new BashShell({
        files: initialFiles,
        cwd: "/home/user",
        greeting: ["SciSpace REPL", "Run `help` or inspect ~/raw with `file-list ~/raw`."],
        prompt: (cwd) =>
          terminalPrompt(
            terminalModeRef.current.mode,
            terminalModeRef.current.mode === "bash" ? cwd : terminalFsStateRef.current.cwd,
          ),
      });
      shellRef.current = shell;
      await shell.attach(writeOutput);
      const applyControlResult = (result: ReturnType<typeof terminalControlResult>) => {
        applyTerminalControlState({ mode: result.mode, unsafe: result.unsafe });
        return {
          stdout: result.exitCode === 0 && result.output ? `${result.output}\n` : "",
          stderr: result.exitCode === 0 || !result.output ? "" : `${result.output}\n`,
          exitCode: result.exitCode,
        };
      };
      shell.bash?.registerCommand(
        defineCommand("scispace", async (args) => {
          if (args[0] === "repl") {
            terminalFsStateRef.current = { cwd: shell.cwd };
            return applyControlResult(terminalControlResult("repl", [], terminalModeRef.current));
          }
          const result = await runScispace(stripScispacePrefix(["scispace", ...args].join(" ")), {
            source: "terminal",
          });
          scrollToBottom();
          return {
            stdout: `${result.output}\n`,
            stderr: result.kind === "error" ? `${result.output}\n` : "",
            exitCode: result.kind === "error" ? 1 : 0,
          };
        }),
      );
    },
    [
      applyTerminalControlState,
      initialFiles,
      runScispace,
      scrollToBottom,
      syncTerminalSize,
      writeOutput,
    ],
  );

  const handleData = useCallback(
    (data: string) => {
      const shell = shellRef.current;
      const editableShell = shell as unknown as EditableBashShell | null;
      if (terminalModeRef.current.mode === "repl" && data === tabSequence) {
        if (applyReplTabCompletion(shell, terminalFsStateRef.current.cwd)) {
          scrollToBottom();
          return;
        }
      }
      const controlCommand = terminalControlCommandFromInput(
        data,
        editableShell?._line,
        terminalModeRef.current.mode,
      );
      if (controlCommand) {
        const result = terminalControlResult(
          controlCommand.command,
          controlCommand.args,
          terminalModeRef.current,
        );
        writeTerminalControlResult(result);
        return;
      }
      const replCommand = terminalReplScispaceCommandFromInput(
        data,
        editableShell?._line,
        terminalModeRef.current.mode,
      );
      if (replCommand !== undefined) {
        resetEditableLine(shell, editableShell?._line?.trim() ?? "");
        if (!replCommand) {
          writeOutput(`\r\n${terminalPrompt("repl", terminalFsStateRef.current.cwd)}`);
          scrollToBottom();
          return;
        }
        const [command = "", ...args] = replCommand.split(/\s+/);
        const controlResult = terminalControlResult(command, args, terminalModeRef.current);
        if (controlResult.handled) {
          writeTerminalControlResult(controlResult);
          return;
        }
        if (command === "clear") {
          writeOutput(clearVisibleScreenSequence);
          writeOutput(terminalPrompt("repl", terminalFsStateRef.current.cwd));
          scrollToBottom();
          return;
        }
        const shellCommandMessage = terminalReplShellCommandMessage(command);
        if (shellCommandMessage) {
          writeOutput(
            terminalPromptOutput(shellCommandMessage, "repl", terminalFsStateRef.current.cwd),
          );
          scrollToBottom();
          return;
        }
        void runScispace(replCommand, { source: "terminal" }).then((result) => {
          writeOutput(
            terminalPromptOutput(
              result.output,
              terminalModeRef.current.mode,
              terminalFsStateRef.current.cwd,
            ),
          );
          scrollToBottom();
        });
        return;
      }
      void handleTerminalInput(shellRef.current, data).then(scrollToBottom);
    },
    [runScispace, scrollToBottom, writeOutput, writeTerminalControlResult],
  );

  useEffect(() => {
    const shell = shellRef.current;
    filesRef.current = files;
    void syncBashFiles(shell?.bash, files);
  }, [files]);

  useEffect(() => {
    datasetsRef.current = datasets;
  }, [datasets]);

  useEffect(() => {
    if (!terminalCommandLineRequest || !shellRef.current) return;
    if (commandLineRequestIdRef.current === terminalCommandLineRequest.id) return;
    commandLineRequestIdRef.current = terminalCommandLineRequest.id;
    const editableShell = shellRef.current as unknown as EditableBashShell;
    if (editableShell._line) {
      resetEditableLine(shellRef.current, "");
      writeOutput(
        `\r\x1b[2K${terminalPrompt(terminalModeRef.current.mode, terminalFsStateRef.current.cwd)}`,
      );
    }
    void shellRef.current
      .handleInput(terminalCommandLineText(terminalCommandLineRequest.command))
      .then(() => {
        if (terminalCommandLineRequest.execute) {
          handleData("\r");
          return;
        }
        scrollToBottom();
      });
  }, [handleData, scrollToBottom, terminalCommandLineRequest]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    const observer = new ResizeObserver(() => syncTerminalSize());
    observer.observe(viewport);
    syncTerminalSize();
    return () => observer.disconnect();
  }, [syncTerminalSize]);

  return (
    <section className="terminal-panel" onContextMenu={openTerminalContextMenu}>
      <header className="terminal-header">
        <span>scispace REPL</span>
        <span className={`terminal-mode-badge ${terminalControlState.unsafe ? "unsafe" : "safe"}`}>
          {terminalControlState.unsafe ? "unsafe" : "safe"}
        </span>
        <span>wterm + just-bash</span>
      </header>
      <div ref={viewportRef} className="terminal-viewport">
        {terminalSize ? (
          <Terminal
            ref={ref}
            className="terminal-host"
            cols={terminalSize.cols}
            rows={terminalSize.rows}
            style={{ height: "100%" }}
            theme="light"
            onReady={(terminal) => void handleReady(terminal)}
            onData={handleData}
          />
        ) : null}
      </div>
    </section>
  );
}
