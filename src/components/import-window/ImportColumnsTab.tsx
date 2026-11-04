import {
  isColumnDateFormat,
  isConversionType,
  type ColumnConversionType,
  type ColumnDateFormat,
} from "../../domain/columnConversion";
import type { Dataset, PendingImport } from "../../domain/types";

interface ImportColumnsTabProps {
  allPreview?: Dataset;
  pendingImport: PendingImport;
  onSetColumnType: (
    index: number,
    type: ColumnConversionType | "auto",
    format?: ColumnDateFormat,
  ) => void;
  onRenameColumn: (columnId: string, name: string) => void;
  onToggleExcludedColumn: (columnId: string, checked: boolean) => void;
}

export function ImportColumnsTab({
  allPreview,
  pendingImport,
  onRenameColumn,
  onSetColumnType,
  onToggleExcludedColumn,
}: ImportColumnsTabProps) {
  if (!allPreview) {
    return <div className="import-tab-empty">No columns are available for this import.</div>;
  }

  return (
    <section className="import-column-panel">
      <div className="import-panel-heading">
        <div>
          <strong>Columns</strong>
          <span>Rename columns, select their types, and exclude fields before import.</span>
        </div>
        <span>{`${allPreview.columns.length} columns`}</span>
      </div>
      <div className="column-name-editor">
        {allPreview.columns.map((column, index) => {
          const conversion = pendingImport.options.columnTypes?.[index];
          return (
            <div
              className="import-column-field"
              key={JSON.stringify([column.id, column.name, index])}
            >
              <label>
                <span>{`Column ${index + 1}`}</span>
                <input
                  aria-label={`Column name ${column.id}`}
                  defaultValue={column.name}
                  onBlur={(event) => {
                    const input = event.currentTarget;
                    const name = input.value.trim();
                    input.value = name || column.name;
                    if (
                      name !== column.name &&
                      (name || pendingImport.options.columnNames[index])
                    ) {
                      onRenameColumn(column.id, name);
                    }
                  }}
                />
              </label>
              {pendingImport.mode === "tabular" && (
                <>
                  <label>
                    <span>Type</span>
                    <select
                      aria-label={`Column type ${column.name}`}
                      value={conversion?.type ?? "auto"}
                      onChange={(event) => {
                        const type = event.currentTarget.value;
                        if (type === "auto" || isConversionType(type)) onSetColumnType(index, type);
                      }}
                    >
                      <option value="auto">Auto</option>
                      <option value="number">Number</option>
                      <option value="string">String</option>
                      <option value="date">Date</option>
                      <option value="datetime">Date and time</option>
                      <option value="time">Time</option>
                    </select>
                  </label>
                  {conversion?.type === "date" && (
                    <label>
                      <span>Date format</span>
                      <select
                        aria-label={`Date format ${column.name}`}
                        value={conversion.format ?? "iso"}
                        onChange={(event) => {
                          const format = event.currentTarget.value;
                          if (isColumnDateFormat(format)) onSetColumnType(index, "date", format);
                        }}
                      >
                        <option value="iso">YYYY-MM-DD</option>
                        <option value="dmy">DD/MM/YYYY</option>
                        <option value="mdy">MM/DD/YYYY</option>
                      </select>
                    </label>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
      {pendingImport.mode === "tabular" ? (
        <div className="column-import-editor">
          <div className="column-import-list">
            {allPreview.columns.map((column) => {
              const isExcluded = pendingImport.options.excludedColumnIds.includes(column.id);
              return (
                <label key={column.id} className={isExcluded ? "excluded" : undefined}>
                  <input
                    type="checkbox"
                    checked={isExcluded}
                    onChange={(event) =>
                      onToggleExcludedColumn(column.id, event.currentTarget.checked)
                    }
                  />
                  <span>{column.name}</span>
                  <small>{column.dataType}</small>
                  <small>{isExcluded ? "delete" : "import"}</small>
                </label>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
