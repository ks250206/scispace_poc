import type { PlotSpec } from "../../domain/types";
import { useScispaceStore } from "../../store/scispaceStore";

interface UseActivePlotActionsOptions {
  currentPlotId?: string;
  openPlotConfig: (plotId: string) => void;
  openPlotSchemaApplyWindow: (plotId: string) => void;
  plotSpecs: PlotSpec[];
  runScispace: ReturnType<typeof useScispaceStore.getState>["runScispace"];
}

export const useActivePlotActions = ({
  currentPlotId,
  openPlotConfig,
  openPlotSchemaApplyWindow,
  plotSpecs,
  runScispace,
}: UseActivePlotActionsOptions) => {
  const activePlotSpec = plotSpecs.find((plot) => plot.id === currentPlotId) ?? plotSpecs[0];
  const canExportActivePlot = useScispaceStore((state) =>
    Boolean(activePlotSpec && state.plotMenuStates[activePlotSpec.id]),
  );

  const resolveActivePlot = () => {
    const state = useScispaceStore.getState();
    const spec =
      state.plotSpecs.find((plot) => plot.id === state.currentPlotId) ?? state.plotSpecs[0];
    return {
      spec,
      registeredActions: spec && state.plotMenuStates[spec.id]?.actions,
    };
  };

  const copyActivePlotSchema = async () => {
    const { spec } = resolveActivePlot();
    if (!spec) return;
    const result = await runScispace(`plot-schema ${spec.id}`, { source: "gui" });
    if (result.kind !== "error") await navigator.clipboard?.writeText(result.output);
  };

  const openActivePlotConfig = () => {
    const { spec, registeredActions } = resolveActivePlot();
    if (registeredActions) {
      registeredActions.openConfig();
      return;
    }
    if (spec) openPlotConfig(spec.id);
  };

  const openActivePlotSchemaApply = () => {
    const { spec, registeredActions } = resolveActivePlot();
    if (registeredActions) {
      registeredActions.applySchema();
      return;
    }
    if (spec) openPlotSchemaApplyWindow(spec.id);
  };

  const exportActivePlotPng = () => resolveActivePlot().registeredActions?.exportPng();
  const exportActivePlotSvg = () => resolveActivePlot().registeredActions?.exportSvg();

  return {
    activePlotSpec,
    copyActivePlotSchema,
    exportActivePlotPng,
    exportActivePlotSvg,
    canExportActivePlot,
    openActivePlotConfig,
    openActivePlotSchemaApply,
  };
};
