import type { PendingImport } from "../../domain/types";

interface ImportMetadataTabProps {
  pendingImport: PendingImport;
}

export function ImportMetadataTab({ pendingImport }: ImportMetadataTabProps) {
  if (!pendingImport.detectedPreset) {
    return <div className="import-tab-empty">No experimental preset was detected.</div>;
  }

  const metadataEntries = Object.entries(pendingImport.detectedPreset.metadata ?? {});

  return (
    <section className="import-metadata-panel">
      <div className="import-panel-heading">
        <div>
          <strong>{pendingImport.detectedPreset.label}</strong>
          <span>{`Data starts at line ${pendingImport.detectedPreset.dataStartLine}`}</span>
        </div>
      </div>
      {metadataEntries.length > 0 ? (
        <dl className="import-metadata-list">
          {metadataEntries.map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <div className="import-tab-empty">No metadata was extracted.</div>
      )}
    </section>
  );
}
