import { useState } from "react";
import type { PlotAxisSpec, PlotSpec } from "../../domain/types";
import { ConfigField, ConfigGroup } from "./PlotConfigFields";
import type { AxisPatch } from "./plotConfigModel";

interface PlotConfigAxesTabProps {
  spec: PlotSpec;
  onSetAxis: (axis: "x" | "y", patch: AxisPatch) => void;
}

function AxisRangeFields({
  axis,
  axisSpec,
  onChange,
}: {
  axis: "x" | "y";
  axisSpec: PlotAxisSpec;
  onChange: (range: PlotAxisSpec["range"]) => void;
}) {
  const { range, scale } = axisSpec;
  const [draft, setDraft] = useState<{ min: string; max: string }>();
  const [error, setError] = useState("");
  const values = draft ?? { min: String(range.min ?? 0), max: String(range.max ?? 1) };
  const manual = draft !== undefined || range.mode === "manual";

  const apply = () => {
    const min = Number(values.min);
    const max = Number(values.max);
    if (
      !values.min.trim() ||
      !values.max.trim() ||
      !Number.isFinite(min) ||
      !Number.isFinite(max) ||
      min >= max ||
      (scale === "log" && min <= 0)
    ) {
      setError(
        scale === "log"
          ? "Enter a positive minimum below the maximum."
          : "Enter a minimum below the maximum.",
      );
      return;
    }
    setError("");
    if (range.mode !== "manual" || min !== range.min || max !== range.max) {
      onChange({ mode: "manual", min, max });
    }
  };

  return (
    <>
      <div className="plot-field-grid four">
        <ConfigField label="Mode">
          <select
            aria-label={axis + " range mode"}
            value={manual ? "manual" : "auto"}
            onChange={(event) => {
              setError("");
              if (event.target.value === "manual") {
                setDraft({ min: "", max: "" });
              } else {
                setDraft(undefined);
                if (range.mode === "manual") onChange({ mode: "auto" });
              }
            }}
          >
            <option value="auto">auto range</option>
            <option value="manual">manual range</option>
          </select>
        </ConfigField>
        {(["min", "max"] as const).map((bound) => (
          <ConfigField key={bound} label={bound === "min" ? "Min" : "Max"} compact>
            <input
              aria-label={axis + " range " + bound}
              type="number"
              step="any"
              disabled={!manual}
              value={manual ? values[bound] : ""}
              onChange={(event) => {
                setDraft({ ...values, [bound]: event.target.value });
                setError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") apply();
              }}
            />
          </ConfigField>
        ))}
        <button type="button" className="plot-config-command" disabled={!manual} onClick={apply}>
          Apply {axis.toUpperCase()} range
        </button>
      </div>
      {error && <div role="alert">{error}</div>}
    </>
  );
}

