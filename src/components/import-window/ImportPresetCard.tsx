import type { PendingImport } from "../../domain/types";

interface ImportPresetCardProps {
  pendingImport: PendingImport;
  metadataEntries: Array<[string, string]>;
  onReapplyPreset: () => void;
}

export function ImportPresetCard({
  pendingImport,
  metadataEntries,
  onReapplyPreset,
}: ImportPresetCardProps) {
  if (!pendingImport.detectedPreset) return null;

  return (
    <section className="import-preset-card">
      <div className="import-preset-card-header">
        <div>
          <span className="import-summary-kicker">Detected preset</span>
          <strong>{`Detected: ${pendingImport.detectedPreset.label}`}</strong>
        </div>
        {pendingImport.presetOverridden ? (
          <span className="import-manual-badge">Manual override</span>
        ) : null}
      </div>
      <div className="import-preset-details">
        <span>{`Data starts at line ${pendingImport.detectedPreset.dataStartLine}`}</span>
        <button
          type="button"
          onClick={onReapplyPreset}
          aria-label={`Reapply ${pendingImport.detectedPreset.label} preset`}
        >
          Reapply preset
        </button>
      </div>
      {metadataEntries.length > 0 ? (
        <dl className="import-preset-metadata">
          {metadataEntries.map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}
