import { useEffect, type RefObject } from "react";
import type { BashShell } from "@wterm/just-bash";
import type { ScispaceState } from "../../store/scispace/stateTypes";
import { resetEditableLine, terminalCommandLineText, terminalPrompt } from "./terminalRepl";
import type { EditableBashShell, TerminalFsState, TerminalMode } from "./terminalTypes";

interface UseTerminalCommandLineRequestOptions {
  commandLineRequestIdRef: RefObject<string | undefined>;
  handleData: (data: string) => void;
  request: ScispaceState["terminalCommandLineRequest"];
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
    const wrapForShell = Boolean(request.scispace && terminalModeRef.current.mode === "bash");
    void shellRef.current
      .handleInput(terminalCommandLineText(request.command, wrapForShell))
      .then(() => {
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
