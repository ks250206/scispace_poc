import Dexie, { type Table } from "dexie";
import type { Dataset, PersistedLayout, VirtualFile } from "../domain/types";

const defaultLayout: PersistedLayout = {
  windows: [],
  viewport: { x: 0, y: 0, scale: 1 },
};

export class SciSpaceDatabase extends Dexie {
  files!: Table<VirtualFile, string>;
  datasets!: Table<Dataset, string>;
  layout!: Table<{ id: "main"; value: PersistedLayout }, "main">;

  constructor(name = "scispace-poc") {
    super(name);
    this.version(1).stores({
      files: "id, path, datasetId, createdAt",
      datasets: "id, name, sourcePath, createdAt",
      layout: "id",
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
