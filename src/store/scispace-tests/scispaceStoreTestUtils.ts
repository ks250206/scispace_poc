import { createSeedDataset, datasetToDelimitedText } from "../../domain/csv";
import { SciSpaceDatabase } from "../db";
import { createScispaceStore } from "../scispaceStore";

export { datasetColumnNames } from "../../domain/csv";
export { SciSpaceDatabase } from "../db";
export { createScispaceStore } from "../scispaceStore";

export const makeStore = async () => {
  const db = new SciSpaceDatabase(`test-${crypto.randomUUID()}`);
  await db.open();
  const store = createScispaceStore(db);
  await store.getState().initialize();
  return { db, store };
};

type StoreFixture = Awaited<ReturnType<typeof makeStore>>;
type TestStore = StoreFixture["store"];
type RunScispaceOptions = Parameters<ReturnType<TestStore["getState"]>["runScispace"]>[1];

export const stateOf = (store: TestStore) => store.getState();

export const runCommand = (store: TestStore, command: string, options?: RunScispaceOptions) =>
  stateOf(store).runScispace(command, options);

export const openImport = (store: TestStore, fileName: string, text: string) =>
  stateOf(store).openImportDialog(fileName, text);

export const lastCommand = (store: TestStore) => stateOf(store).commandHistory.at(-1);

export const storeSeedDataset = () => {
  const dataset = createSeedDataset();
  return {
    dataset,
    file: {
      id: dataset.sourcePath,
      path: dataset.sourcePath,
      name: "waveform.csv",
      kind: "file" as const,
      text: datasetToDelimitedText(dataset),
      datasetId: dataset.id,
      createdAt: Date.now(),
    },
  };
};
