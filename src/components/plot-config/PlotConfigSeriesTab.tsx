import type { Dataset, PlotMarkerShape, PlotSeries, PlotSpec } from "../../domain/types";
import { CommittedTextInput, ConfigField, ConfigGroup } from "./PlotConfigFields";

interface PlotConfigSeriesTabProps {
  spec: PlotSpec;
  availableSeriesColumns: Dataset["columns"];
  seriesToAdd: string;
  onSetSeriesToAdd: (columnId: string) => void;
  onAddSeries: () => void;
  onUpdateSeries: (series: PlotSeries, patch: Partial<PlotSeries>) => void;
  onRemoveSeries: (series: PlotSeries) => void;
}

export function PlotConfigSeriesTab({
  spec,
  availableSeriesColumns,
  seriesToAdd,
  onSetSeriesToAdd,
  onAddSeries,
  onUpdateSeries,
  onRemoveSeries,
}: PlotConfigSeriesTabProps) {
  return (
    <div className="plot-series-panel plot-config-section" role="tabpanel">
      <ConfigGroup title="Add Trace">
        <div className="plot-field-grid two">
          <ConfigField label="Y column">
            <select
              aria-label="Add series"
              value={seriesToAdd}
              onChange={(event) => onSetSeriesToAdd(event.target.value)}
            >
              {availableSeriesColumns.map((column) => (
                <option key={column.id} value={column.id}>
                  {column.name}
                </option>
              ))}
            </select>
          </ConfigField>
          <button
            className="plot-config-command"
            type="button"
            disabled={!seriesToAdd}
            onClick={onAddSeries}
          >
            Add
          </button>
        </div>
      </ConfigGroup>
      {spec.series.map((series, index) => (
        <ConfigGroup key={`${series.y}-${index}`} title={`Trace: ${series.y}`}>
          <div className="plot-field-grid three">
            <ConfigField label="Label">
              <CommittedTextInput
                key={spec.id}
                label={"Series label " + series.y}
                value={series.label}
                onCommit={(label) => onUpdateSeries(series, { label })}
              />
            </ConfigField>
            <ConfigField label="Color" compact>
              <input
                aria-label={`Color ${series.y}`}
                type="color"
                value={series.color}
                onChange={(event) => onUpdateSeries(series, { color: event.target.value })}
              />
            </ConfigField>
            <ConfigField label="Draw order" compact>
              <input
                aria-label={`Draw order ${series.y}`}
                type="number"
                value={series.drawOrder}
                onChange={(event) =>
                  onUpdateSeries(series, { drawOrder: Number(event.target.value) })
                }
              />
            </ConfigField>
          </div>
          <div className="plot-subgroup-title">Line and Marker</div>
          <div className="plot-field-grid four">
            <ConfigField label="Line width" compact>
              <input
                aria-label={`Line width ${series.y}`}
                type="number"
                min={0}
                value={series.lineWidth}
                onChange={(event) =>
                  onUpdateSeries(series, { lineWidth: Number(event.target.value) })
                }
              />
            </ConfigField>
            <ConfigField label="Marker size" compact>
              <input
                aria-label={`Marker size ${series.y}`}
                type="number"
                min={0}
                value={series.markerSize}
                onChange={(event) =>
                  onUpdateSeries(series, { markerSize: Number(event.target.value) })
                }
              />
            </ConfigField>
            <ConfigField label="Marker shape">
              <select
                aria-label={`Marker shape ${series.y}`}
                value={series.markerShape}
                onChange={(event) =>
                  onUpdateSeries(series, {
                    markerShape: event.target.value as PlotMarkerShape,
                  })
                }
              >
                <option value="circle">circle</option>
                <option value="square">square</option>
                <option value="triangle">triangle</option>
                <option value="diamond">diamond</option>
                <option value="cross">cross</option>
                <option value="plus">plus</option>
              </select>
            </ConfigField>
            <button
              className="plot-config-command danger"
              type="button"
              aria-label={`Remove ${series.y}`}
              disabled={spec.series.length <= 1}
              onClick={() => onRemoveSeries(series)}
            >
              Remove
            </button>
          </div>
        </ConfigGroup>
      ))}
    </div>
  );
}
