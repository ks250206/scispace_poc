import { BashShell } from "@wterm/just-bash";
import type { EditableBashShell } from "./terminalTypes";

export const deleteSequence = "\x1b[3~";
export const controlKSequence = "\x0b";
export const altLeftSequences = ["\x1b[1;3D", "\x1b[1;9D", "\x1bb"] as const;
export const altRightSequences = ["\x1b[1;3C", "\x1b[1;9C", "\x1bf"] as const;
export const clearVisibleScreenSequence = "\x1b[2J\x1b[H";
export const clearScrollbackSequence = "\x1b[3J";

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

type WritableEditableBashShell = EditableBashShell & {
  _cursor: number;
  _line: string;
  _write: (data: string) => void;
};

const editableShellFrom = (shell: BashShell | null): WritableEditableBashShell | null => {
  const editableShell = shell as unknown as EditableBashShell | null;
  if (
    !editableShell ||
    typeof editableShell._line !== "string" ||
    typeof editableShell._cursor !== "number" ||
    typeof editableShell._write !== "function"
  ) {
    return null;
  }
  return editableShell as WritableEditableBashShell;
};

export const handleKillLineRight = (shell: BashShell | null): void => {
  const editableShell = editableShellFrom(shell);
  if (!editableShell || editableShell._cursor >= editableShell._line.length) return;
  editableShell._line = editableShell._line.slice(0, editableShell._cursor);
  editableShell._write("\x1b[K");
};

const previousWordStart = (line: string, cursor: number): number => {
  let index = Math.max(0, Math.min(cursor, line.length));
  while (index > 0 && /\s/.test(line[index - 1] ?? "")) index -= 1;
  while (index > 0 && !/\s/.test(line[index - 1] ?? "")) index -= 1;
  return index;
};

const nextWordEnd = (line: string, cursor: number): number => {
  let index = Math.max(0, Math.min(cursor, line.length));
  while (index < line.length && /\s/.test(line[index] ?? "")) index += 1;
  while (index < line.length && !/\s/.test(line[index] ?? "")) index += 1;
  return index;
};

const moveEditableCursor = (shell: BashShell | null, nextCursor: number): void => {
  const editableShell = editableShellFrom(shell);
  if (!editableShell) return;
  const cursor = Math.max(0, Math.min(editableShell._cursor, editableShell._line.length));
  const boundedNextCursor = Math.max(0, Math.min(nextCursor, editableShell._line.length));
  const delta = boundedNextCursor - cursor;
  if (delta < 0) editableShell._write(`\x1b[${Math.abs(delta)}D`);
  if (delta > 0) editableShell._write(`\x1b[${delta}C`);
  editableShell._cursor = boundedNextCursor;
};

export const handleMoveWordLeft = (shell: BashShell | null): void => {
  const editableShell = editableShellFrom(shell);
  if (!editableShell) return;
  moveEditableCursor(shell, previousWordStart(editableShell._line, editableShell._cursor));
};

export const handleMoveWordRight = (shell: BashShell | null): void => {
  const editableShell = editableShellFrom(shell);
  if (!editableShell) return;
  moveEditableCursor(shell, nextWordEnd(editableShell._line, editableShell._cursor));
};

type TerminalSpecialInput = {
  sequence: string;
  handle: (shell: BashShell | null) => void;
};

const terminalSpecialInputs: TerminalSpecialInput[] = [
  { sequence: deleteSequence, handle: handleForwardDelete },
  { sequence: controlKSequence, handle: handleKillLineRight },
  ...altLeftSequences.map((sequence) => ({ sequence, handle: handleMoveWordLeft })),
  ...altRightSequences.map((sequence) => ({ sequence, handle: handleMoveWordRight })),
];

const findNextSpecialInput = (data: string): (TerminalSpecialInput & { index: number }) | null => {
  let next: (TerminalSpecialInput & { index: number }) | null = null;
  for (const specialInput of terminalSpecialInputs) {
    const index = data.indexOf(specialInput.sequence);
    if (index >= 0 && (!next || index < next.index)) next = { ...specialInput, index };
  }
  return next;
};

export const handleTerminalInput = async (shell: BashShell | null, data: string): Promise<void> => {
  if (!shell) return;
  let remaining = data;
  while (remaining.length > 0) {
    const specialInput = findNextSpecialInput(remaining);
    if (!specialInput) {
      await shell.handleInput(remaining);
      return;
    }
    const beforeSpecialInput = remaining.slice(0, specialInput.index);
    if (beforeSpecialInput) await shell.handleInput(beforeSpecialInput);
    specialInput.handle(shell);
    remaining = remaining.slice(specialInput.index + specialInput.sequence.length);
  }
};
