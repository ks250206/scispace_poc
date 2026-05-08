import { createSeedDataset, datasetColumnIds, datasetToDelimitedText } from "../../domain/csv";
import { defaultPlotAxis, normalizePlotSpecForCommand } from "../../domain/scispace";
import type { PlotSpec, ViewportState, VirtualFile, WorkspaceWindow } from "../../domain/types";
import type { ScispaceState } from "./stateTypes";

export const centerTileX = 1920;
export const centerTileY = 1080;
export const plotWindowChromeHeight = 94;
export const tableWindowHeightForRows = (visibleRows: 10 | 20 | 50): number =>
  34 + 38 + 32 + visibleRows * 32;
export const plotWindowHeightForSpec = (height: number): number => height + plotWindowChromeHeight;
export const visibleWorkspaceOrigin = (viewport: ViewportState): { x: number; y: number } => {
  const scale = Math.max(0.01, viewport.scale);
  return {
    x: -viewport.x / scale,
    y: -viewport.y / scale,
  };
};

export const newWindowPosition = (
  state: Pick<ScispaceState, "viewport" | "windows">,
  offsetX: number,
  offsetY: number,
): { x: number; y: number } => {
  const origin = visibleWorkspaceOrigin(state.viewport);
  const cascade = state.windows.length % 8;
  return {
    x: Math.round(origin.x + offsetX + cascade * 24),
    y: Math.round(origin.y + offsetY + cascade * 20),
  };
};

export const initialWindows = (): WorkspaceWindow[] => [
  {
    id: "browser-main",
    kind: "browser",
    title: "Data Browser",
    x: centerTileX + 64,
    y: centerTileY + 72,
    width: 300,
    height: 440,
    zIndex: 1,
  },
  {
    id: "table-seed",
    kind: "table",
    title: "Table - waveform.csv",
    x: centerTileX + 396,
    y: centerTileY + 88,
    width: 650,
    height: tableWindowHeightForRows(10),
    zIndex: 2,
    datasetId: "seed-waveform",
  },
  {
    id: "plot-seed",
    kind: "plot",
    title: "Plot - waveform.csv",
    x: centerTileX + 1088,
    y: centerTileY + 88,
    width: 640,
    height: plotWindowHeightForSpec(360),
    zIndex: 3,
    datasetId: "seed-waveform",
    plotId: "seed-plot",
  },
  {
    id: "terminal-main",
    kind: "terminal",
    title: "Terminal",
    x: centerTileX + 64,
    y: centerTileY + 756,
    width: 1664,
    height: 300,
    zIndex: 4,
  },
  {
    id: "history-main",
    kind: "history",
    title: "Command History",
    x: centerTileX + 1328,
    y: centerTileY + 532,
    width: 420,
    height: 520,
    zIndex: 5,
  },
];

export const ensureWorkspaceWindows = (windows: WorkspaceWindow[]): WorkspaceWindow[] => {
  let nextWindows = windows;
  if (!nextWindows.some((window) => window.kind === "terminal")) {
    const zIndex = Math.max(0, ...nextWindows.map((window) => window.zIndex)) + 1;
    nextWindows = [
      ...nextWindows,
      {
        id: "terminal-main",
        kind: "terminal",
        title: "Terminal",
        x: centerTileX + 64,
        y: centerTileY + 756,
        width: 1664,
        height: 300,
        zIndex,
      },
    ];
  }
  if (!nextWindows.some((window) => window.kind === "history")) {
    const zIndex = Math.max(0, ...nextWindows.map((window) => window.zIndex)) + 1;
    nextWindows = [
      ...nextWindows,
      {
        id: "history-main",
        kind: "history",
        title: "Command History",
        x: centerTileX + 1328,
        y: centerTileY + 532,
        width: 420,
        height: 520,
        zIndex,
      },
    ];
  }
  return nextWindows;
};

export const seedPlot = (): PlotSpec => ({
  id: "seed-plot",
  type: "line",
  plotType: "line",
  source: "seed-waveform",
  x: "time",
  y: "signal",
  title: "waveform.csv: signal vs time",
  series: [
    {
      y: "signal",
      label: "signal",
      color: "#2563eb",
      lineWidth: 2,
      markerSize: 6,
      markerShape: "circle",
      drawOrder: 0,
    },
  ],
  zoomMode: "xy",
  axes: { x: defaultPlotAxis("time"), y: defaultPlotAxis("signal") },
  grid: { x: true, y: true },
  border: true,
  size: { width: 640, height: 360 },
  font: { family: "Inter, system-ui, sans-serif", size: 12 },
  padding: { top: 12, right: 12, bottom: 12, left: 12 },
  annotations: [],
  axisLabels: { x: "time", y: "signal" },
});

export const normalizePlotSpec = (spec: PlotSpec): PlotSpec => {
  return normalizePlotSpecForCommand(spec);
};

export const initialViewport = (): ViewportState => ({ x: -1920, y: -1080, scale: 1 });

export const makeFileRecord = (
  path: string,
  text: string,
  datasetId?: string,
  parseError?: string,
): VirtualFile => ({
  id: path,
  path,
  name: path.split("/").at(-1) ?? path,
  kind: "file",
  text,
  datasetId,
  parseError,
  createdAt: Date.now(),
});

export const createInitialProject = () => {
  const seed = createSeedDataset();
  const file = makeFileRecord(seed.sourcePath, datasetToDelimitedText(seed), seed.id);
  return {
    files: [file],
    datasets: [seed],
    windows: initialWindows(),
    plotSpecs: [seedPlot()],
    viewport: initialViewport(),
    commandHistory: [],
    columnSelections: { [seed.id]: datasetColumnIds(seed) },
  };
};
