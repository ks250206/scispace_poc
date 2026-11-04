import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  inspectColumnConversion,
  isColumnDateFormat,
  isConversionType,
  type ColumnConversionType,
  type ColumnDateFormat,
} from "../../domain/columnConversion";
import { quoteCommandToken } from "../../domain/scispace/commandUtils";
import type { Dataset, DatasetColumn, ScispaceCommandResult } from "../../domain/types";

interface ColumnConversionDialogProps {
  dataset: Dataset;
  column: DatasetColumn;
  onClose: () => void;
  onRun: (command: string) => Promise<ScispaceCommandResult>;
}

export function ColumnConversionDialog({
  dataset,
  column,
  onClose,
  onRun,
}: ColumnConversionDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [type, setType] = useState<ColumnConversionType>("number");
  const [dateFormat, setDateFormat] = useState<ColumnDateFormat>("iso");
  const [invalidAsMissing, setInvalidAsMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const format = type === "date" ? dateFormat : "iso";
  const preview = useMemo(
    () => inspectColumnConversion(dataset, column.id, type, format),
    [dataset, column.id, type, format],
  );
  const invalidCount = preview.invalidRows.length;
  const blocked = busy || (invalidCount > 0 && !invalidAsMissing);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  const apply = async () => {
    if (blocked) return;
    setBusy(true);
    setError("");
    const command = [
      `table-edit ${quoteCommandToken(dataset.id)} action=convert-column`,
      `column=${quoteCommandToken(column.id)}`,
      `type=${type} format=${format} invalid=${invalidAsMissing ? "missing" : "abort"}`,
    ].join(" ");
    try {
      const result = await onRun(command);
      if (result.kind === "error") setError(result.output);
      else onClose();
    } catch {
      setError("Could not save the column conversion.");
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <dialog
      ref={dialogRef}
      className="app-dialog column-conversion-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void apply();
        }}
      >
        <header className="app-dialog-header">
          <h2 id={titleId}>Convert column type</h2>
        </header>
        <p className="app-dialog-message">
          {dataset.name} / {column.name} ({column.dataType})
        </p>
        <label>
          Target type
          <select
            value={type}
            disabled={busy}
            onChange={(event) => {
              const next = event.currentTarget.value;
              if (isConversionType(next)) setType(next);
              setInvalidAsMissing(false);
              setError("");
            }}
          >
            <option value="number">Number</option>
            <option value="string">String</option>
            <option value="date">Date</option>
            <option value="datetime">Date and time</option>
            <option value="time">Time</option>
          </select>
        </label>
        {type === "date" && (
          <label>
            Input date format
            <select
              value={dateFormat}
              disabled={busy}
              onChange={(event) => {
                const next = event.currentTarget.value;
                if (isColumnDateFormat(next)) setDateFormat(next);
                setInvalidAsMissing(false);
                setError("");
              }}
            >
              <option value="iso">YYYY-MM-DD (ISO)</option>
              <option value="dmy">DD/MM/YYYY</option>
              <option value="mdy">MM/DD/YYYY</option>
            </select>
          </label>
        )}
        {type === "time" && (
          <p className="app-dialog-message">Use 24-hour time, for example 09:30 or 14:30:45.250.</p>
        )}
        {type === "datetime" && (
          <p className="app-dialog-message">
            Use ISO date and time with Z or an offset, for example 2026-11-04T14:30+09:00. Values
            are stored in UTC.
          </p>
        )}
        <p className="app-dialog-message" aria-live="polite">
          {preview.converted} convertible, {preview.blank} blank, {invalidCount} invalid
        </p>
        {preview.samples.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Row</th>
                <th>Original</th>
                <th>Converted</th>
              </tr>
            </thead>
            <tbody>
              {preview.samples.map(({ row, before, after }) => (
                <tr key={row}>
                  <td>{row}</td>
                  <td>{String(before)}</td>
                  <td>{String(after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {invalidCount > 0 && (
          <>
            <details>
              <summary>Invalid row numbers ({invalidCount})</summary>
              <p className="app-dialog-message">{preview.invalidRows.join(", ")}</p>
            </details>
            <label className="column-conversion-policy">
              <input
                type="checkbox"
                disabled={busy}
                checked={invalidAsMissing}
                onChange={(event) => setInvalidAsMissing(event.currentTarget.checked)}
              />
              Set invalid values to missing
            </label>
          </>
        )}
        {error && (
          <p role="alert" className="app-dialog-message">
            {error}
          </p>
        )}
        <div className="app-dialog-actions">
          <button type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={blocked}>
            Convert
          </button>
        </div>
      </form>
    </dialog>,
    document.body,
  );
}
