import { useEffect, type RefObject } from "react";
import type { BashShell } from "@wterm/just-bash";
import { resetEditableLine, terminalCommandLineText, terminalPrompt } from "./terminalRepl";
import type { EditableBashShell, TerminalFsState, TerminalMode } from "./terminalTypes";

type TerminalCommandLineRequest = { id: string; command: string; execute?: boolean };

interface UseTerminalCommandLineRequestOptions {
  commandLineRequestIdRef: RefObject<string | undefined>;
  handleData: (data: string) => void;
  request: TerminalCommandLineRequest | undefined;
  scrollToBottom: () => void;
  shellRef: RefObject<BashShell | null>;
  terminalFsStateRef: RefObject<TerminalFsState>;
  terminalModeRef: RefObject<{ mode: TerminalMode; unsafe: boolean }>;
  writeOutput: (data: string) => void;
}

export const useTerminalCommandLineRequest = ({
  commandLineRequestIdRef,
  handleData,
  request,
  scrollToBottom,
  shellRef,
  terminalFsStateRef,
  terminalModeRef,
  writeOutput,
}: UseTerminalCommandLineRequestOptions) => {
  useEffect(() => {
    if (!request || !shellRef.current) return;
    if (commandLineRequestIdRef.current === request.id) return;
    commandLineRequestIdRef.current = request.id;
    const editableShell = shellRef.current as unknown as EditableBashShell;
    if (editableShell._line) {
      resetEditableLine(shellRef.current, "");
      writeOutput(
        `\r\x1b[2K${terminalPrompt(terminalModeRef.current.mode, terminalFsStateRef.current.cwd)}`,
      );
    }
    void shellRef.current.handleInput(terminalCommandLineText(request.command)).then(() => {
      if (request.execute) {
        handleData("\r");
        return;
      }
      scrollToBottom();
    });
  }, [
    commandLineRequestIdRef,
    handleData,
    request,
    scrollToBottom,
    shellRef,
    terminalFsStateRef,
    terminalModeRef,
    writeOutput,
  ]);
};
