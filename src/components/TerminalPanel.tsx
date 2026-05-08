import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Terminal, useTerminal } from "@wterm/react";
import "@wterm/react/css";
import type { WTerm } from "@wterm/dom";
import { BashShell } from "@wterm/just-bash";
import { defineCommand } from "just-bash";
import type { VirtualFile } from "../domain/types";
import { useScispaceStore } from "../store/scispaceStore";

const toBashPath = (path: string): string => path.replace(/^~\//, "/home/user/");
const deleteSequence = "\x1b[3~";
const clearVisibleScreenSequence = "\x1b[2J\x1b[H";
const clearScrollbackSequence = "\x1b[3J";

type EditableBashShell = {
  _cursor?: number;
  _line?: string;
  _write?: (data: string) => void;
};

type TerminalSize = { cols: number; rows: number };

type TerminalMetrics = {
  charWidth: number;
  horizontalPadding: number;
  rowHeight: number;
  verticalPadding: number;
};

const defaultTerminalMetrics: TerminalMetrics = {
  charWidth: 8.4,
  horizontalPadding: 24,
  rowHeight: 17,
  verticalPadding: 16,
};

const workspaceScaleOrDefault = (scale: number): number => Math.max(0.1, scale || 1);

const buildInitialFiles = (files: VirtualFile[]): Record<string, string> =>
  Object.fromEntries([
    ["/home/user/README.txt", "SciSpace terminal. Try: scispace lsdata\n"],
    ...files.filter((file) => file.text).map((file) => [toBashPath(file.path), file.text ?? ""]),
  ]);

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
  const viewportRef = useRef<HTMLDivElement>(null);
  const commandLineRequestIdRef = useRef<string | undefined>(undefined);
  const [terminalSize, setTerminalSize] = useState<TerminalSize>();
  const files = useScispaceStore((state) => state.files);
  const workspaceScale = useScispaceStore((state) => state.viewport.scale);
  const runScispace = useScispaceStore((state) => state.runScispace);
  const terminalCommandLineRequest = useScispaceStore((state) => state.terminalCommandLineRequest);

  const initialFiles = useMemo(() => buildInitialFiles(files), [files]);

  const syncTerminalSize = useCallback(() => {
    const viewport = viewportRef.current;
    const terminalInstance = terminalRef.current ?? ref.current?.instance;
    if (!viewport) return;

    const terminal = terminalInstance?.element;
    const metrics = measureTerminalMetrics(viewport, terminal, workspaceScale);
    const { width, height } = viewport.getBoundingClientRect();
    const { cols, rows } = calculateTerminalGrid({
      viewportWidth: width,
      viewportHeight: height,
      charWidth: metrics.charWidth,
      rowHeight: metrics.rowHeight,
      horizontalPadding: metrics.horizontalPadding,
      verticalPadding: metrics.verticalPadding,
      workspaceScale,
    });
    setTerminalSize((current) =>
      current && current.cols === cols && current.rows === rows ? current : { cols, rows },
    );
    terminalInstance?.resize(cols, rows);
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
      await shell.attach(writeOutput);
      shell.bash?.registerCommand(
        defineCommand("scispace", async (args) => {
          const result = await runScispace(args.join(" "), { source: "terminal" });
          scrollToBottom();
          return {
            stdout: `${result.output}\n`,
            stderr: result.kind === "error" ? `${result.output}\n` : "",
            exitCode: result.kind === "error" ? 1 : 0,
          };
        }),
      );
    },
    [initialFiles, runScispace, scrollToBottom, syncTerminalSize, writeOutput],
  );

  const handleData = useCallback(
    (data: string) => {
      void handleTerminalInput(shellRef.current, data).then(scrollToBottom);
    },
    [scrollToBottom],
  );

  useEffect(() => {
    const shell = shellRef.current;
    void syncBashFiles(shell?.bash, files);
  }, [files]);

  useEffect(() => {
    if (!terminalCommandLineRequest || !shellRef.current) return;
    if (commandLineRequestIdRef.current === terminalCommandLineRequest.id) return;
    commandLineRequestIdRef.current = terminalCommandLineRequest.id;
    void shellRef.current
      .handleInput(`scispace ${terminalCommandLineRequest.command}`)
      .then(scrollToBottom);
  }, [scrollToBottom, terminalCommandLineRequest]);

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
