import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Terminal, useTerminal } from "@wterm/react";
import "@wterm/react/css";
import type { WTerm } from "@wterm/dom";
import { BashShell } from "@wterm/just-bash";
import { defineCommand } from "just-bash";
import { useContextMenu } from "./context-menu/ContextMenuProvider";
import { useScispaceStore } from "../store/scispaceStore";
import { buildInitialFiles, syncBashFiles } from "./terminal/terminalFs";
import {
  clearVisibleScreenSequence,
  handleTerminalInput,
  scrollTerminalToBottom,
  writeTerminalOutput,
} from "./terminal/terminalIo";
import {
  applyReplTabCompletion,
  resetEditableLine,
  stripScispacePrefix,
  tabSequence,
  terminalCommandLineText,
  terminalControlCommandFromInput,
  terminalControlResult,
  terminalPrompt,
  terminalPromptOutput,
  terminalReplScispaceCommandFromInput,
  terminalReplShellCommandMessage,
} from "./terminal/terminalRepl";
import {
  applyTerminalLogicalMetrics,
  calculateTerminalGrid,
  measureTerminalMetrics,
  terminalBottomInsetRows,
  terminalLogicalRowHeight,
} from "./terminal/terminalSizing";
import type {
  EditableBashShell,
  TerminalFsState,
  TerminalMode,
  TerminalSize,
} from "./terminal/terminalTypes";

export type { TerminalFsCommandResult, TerminalFsState } from "./terminal/terminalTypes";
export { executeTerminalFsCommand } from "./terminal/terminalFs";
export {
  clearTerminalScrollbackRows,
  handleForwardDelete,
  handleTerminalInput,
  normalizeTerminalOutput,
  scrollTerminalToBottom,
  writeTerminalOutput,
} from "./terminal/terminalIo";
export {
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
} from "./terminal/terminalRepl";
export { applyTerminalLogicalMetrics, calculateTerminalGrid } from "./terminal/terminalSizing";

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
