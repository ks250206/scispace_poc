import type { PlotAnnotation, PlotSpec } from "../../domain/types";
import { ConfigField, ConfigGroup } from "./PlotConfigFields";
import type { AnnotationDraft } from "./plotConfigModel";

interface PlotConfigAnnotationsTabProps {
  spec: PlotSpec;
  annotationDraft: AnnotationDraft;
  onSetAnnotationDraft: (updater: (current: AnnotationDraft) => AnnotationDraft) => void;
  onAddAnnotation: () => void;
  onUpdateAnnotation: (annotation: PlotAnnotation, patch: Partial<PlotAnnotation>) => void;
  onRemoveAnnotation: (annotation: PlotAnnotation) => void;
}

export function PlotConfigAnnotationsTab({
  spec,
  annotationDraft,
  onSetAnnotationDraft,
  onAddAnnotation,
  onUpdateAnnotation,
  onRemoveAnnotation,
}: PlotConfigAnnotationsTabProps) {
  return (
    <div className="plot-annotation-panel plot-config-section" role="tabpanel">
      <ConfigGroup title="Add Text Arrow">
        <div className="plot-field-grid two">
          <ConfigField label="Text">
            <input
              aria-label="Annotation text"
              value={annotationDraft.text}
              onChange={(event) =>
                onSetAnnotationDraft((current) => ({ ...current, text: event.target.value }))
              }
            />
          </ConfigField>
          <button className="plot-config-command" type="button" onClick={onAddAnnotation}>
            Add annotation
          </button>
        </div>
        <div className="plot-subgroup-title">Position</div>
        <div className="plot-field-grid four">
          {(["x", "y", "dx", "dy"] as const).map((field) => (
            <ConfigField key={field} label={field} compact>
              <input
                aria-label={`Annotation ${field}`}
                type="number"
                value={annotationDraft[field]}
                onChange={(event) =>
                  onSetAnnotationDraft((current) => ({
                    ...current,
                    [field]: event.target.value,
                  }))
                }
              />
            </ConfigField>
          ))}
        </div>
      </ConfigGroup>
      {spec.annotations.map((annotation) => (
        <ConfigGroup key={annotation.id} title={`Annotation: ${annotation.text}`}>
          <div className="plot-field-grid three">
            <ConfigField label="Text">
              <input
                aria-label={`Annotation label ${annotation.id}`}
                value={annotation.text}
                onChange={(event) => onUpdateAnnotation(annotation, { text: event.target.value })}
              />
            </ConfigField>
            <ConfigField label="Color" compact>
              <input
                aria-label={`Annotation color ${annotation.id}`}
                type="color"
                value={annotation.color}
                onChange={(event) => onUpdateAnnotation(annotation, { color: event.target.value })}
              />
            </ConfigField>
            <button
              className="plot-config-command danger"
              type="button"
              aria-label={`Remove annotation ${annotation.id}`}
              onClick={() => onRemoveAnnotation(annotation)}
            >
              Remove
            </button>
          </div>
          <div className="plot-subgroup-title">Typography</div>
          <div className="plot-field-grid two">
            <ConfigField label="Font family">
              <input
                aria-label={`Annotation font family ${annotation.id}`}
                value={annotation.font.family}
                onChange={(event) =>
                  onUpdateAnnotation(annotation, {
                    font: { ...annotation.font, family: event.target.value },
                  })
                }
              />
            </ConfigField>
            <ConfigField label="Font size" compact>
              <input
                aria-label={`Annotation font size ${annotation.id}`}
                type="number"
                min={1}
                value={annotation.font.size}
                onChange={(event) =>
                  onUpdateAnnotation(annotation, {
                    font: { ...annotation.font, size: Number(event.target.value) },
                  })
                }
              />
            </ConfigField>
          </div>
        </ConfigGroup>
      ))}
    </div>
  );
}
