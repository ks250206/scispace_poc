import type { StoreApi } from "zustand";
import type { Dataset, PlotSpec, WorkspaceWindow } from "../../domain/types";
import type { SciSpaceDatabase } from "../db";
import type { ScispaceState } from "./stateTypes";

export interface ResultApplyContext {
  db: SciSpaceDatabase;
  get: StoreApi<ScispaceState>["getState"];
  set: StoreApi<ScispaceState>["setState"];
  input: string;
  retitleWindow: (
    window: WorkspaceWindow,
    datasets: Dataset[],
    plotSpecs: PlotSpec[],
  ) => WorkspaceWindow;
  nextActiveDatasetId: (datasets: Dataset[], current?: string) => string | undefined;
}
