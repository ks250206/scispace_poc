import { BashShell } from "@wterm/just-bash";
import type { EditableBashShell } from "./terminalTypes";

export const deleteSequence = "\x1b[3~";
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
