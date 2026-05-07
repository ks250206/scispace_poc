import { useMemo } from "react";
import { useScispaceStore } from "../store/scispaceStore";

const formatTime = (timestamp: number): string =>
  new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(timestamp);

export function CommandHistoryWindow() {
  const history = useScispaceStore((state) => state.commandHistory);
  const runScispace = useScispaceStore((state) => state.runScispace);
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
              <div className="history-entry-meta">
                <span>{formatTime(entry.createdAt)}</span>
                <span>{entry.source}</span>
                <span>{entry.kind}</span>
                <span>{entry.status}</span>
              </div>
              <code>{entry.command}</code>
              <p>{entry.output}</p>
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
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
