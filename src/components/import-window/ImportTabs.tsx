import type { ImportTab } from "./importModel";

const importTabs: Array<[ImportTab, string]> = [
  ["preview", "Preview"],
  ["raw", "Raw text"],
  ["columns", "Columns"],
  ["metadata", "Metadata"],
];

interface ImportTabsProps {
  activeTab: ImportTab;
  onTabChange: (tab: ImportTab) => void;
}

export function ImportTabs({ activeTab, onTabChange }: ImportTabsProps) {
  return (
    <div className="import-tabs" role="tablist" aria-label="Import workspace">
      {importTabs.map(([tab, label]) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={activeTab === tab}
          className={activeTab === tab ? "active" : undefined}
          onClick={() => onTabChange(tab)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
