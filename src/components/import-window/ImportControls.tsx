import type { ImportDelimiter, PendingImport } from "../../domain/types";
import { quoteImportCommandArg } from "./importCommands";

const delimiterOptions: Array<{ value: ImportDelimiter; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "comma", label: "Comma" },
  { value: "tab", label: "Tab" },
  { value: "space", label: "Space" },
  { value: "semicolon", label: "Semicolon" },
];

interface ImportControlsProps {
  pendingImport: PendingImport;
  onImportSet: (options: string) => void;
  onCancel: () => void;
  onImport: () => void;
}

export function ImportControls({
  pendingImport,
  onImportSet,
  onCancel,
  onImport,
}: ImportControlsProps) {
  return (
    <div className="import-controls">
      <div className="import-controls-heading">
        <strong>Parse settings</strong>
        <span>Adjust how the raw text is interpreted before import.</span>
      </div>
      <div className="import-control-fields">
        <label>
          <span>Skip rows</span>
          <input
            type="number"
            min={0}
            value={pendingImport.options.skipRows}
            onChange={(event) =>
              onImportSet(`skipRows=${Math.max(0, Number(event.currentTarget.value) || 0)}`)
            }
          />
        </label>
        <label>
          <span>Delimiter</span>
          <select
            value={pendingImport.options.delimiter}
            onChange={(event) => onImportSet(`delimiter=${event.currentTarget.value}`)}
          >
            {delimiterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Skip prefix</span>
          <input
            value={pendingImport.options.commentPrefix}
            placeholder="#"
            onChange={(event) =>
              onImportSet(`commentPrefix=${quoteImportCommandArg(event.currentTarget.value)}`)
            }
          />
        </label>
        <label>
          <span>Mode</span>
          <select
            value={pendingImport.mode}
            onChange={(event) => onImportSet(`mode=${event.currentTarget.value}`)}
          >
            <option value="tabular">Tabular</option>
            <option value="raw">Raw</option>
          </select>
        </label>
        <label className="import-checkbox">
          <input
            type="checkbox"
            checked={pendingImport.options.hasHeader}
            onChange={(event) => onImportSet(`hasHeader=${event.currentTarget.checked}`)}
          />
          <span>Header row</span>
        </label>
      </div>
      <div className="import-actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="primary" onClick={onImport}>
          Import
        </button>
      </div>
    </div>
  );
}
