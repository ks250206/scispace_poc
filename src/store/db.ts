import Dexie, { type Table } from "dexie";
import type { Dataset, PersistedLayout, VirtualFile } from "../domain/types";

const defaultLayout: PersistedLayout = {
  windows: [],
  viewport: { x: -1920, y: -1080, scale: 1 },
  plotSpecs: [],
  commandHistory: [],
  uploadPayloads: {},
  columnSelections: {},
  currentProjectId: undefined,
};

export interface ProjectRecord {
  id: string;
  name: string;
  files: VirtualFile[];
  datasets: Dataset[];
  layout: PersistedLayout;
  createdAt: number;
  updatedAt: number;
}

export class SciSpaceDatabase extends Dexie {
  files!: Table<VirtualFile, string>;
  datasets!: Table<Dataset, string>;
  layout!: Table<{ id: "main"; value: PersistedLayout }, "main">;
  projects!: Table<ProjectRecord, string>;

  constructor(name = "scispace-poc") {
    super(name);
    this.version(1).stores({
      files: "id, path, datasetId, createdAt",
      datasets: "id, name, sourcePath, createdAt",
      layout: "id",
    });
    this.version(2).stores({
      files: "id, path, datasetId, createdAt",
      datasets: "id, name, sourcePath, createdAt",
      layout: "id",
      projects: "id, name, updatedAt",
    });
  }
}

export const appDb = new SciSpaceDatabase();

export const readPersistedLayout = async (db: SciSpaceDatabase): Promise<PersistedLayout> => {
  const record = await db.layout.get("main");
  return record?.value ?? defaultLayout;
};

export const writePersistedLayout = async (
  db: SciSpaceDatabase,
  value: PersistedLayout,
): Promise<void> => {
  await db.layout.put({ id: "main", value });
};
