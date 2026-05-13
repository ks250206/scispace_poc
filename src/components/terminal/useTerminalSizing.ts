import { useCallback, useState, type RefObject } from "react";
import type { WTerm } from "@wterm/dom";
import { scrollTerminalToBottom } from "./terminalIo";
import {
  applyTerminalLogicalMetrics,
  calculateTerminalGrid,
  measureTerminalMetrics,
  terminalBottomInsetRows,
  terminalLogicalRowHeight,
} from "./terminalSizing";
import type { TerminalSize } from "./terminalTypes";

interface TerminalHandleRef {
  current: { instance?: WTerm | null } | null;
}

interface UseTerminalSizingOptions {
  resize: (cols: number, rows: number) => void;
  terminalRef: RefObject<WTerm | null>;
  viewportRef: RefObject<HTMLDivElement | null>;
  wtermRef: TerminalHandleRef;
  workspaceScale: number;
}

export const useTerminalSizing = ({
  resize,
  terminalRef,
  viewportRef,
  wtermRef,
  workspaceScale,
}: UseTerminalSizingOptions) => {
  const [terminalSize, setTerminalSize] = useState<TerminalSize>();

  const syncTerminalSize = useCallback(() => {
    const viewport = viewportRef.current;
    const terminalInstance = terminalRef.current ?? wtermRef.current?.instance;
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
  }, [resize, terminalRef, viewportRef, wtermRef, workspaceScale]);

  const scrollToBottom = useCallback(() => {
    const terminalElement = terminalRef.current?.element ?? wtermRef.current?.instance?.element;
    scrollTerminalToBottom(terminalElement, viewportRef.current);
  }, [terminalRef, viewportRef, wtermRef]);

  return { scrollToBottom, syncTerminalSize, terminalSize };
};
