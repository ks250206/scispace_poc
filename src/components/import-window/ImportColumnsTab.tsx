import type { Dataset, PendingImport } from "../../domain/types";

interface ImportColumnsTabProps {
  allPreview?: Dataset;
  pendingImport: PendingImport;
  onRenameColumn: (columnId: string, name: string) => void;
  onToggleExcludedColumn: (columnId: string, checked: boolean) => void;
}

export function ImportColumnsTab({
  allPreview,
  pendingImport,
  onRenameColumn,
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
          <span>Rename columns and exclude fields before creating the dataset.</span>
        </div>
        <span>{`${allPreview.columns.length} columns`}</span>
      </div>
      <div className="column-name-editor">
        {allPreview.columns.map((column, index) => (
          <label key={JSON.stringify([column.id, column.name, index])}>
            <span>{`Column ${index + 1}`}</span>
            <input
              aria-label={`Column name ${column.id}`}
              defaultValue={column.name}
              onBlur={(event) => {
                const input = event.currentTarget;
                const name = input.value.trim();
                input.value = name || column.name;
                if (name !== column.name && (name || pendingImport.options.columnNames[index])) {
                  onRenameColumn(column.id, name);
                }
              }}
            />
          </label>
        ))}
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
