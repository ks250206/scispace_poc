import { buildPlotSvg, safePlotFileName, svgDataUrl } from "../plotExport";
import type { Dataset, PlotSpec } from "../../domain/types";
import { useScispaceStore } from "../../store/scispaceStore";

interface UseActivePlotActionsOptions {
  currentPlotId?: string;
  datasets: Dataset[];
  openPlotConfig: (plotId: string) => void;
  openPlotSchemaApplyWindow: (plotId: string) => void;
  plotSpecs: PlotSpec[];
  runScispace: ReturnType<typeof useScispaceStore.getState>["runScispace"];
}

const clickDownload = (href: string, download: string) => {
  const link = document.createElement("a");
  link.href = href;
  link.download = download;
  link.click();
};

export const useActivePlotActions = ({
  currentPlotId,
  datasets,
  openPlotConfig,
  openPlotSchemaApplyWindow,
  plotSpecs,
  runScispace,
}: UseActivePlotActionsOptions) => {
  const activePlotSpec = plotSpecs.find((plot) => plot.id === currentPlotId) ?? plotSpecs[0];
  const activePlotDataset = datasets.find((dataset) => dataset.id === activePlotSpec?.source);

  const resolveActivePlot = () => {
    const state = useScispaceStore.getState();
    const spec =
      state.plotSpecs.find((plot) => plot.id === state.currentPlotId) ?? state.plotSpecs[0];
    return {
      spec,
      dataset: state.datasets.find((dataset) => dataset.id === spec?.source),
      registeredActions:
        spec && state.plotMenuState?.plotId === spec.id ? state.plotMenuState.actions : undefined,
    };
  };

  const resolveActivePlotDatasetFromStore = () => {
    const state = useScispaceStore.getState();
    const spec =
      state.plotSpecs.find((plot) => plot.id === state.currentPlotId) ?? state.plotSpecs[0];
    return state.datasets.find((dataset) => dataset.id === spec?.source);
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

  const exportActivePlotPng = () => {
    const { spec, registeredActions } = resolveActivePlot();
    if (registeredActions) {
      registeredActions.exportPng();
      return;
    }
    if (!spec) return;
    const canvas = document.querySelector<HTMLCanvasElement>(".plot-window canvas");
    if (!canvas) return;
    clickDownload(canvas.toDataURL("image/png"), safePlotFileName(spec.title, "png"));
  };

  const exportActivePlotSvg = () => {
    const { spec, dataset } = resolveActivePlot();
    if (!spec || !dataset) return;
    clickDownload(svgDataUrl(buildPlotSvg(spec, dataset)), safePlotFileName(spec.title, "svg"));
  };

  return {
    activePlotSpec,
    copyActivePlotSchema,
    exportActivePlotPng,
    exportActivePlotSvg,
    hasResolvablePlotDataset:
      Boolean(activePlotDataset) || Boolean(resolveActivePlotDatasetFromStore()),
    openActivePlotConfig,
    openActivePlotSchemaApply,
  };
};
