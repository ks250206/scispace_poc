import type { WTerm } from "@wterm/dom";
import type { TerminalSize } from "./terminalTypes";

type TerminalMetrics = {
  charWidth: number;
  horizontalPadding: number;
  rowHeight: number;
  verticalPadding: number;
};

export const terminalLogicalRowHeight = 17;
export const terminalBottomInsetRows = 2;

const defaultTerminalMetrics: TerminalMetrics = {
  charWidth: 8.4,
  horizontalPadding: 24,
  rowHeight: terminalLogicalRowHeight,
  verticalPadding: 16,
};

const workspaceScaleOrDefault = (scale: number): number => Math.max(0.1, scale || 1);

const sumStylePixels = (style: CSSStyleDeclaration | undefined, properties: string[]): number =>
  style
    ? properties.reduce((total, property) => {
        return total + (Number.parseFloat(style.getPropertyValue(property)) || 0);
      }, 0)
    : 0;

export const measureTerminalMetrics = (
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
