export type EditableBashShell = {
  _buffer?: string;
  _cursor?: number;
  _history?: string[];
  _historyPos?: number;
  _line?: string;
  _tabComplete?: () => Promise<void>;
  _write?: (data: string) => void;
};

export type TerminalMode = "repl" | "bash";

export type TerminalSize = { cols: number; rows: number };

export type TerminalFsState = { cwd: string };

export type TerminalFsCommandResult = {
  clear?: boolean;
  cwd: string;
  exitCode: number;
  output: string;
};
