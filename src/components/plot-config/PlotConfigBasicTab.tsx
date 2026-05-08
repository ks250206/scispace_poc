import type { Dataset, PlotSpec, PlotType } from "../../domain/types";
import { ConfigField, ConfigGroup } from "./PlotConfigFields";
import { plotSetCommand } from "./plotConfigCommands";
import { plotSizeDraftFromSpec, type PlotSizeDraft } from "./plotConfigModel";

interface PlotConfigBasicTabProps {
  currentPlotId: string;
  dataset: Dataset;
  spec: PlotSpec;
  plotSizeDraft: PlotSizeDraft;
  onSetPlotSizeDraft: (updater: (current: PlotSizeDraft) => PlotSizeDraft) => void;
  onCommitPlotSize: () => void;
  onRunPlotCommand: (command: string) => void;
  onSetTitle: (title: string) => void;
  onSetPlotType: (plotType: PlotType) => void;
  onSetGrid: (axis: "x" | "y", value: boolean) => void;
  onSetBorder: (border: boolean) => void;
  onSetPlotFont: (patch: Partial<PlotSpec["font"]>) => void;
  onSetPlotPadding: (patch: Partial<PlotSpec["padding"]>) => void;
}

export function PlotConfigBasicTab({
  currentPlotId,
  dataset,
  spec,
  plotSizeDraft,
  onSetPlotSizeDraft,
  onCommitPlotSize,
  onRunPlotCommand,
  onSetTitle,
  onSetPlotType,
  onSetGrid,
  onSetBorder,
  onSetPlotFont,
  onSetPlotPadding,
}: PlotConfigBasicTabProps) {
  return (
    <div className="plot-config-section" role="tabpanel">
      <div className="plot-config-groups">
        <ConfigGroup title="Data">
          <div className="plot-field-grid two">
            <ConfigField label="Title">
              <input
                aria-label="Plot title"
                className="plot-title-input"
                value={spec.title}
                onChange={(event) => onSetTitle(event.target.value)}
              />
            </ConfigField>
            <ConfigField label="X column">
              <select
                aria-label="Plot x column"
                value={spec.x}
                onChange={(event) =>
                  onRunPlotCommand(
                    plotSetCommand(currentPlotId, {
                      x: event.target.value,
                      axisX: event.target.value,
                    }),
                  )
                }
              >
                {dataset.columns.map((column) => (
                  <option key={column.id} value={column.id}>
                    {column.name}
                  </option>
                ))}
              </select>
            </ConfigField>
          </div>
        </ConfigGroup>

        <ConfigGroup title="Appearance">
          <div className="plot-field-grid three">
            <ConfigField label="Type">
              <select
                aria-label="Plot type"
                value={spec.plotType}
                onChange={(event) => onSetPlotType(event.target.value as PlotType)}
              >
                <option value="line">line</option>
                <option value="line-marker">line + marker</option>
                <option value="marker">marker</option>
              </select>
            </ConfigField>
            <label className="plot-config-check">
              <input
                aria-label="Grid x"
                type="checkbox"
                checked={spec.grid.x}
                onChange={(event) => onSetGrid("x", event.target.checked)}
              />
              <span>Grid x</span>
            </label>
            <label className="plot-config-check">
              <input
                aria-label="Grid y"
                type="checkbox"
                checked={spec.grid.y}
                onChange={(event) => onSetGrid("y", event.target.checked)}
              />
              <span>Grid y</span>
            </label>
            <label className="plot-config-check">
              <input
                aria-label="Plot border"
                type="checkbox"
                checked={spec.border}
                onChange={(event) => onSetBorder(event.target.checked)}
              />
              <span>Border</span>
            </label>
          </div>
        </ConfigGroup>

        <ConfigGroup title="Size">
          <div className="plot-field-grid four">
            <ConfigField label="Width" compact>
              <input
                aria-label="Plot width"
                type="number"
                min={120}
                max={4000}
                value={plotSizeDraft.width}
                onChange={(event) =>
                  onSetPlotSizeDraft((current) => ({ ...current, width: event.target.value }))
                }
                onBlur={onCommitPlotSize}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  if (event.key === "Escape") {
                    onSetPlotSizeDraft(() => plotSizeDraftFromSpec(spec.size));
                    event.currentTarget.blur();
                  }
                }}
              />
            </ConfigField>
            <ConfigField label="Height" compact>
              <input
                aria-label="Plot height"
                type="number"
                min={120}
                max={4000}
                value={plotSizeDraft.height}
                onChange={(event) =>
                  onSetPlotSizeDraft((current) => ({ ...current, height: event.target.value }))
                }
                onBlur={onCommitPlotSize}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  if (event.key === "Escape") {
                    onSetPlotSizeDraft(() => plotSizeDraftFromSpec(spec.size));
                    event.currentTarget.blur();
                  }
                }}
              />
            </ConfigField>
          </div>
        </ConfigGroup>

        <ConfigGroup title="Typography">
          <div className="plot-field-grid two">
            <ConfigField label="Font family">
              <input
                aria-label="Plot font family"
                value={spec.font.family}
                onChange={(event) => onSetPlotFont({ family: event.target.value })}
              />
            </ConfigField>
            <ConfigField label="Font size" compact>
              <input
                aria-label="Plot font size"
                type="number"
                min={1}
                value={spec.font.size}
                onChange={(event) => onSetPlotFont({ size: Number(event.target.value) })}
              />
            </ConfigField>
          </div>
        </ConfigGroup>

        <ConfigGroup title="Plot Padding">
          <div className="plot-field-grid four">
            {(["top", "right", "bottom", "left"] as const).map((side) => (
              <ConfigField key={side} label={side} compact>
                <input
                  aria-label={`Plot padding ${side}`}
                  type="number"
                  min={0}
                  value={spec.padding[side]}
                  onChange={(event) => onSetPlotPadding({ [side]: Number(event.target.value) })}
                />
              </ConfigField>
            ))}
          </div>
        </ConfigGroup>
      </div>
    </div>
  );
}
