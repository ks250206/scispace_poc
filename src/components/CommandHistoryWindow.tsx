import { useMemo } from "react";
import { useScispaceStore } from "../store/scispaceStore";

export function CommandHistoryWindow() {
  const history = useScispaceStore((state) => state.commandHistory);
  const runScispace = useScispaceStore((state) => state.runScispace);
  const sendCommandToTerminalLine = useScispaceStore((state) => state.sendCommandToTerminalLine);
  const entries = useMemo(() => [...history].reverse(), [history]);

  const copyCommand = (command: string) => {
    void navigator.clipboard?.writeText(command);
  };

  return (
    <section className="history-window">
      {entries.length === 0 ? (
        <div className="empty-state">No scispace commands yet.</div>
      ) : (
        <ol className="history-list" aria-label="Command history">
          {entries.map((entry) => (
            <li key={entry.id} className={`history-entry ${entry.status}`}>
              <code>{entry.command}</code>
              <div className="history-entry-actions">
                <button
                  type="button"
                  aria-label={`Run ${entry.command}`}
                  onClick={() => void runScispace(entry.command, { source: "history" })}
                >
                  Run
                </button>
                <button
                  type="button"
                  aria-label={`Copy ${entry.command}`}
                  onClick={() => copyCommand(entry.command)}
                >
                  Copy
                </button>
                <button
                  type="button"
                  aria-label={`To command line ${entry.command}`}
                  onClick={() => sendCommandToTerminalLine(entry.command)}
                >
                  To cmd line
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
