import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Terminal, useTerminal } from "@wterm/react";
import "@wterm/react/css";
import type { WTerm } from "@wterm/dom";
import { BashShell } from "@wterm/just-bash";
import { defineCommand } from "just-bash";
import { useDialog } from "./dialog/DialogProvider";
import { useContextMenu } from "./context-menu/ContextMenuProvider";
import { useScispaceStore } from "../store/scispaceStore";
import { buildInitialFiles, syncBashFiles } from "./terminal/terminalFs";
import {
  clearVisibleScreenSequence,
  handleTerminalInput,
  writeTerminalOutput,
} from "./terminal/terminalIo";
import {
  applyReplTabCompletion,
  resetEditableLine,
  scispaceReplCommandLine,
  stripScispacePrefix,
  tabSequence,
  terminalControlCommandFromInput,
  terminalControlResult,
  terminalPrompt,
  terminalPromptOutput,
  terminalReplScispaceCommandFromInput,
  terminalReplShellCommandMessage,
} from "./terminal/terminalRepl";
import { applyTerminalLogicalMetrics } from "./terminal/terminalSizing";
import { useTerminalCommandLineRequest } from "./terminal/useTerminalCommandLineRequest";
import { useTerminalSizing } from "./terminal/useTerminalSizing";
import type { EditableBashShell, TerminalFsState, TerminalMode } from "./terminal/terminalTypes";

export type { TerminalFsCommandResult, TerminalFsState } from "./terminal/terminalTypes";
export { executeTerminalFsCommand } from "./terminal/terminalFs";
export {
  clearTerminalScrollbackRows,
  handleForwardDelete,
  handleKillLineRight,
  handleMoveWordLeft,
  handleMoveWordRight,
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
  const files = useScispaceStore((state) => state.files);
  const datasets = useScispaceStore((state) => state.datasets);
  const workspaceScale = useScispaceStore((state) => state.viewport.scale);
  const runScispace = useScispaceStore((state) => state.runScispace);
  const terminalCommandLineRequest = useScispaceStore((state) => state.terminalCommandLineRequest);
  const { openContextMenu } = useContextMenu();
  const { confirm } = useDialog();
  const pastePending = useRef(false);
  const filesRef = useRef(files);
  const datasetsRef = useRef(datasets);

  const initialFiles = useMemo(() => buildInitialFiles(files), [files]);

  const { scrollToBottom, syncTerminalSize, terminalSize } = useTerminalSizing({
    resize,
    terminalRef,
    viewportRef,
    wtermRef: ref,
    workspaceScale,
  });

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
        env: { HOME: "/home/user", SHELL: "/bin/bash", TERM: "xterm-256color" },
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
        defineCommand("scispace", async (args, context) => {
          if (args[0] === "repl") {
            terminalFsStateRef.current = { cwd: shell.cwd };
            return applyControlResult(terminalControlResult("repl", [], terminalModeRef.current));
          }
          const [command = "", ...options] = args;
          const result = await runScispace(scispaceReplCommandLine(command, options, context.cwd), {
            source: "terminal",
          });
          scrollToBottom();
          const failed = result.kind === "error";
          return {
            stdout: failed ? "" : `${result.output}\n`,
            stderr: failed ? `${result.output}\n` : "",
            exitCode: failed ? 1 : 0,
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

  const executeReplCommand = useCallback(
    async (replCommand: string, fromPaste = false) => {
      if (!replCommand) {
        writeOutput(`\r\n${terminalPrompt("repl", terminalFsStateRef.current.cwd)}`);
        scrollToBottom();
        return;
      }
      const [command = "", ...args] = replCommand.split(/\s+/);
      if (fromPaste && command === "shell") {
        writeOutput(
          terminalPromptOutput(
            "Enter shell separately after the pasted commands.",
            "repl",
            terminalFsStateRef.current.cwd,
          ),
        );
        return;
      }
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
      const result = await runScispace(replCommand, { source: "terminal" });
      writeOutput(
        terminalPromptOutput(
          result.output,
          terminalModeRef.current.mode,
          terminalFsStateRef.current.cwd,
        ),
      );
      scrollToBottom();
    },
    [runScispace, scrollToBottom, writeOutput, writeTerminalControlResult],
  );

  const reviewReplPaste = useCallback(
    async (text: string) => {
      if (pastePending.current) return;
      pastePending.current = true;
      const projectId = useScispaceStore.getState().currentProjectId;
      try {
        const accepted = await confirm({
          title: "Run pasted SciSpace commands?",
          message: text,
          confirmLabel: "Run commands",
        });
        if (
          !accepted ||
          terminalModeRef.current.mode !== "repl" ||
          useScispaceStore.getState().currentProjectId !== projectId
        )
          return;
        const shell = shellRef.current;
        const editableShell = shell as unknown as EditableBashShell | null;
        if (editableShell?._line) {
          resetEditableLine(shell, "");
          writeOutput("\r\x1b[2K" + terminalPrompt("repl", terminalFsStateRef.current.cwd));
        }
        for (const line of text.split("\n")) {
          const command = line.trim();
          if (!command || useScispaceStore.getState().currentProjectId !== projectId) continue;
          writeOutput(command);
          resetEditableLine(shell, command);
          await executeReplCommand(stripScispacePrefix(command), true);
        }
      } finally {
        pastePending.current = false;
      }
    },
    [confirm, executeReplCommand, writeOutput],
  );

  const handleData = useCallback(
    (data: string) => {
      if (pastePending.current) return;
      if (terminalModeRef.current.mode === "repl" && data !== "\r" && data !== "\n") {
        const pasteStart = "\x1b[200~";
        const pasteEnd = "\x1b[201~";
        const text =
          data.startsWith(pasteStart) && data.endsWith(pasteEnd)
            ? data.slice(pasteStart.length, -pasteEnd.length)
            : data;
        if (/[\r\n]/.test(text)) {
          void reviewReplPaste(text.replace(/\r\n?/g, "\n"));
          return;
        }
        data = text;
      }
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
        void executeReplCommand(replCommand);
        return;
      }
      void handleTerminalInput(shellRef.current, data).then(scrollToBottom);
    },
    [executeReplCommand, reviewReplPaste, scrollToBottom, writeTerminalControlResult],
  );

  useEffect(() => {
    const shell = shellRef.current;
    filesRef.current = files;
    void syncBashFiles(shell?.bash, files);
  }, [files]);

  useEffect(() => {
    datasetsRef.current = datasets;
  }, [datasets]);

  useTerminalCommandLineRequest({
    commandLineRequestIdRef,
    handleData,
    request: terminalCommandLineRequest,
    scrollToBottom,
    shellRef,
    terminalFsStateRef,
    terminalModeRef,
    writeOutput,
  });

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
        <span>{terminalControlState.mode === "bash" ? "just-bash shell" : "scispace REPL"}</span>
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