export function PlotConfigAxesTab({ spec, onSetAxis }: PlotConfigAxesTabProps) {
  return (
    <div className="plot-axis-panel plot-config-section" role="tabpanel">
      {(["x", "y"] as const).map((axis) => (
        <ConfigGroup key={axis} title={`${axis.toUpperCase()} Axis`}>
          <div className="plot-field-grid two">
            <ConfigField label="Label">
              <input
                aria-label={`${axis} axis label`}
                value={spec.axes[axis].label}
                onChange={(event) => onSetAxis(axis, { label: event.target.value })}
              />
            </ConfigField>
            <ConfigField label="Scale">
              <select
                aria-label={`${axis} scale`}
                value={spec.axes[axis].scale}
                onChange={(event) =>
                  onSetAxis(axis, { scale: event.target.value as PlotAxisSpec["scale"] })
                }
              >
                <option value="linear">linear</option>
                <option value="log">log</option>
              </select>
            </ConfigField>
          </div>

          <div className="plot-subgroup-title">Range</div>
          <AxisRangeFields
            key={[
              spec.id,
              axis,
              spec.axes[axis].range.mode,
              spec.axes[axis].range.min,
              spec.axes[axis].range.max,
            ].join(":")}
            axis={axis}
            axisSpec={spec.axes[axis]}
            onChange={(range) => onSetAxis(axis, { range })}
          />

          <div className="plot-subgroup-title">Ticks</div>
          <div className="plot-field-grid four">
            <ConfigField label="Interval" compact>
              <input
                aria-label={`${axis} tick interval`}
                type="number"
                min={0}
                value={spec.axes[axis].ticks.interval ?? ""}
                placeholder="auto"
                onChange={(event) =>
                  onSetAxis(axis, {
                    ticks:
                      event.target.value === ""
                        ? { mode: "auto", interval: undefined }
                        : { mode: "manual", interval: Number(event.target.value) },
                  })
                }
              />
            </ConfigField>
            <ConfigField label="Direction">
              <select
                aria-label={`${axis} tick direction`}
                value={spec.axes[axis].ticks.orientation}
                onChange={(event) =>
                  onSetAxis(axis, {
                    ticks: {
                      orientation: event.target.value as PlotAxisSpec["ticks"]["orientation"],
                    },
                  })
                }
              >
                <option value="out">out</option>
                <option value="in">in</option>
                <option value="none">none</option>
              </select>
            </ConfigField>
            <ConfigField label="Length" compact>
              <input
                aria-label={`${axis} tick length`}
                type="number"
                min={0}
                value={spec.axes[axis].ticks.length}
                onChange={(event) =>
                  onSetAxis(axis, { ticks: { length: Number(event.target.value) } })
                }
              />
            </ConfigField>
            <label className="plot-config-check">
              <input
                aria-label={`${axis} minor tick`}
                type="checkbox"
                checked={spec.axes[axis].ticks.minor}
                onChange={(event) => onSetAxis(axis, { ticks: { minor: event.target.checked } })}
              />
              <span>Minor tick</span>
            </label>
            <label className="plot-config-check">
              <input
                aria-label={`${axis} mirror ticks`}
                type="checkbox"
                checked={spec.axes[axis].ticks.mirror ?? false}
                onChange={(event) => onSetAxis(axis, { ticks: { mirror: event.target.checked } })}
              />
              <span>Mirror ticks</span>
            </label>
          </div>

          <div className="plot-subgroup-title">Typography</div>
          <div className="plot-field-grid two">
            <ConfigField label="Label font">
              <input
                aria-label={`${axis} label font family`}
                value={spec.axes[axis].labelStyle.family}
                onChange={(event) =>
                  onSetAxis(axis, {
                    labelStyle: { ...spec.axes[axis].labelStyle, family: event.target.value },
                  })
                }
              />
            </ConfigField>
            <ConfigField label="Label size" compact>
              <input
                aria-label={`${axis} label font size`}
                type="number"
                min={1}
                value={spec.axes[axis].labelStyle.size}
                onChange={(event) =>
                  onSetAxis(axis, {
                    labelStyle: {
                      ...spec.axes[axis].labelStyle,
                      size: Number(event.target.value),
                    },
                  })
                }
              />
            </ConfigField>
            <ConfigField label="Tick font">
              <input
                aria-label={`${axis} value font family`}
                value={spec.axes[axis].valueStyle.family}
                onChange={(event) =>
                  onSetAxis(axis, {
                    valueStyle: { ...spec.axes[axis].valueStyle, family: event.target.value },
                  })
                }
              />
            </ConfigField>
            <ConfigField label="Tick size" compact>
              <input
                aria-label={`${axis} value font size`}
                type="number"
                min={1}
                value={spec.axes[axis].valueStyle.size}
                onChange={(event) =>
                  onSetAxis(axis, {
                    valueStyle: {
                      ...spec.axes[axis].valueStyle,
                      size: Number(event.target.value),
                    },
                  })
                }
              />
            </ConfigField>
          </div>

          <div className="plot-subgroup-title">Layout</div>
          <div className="plot-field-grid four">
            <ConfigField label="Axis size" compact>
              <input
                aria-label={`${axis} axis size`}
                type="number"
                min={1}
                value={spec.axes[axis].size}
                onChange={(event) => onSetAxis(axis, { size: Number(event.target.value) })}
              />
            </ConfigField>
            <ConfigField label="Axis gap" compact>
              <input
                aria-label={`${axis} axis gap`}
                type="number"
                min={0}
                value={spec.axes[axis].gap}
                onChange={(event) => onSetAxis(axis, { gap: Number(event.target.value) })}
              />
            </ConfigField>
            <ConfigField label="Label gap" compact>
              <input
                aria-label={`${axis} label gap`}
                type="number"
                min={0}
                value={spec.axes[axis].labelGap}
                onChange={(event) => onSetAxis(axis, { labelGap: Number(event.target.value) })}
              />
            </ConfigField>
            <ConfigField label="Label size" compact>
              <input
                aria-label={`${axis} label size`}
                type="number"
                min={1}
                value={spec.axes[axis].labelSize}
                onChange={(event) => onSetAxis(axis, { labelSize: Number(event.target.value) })}
              />
            </ConfigField>
          </div>

          <div className="plot-subgroup-title">Colors</div>
          <div className="plot-field-grid three">
            <ConfigField label="Axis color" compact>
              <input
                aria-label={`${axis} axis color`}
                type="color"
                value={spec.axes[axis].color}
                onChange={(event) => onSetAxis(axis, { color: event.target.value })}
              />
            </ConfigField>
            <ConfigField label="Grid color" compact>
              <input
                aria-label={`${axis} grid color`}
                type="color"
                value={spec.axes[axis].gridColor}
                onChange={(event) => onSetAxis(axis, { gridColor: event.target.value })}
              />
            </ConfigField>
            <ConfigField label="Tick color" compact>
              <input
                aria-label={`${axis} tick color`}
                type="color"
                value={spec.axes[axis].tickColor}
                onChange={(event) => onSetAxis(axis, { tickColor: event.target.value })}
              />
            </ConfigField>
          </div>
        </ConfigGroup>
      ))}
    </div>
  );
}
