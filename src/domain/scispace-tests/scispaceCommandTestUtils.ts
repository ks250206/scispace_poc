import { createSeedDataset } from "../csv";
export { executeScispaceCommand } from "../scispace";
import { executeScispaceCommand } from "../scispace";

export const dataset = createSeedDataset();

export const runCommand = (
  command: string,
  context: Partial<Parameters<typeof executeScispaceCommand>[1]> = {},
) => executeScispaceCommand(command, { datasets: [dataset], ...context });

export const runEmptyCommand = (
  command: string,
  context: Partial<Parameters<typeof executeScispaceCommand>[1]> = {},
) => executeScispaceCommand(command, { datasets: [], ...context });

export const configuredImport = (
  overrides: Partial<
    NonNullable<Parameters<typeof executeScispaceCommand>[1]["pendingImports"]>[number]
  > = {},
) => ({
  id: "import-1",
  fileName: "configured.csv",
  text: "x,y\n1,2",
  mode: "tabular" as const,
  options: {
    skipRows: 0,
    delimiter: "comma" as const,
    commentPrefix: "",
    hasHeader: true,
    columnNames: [],
    excludedColumnIds: [],
  },
  ...overrides,
});
