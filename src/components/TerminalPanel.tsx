import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Terminal, useTerminal } from "@wterm/react";
import "@wterm/react/css";
import type { WTerm } from "@wterm/dom";
import { BashShell } from "@wterm/just-bash";
import { defineCommand } from "just-bash";
import { useScispaceStore } from "../store/scispaceStore";

const toBashPath = (path: string): string => path.replace(/^~\//, "/home/user/");
const deleteSequence = "\x1b[3~";

type EditableBashShell = {
  _cursor?: number;
  _line?: string;
  _write?: (data: string) => void;
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
  const viewportRef = useRef<HTMLDivElement>(null);
  const commandLineRequestIdRef = useRef<string | undefined>(undefined);
  const [terminalSize, setTerminalSize] = useState<{ cols: number; rows: number }>();
  const files = useScispaceStore((state) => state.files);
  const runScispace = useScispaceStore((state) => state.runScispace);
  const terminalCommandLineRequest = useScispaceStore((state) => state.terminalCommandLineRequest);

  const initialFiles = useMemo(
    () =>
      Object.fromEntries([
        ["/home/user/README.txt", "SciSpace terminal. Try: scispace lsdata\n"],
        ...files
          .filter((file) => file.text)
          .map((file) => [toBashPath(file.path), file.text ?? ""]),
      ]),
    [files],
  );

  const syncTerminalSize = useCallback(() => {
    const viewport = viewportRef.current;
    const terminalInstance = terminalRef.current ?? ref.current?.instance;
    if (!viewport) return;

    const terminal = terminalInstance?.element;
    const terminalStyle = terminal ? getComputedStyle(terminal) : undefined;
    const horizontalPadding = terminalStyle
      ? (Number.parseFloat(terminalStyle.paddingLeft) || 0) +
        (Number.parseFloat(terminalStyle.paddingRight) || 0)
      : 24;
    const verticalPadding = terminalStyle
      ? (Number.parseFloat(terminalStyle.paddingTop) || 0) +
        (Number.parseFloat(terminalStyle.paddingBottom) || 0)
      : 16;
    const probe = document.createElement("span");
    probe.textContent = "M";
    probe.style.visibility = "hidden";
    probe.style.position = "absolute";
    probe.style.font = terminalStyle?.font ?? "14px Menlo, Consolas, monospace";
    viewport.append(probe);
    const charWidth = probe.getBoundingClientRect().width || 8.4;
    probe.remove();

    const rowHeight = terminalStyle
      ? Number.parseFloat(terminalStyle.getPropertyValue("--term-row-height")) || 17
      : 17;
    const { width, height } = viewport.getBoundingClientRect();
    const cols = Math.max(1, Math.floor((width - horizontalPadding) / charWidth));
    const rows = Math.max(1, Math.floor((height - verticalPadding) / rowHeight));
    setTerminalSize((current) =>
      current && current.cols === cols && current.rows === rows ? current : { cols, rows },
    );
    terminalInstance?.resize(cols, rows);
    resize(cols, rows);
  }, [ref, resize]);

  const handleReady = useCallback(
    async (terminal: WTerm) => {
      terminalRef.current = terminal;
      if (shellRef.current) return;
      syncTerminalSize();
      const shell = new BashShell({
        files: initialFiles,
        cwd: "/home/user",
        greeting: ["SciSpace shell", "Run `scispace help` or inspect ~/raw with `ls raw`."],
        prompt: (cwd) => `scispace:${cwd.replace("/home/user", "~")}$ `,
      });
      shellRef.current = shell;
      await shell.attach((data) => write(data));
      shell.bash?.registerCommand(
        defineCommand("scispace", async (args) => {
          const result = await runScispace(args.join(" "), { source: "terminal" });
          return {
            stdout: `${result.output}\n`,
            stderr: result.kind === "error" ? `${result.output}\n` : "",
            exitCode: result.kind === "error" ? 1 : 0,
          };
        }),
      );
    },
    [initialFiles, runScispace, syncTerminalSize, write],
  );

  const handleData = useCallback((data: string) => {
    void handleTerminalInput(shellRef.current, data);
  }, []);

  useEffect(() => {
    const shell = shellRef.current;
    const bash = shell?.bash;
    if (!bash) return;
    void (async () => {
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
    })();
  }, [files]);

  useEffect(() => {
    if (!terminalCommandLineRequest || !shellRef.current) return;
    if (commandLineRequestIdRef.current === terminalCommandLineRequest.id) return;
    commandLineRequestIdRef.current = terminalCommandLineRequest.id;
    void shellRef.current.handleInput(`scispace ${terminalCommandLineRequest.command}`);
  }, [terminalCommandLineRequest]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    const observer = new ResizeObserver(() => syncTerminalSize());
    observer.observe(viewport);
    syncTerminalSize();
    return () => observer.disconnect();
  }, [syncTerminalSize]);

  return (
    <section className="terminal-panel">
      <header className="terminal-header">
        <span>scispace shell</span>
        <span>wterm + just-bash</span>
      </header>
      <div ref={viewportRef} className="terminal-viewport">
        {terminalSize ? (
          <Terminal
            ref={ref}
            className="terminal-host"
            cols={terminalSize.cols}
            rows={terminalSize.rows}
            theme="light"
            onReady={(terminal) => void handleReady(terminal)}
            onData={handleData}
          />
        ) : null}
      </div>
    </section>
  );
}
