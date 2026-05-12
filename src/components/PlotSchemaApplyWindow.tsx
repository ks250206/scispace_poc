import { useEffect, useMemo, useState } from "react";
import { useScispaceStore } from "../store/scispaceStore";

interface PlotSchemaApplyWindowProps {
  plotId: string;
  windowId: string;
}

export function PlotSchemaApplyWindow({ plotId, windowId }: PlotSchemaApplyWindowProps) {
  const plot = useScispaceStore((state) => state.plotSpecs.find((item) => item.id === plotId));
  const runScispace = useScispaceStore((state) => state.runScispace);
  const closeWindow = useScispaceStore((state) => state.closeWindow);
  const sendCommandToTerminalLine = useScispaceStore((state) => state.sendCommandToTerminalLine);
  const defaultSchema = useMemo(() => JSON.stringify(plot, null, 2), [plot]);
  const [schemaText, setSchemaText] = useState(defaultSchema);
  const command = `plot-apply-schema ${plotId} json=${encodeURIComponent(schemaText)}`;

  useEffect(() => {
    setSchemaText(defaultSchema);
  }, [defaultSchema]);

  if (!plot) return <div className="empty-state">Plot not found.</div>;

  return (
    <div className="plot-schema-apply-window dataset-tool-window">
      <section className="dataset-tool-panel">
        <h3>Apply Plot Schema</h3>
        <p className="muted">Paste JSON from plot-schema. The target plot id is preserved.</p>
        <label>
          <span>Schema JSON</span>
          <textarea
            aria-label="Plot schema JSON"
            value={schemaText}
            onChange={(event) => setSchemaText(event.currentTarget.value)}
          />
        </label>
      </section>
      <section className="dataset-tool-command">
        <span>Command</span>
        <code>{command}</code>
      </section>
      <footer className="dataset-tool-actions">
        <button
          type="button"
          onClick={() => {
            void runScispace(command, { source: "gui" });
            closeWindow(windowId);
          }}
        >
          Apply
        </button>
        <button type="button" onClick={() => sendCommandToTerminalLine(command)}>
          To Cmd Line
        </button>
        <button type="button" onClick={() => closeWindow(windowId)}>
          Cancel
        </button>
      </footer>
    </div>
  );
}
