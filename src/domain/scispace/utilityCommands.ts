import { datasetColumnNames } from "../csv";
import type { Dataset, ScispaceCommandResult } from "../types";
import { findDataset, type CommandContext } from "./commandUtils";

export const helpText = [
  "scispace repl commands:",
  "  repl",
  "  unsafe on|off",
  "  shell",
  "",
  "scispace commands:",
  "  lsdata",
  "  dataset-new <name> columns=<col[,col...]> rows=<n>",
  "  dataset-calc <dataset> column=<newOrExistingCol> expr=<expression>",
  "  table <dataset> columns=<column[,column...]>",
  "  table-edit <dataset> action=<delete-row|delete-column|set-cell|insert-column> index=<n> row=<n> column=<col> value=<value> before=<col>",
  "  table-range <dataset> action=<clear|fill-down> r1=<n> c1=<col> r2=<n> c2=<col>",
  "  plot <dataset> x=<column> y=<column[,column...]> type=<line|line-marker|marker>",
  "  plot-set <plotId> title=<title> type=<line|line-marker|marker> border=<true|false> width=<n> height=<n> fontFamily=<name> fontSize=<n> padding=<t:r:b:l>",
  "  plot-axis <plotId> axis=<x|y> range=<auto|min:max> tick=<auto|interval> tickDir=<out|in|none> mirrorTick=<true|false> scale=<linear|log>",
  "  plot-grid <plotId> x=<true|false> y=<true|false>",
  "  plot-series <plotId> y=<column> action=<add|remove> markerShape=<circle|square|triangle|diamond|cross|plus> order=<n>",
  "  plot-annotation <plotId> action=<add|update|remove>",
  "  plot-schema [plotId]",
  "  plot-apply-schema <plotId> json=<encodedJson>",
  "  file-list [path]",
  "  file-mkdir <path>",
  "  file-rename <path> name=<newName>",
  "  file-move <path> to=<directory>",
  "  file-delete <path>",
  "  upload-open <uploadId> name=<fileName> ref=<uploadId> mode=<tabular|raw>",
  "  import-open <importId> name=<fileName> text=<encodedText>",
  "  import-preview <importId>",
  "  import-set <importId> skipRows=<n> delimiter=<auto|comma|tab|space|semicolon> hasHeader=<true|false> mode=<tabular|raw>",
  "  import-column <importId> column=<col> action=<include|exclude>",
  "  import-line <importId> line=<n> value=<text>",
  "  import-cancel <importId>",
  "  import-confirm <importId> mode=<tabular|raw> path=<virtualPath>",
  "  elt <dataset> as <newName>",
].join("\n");

export const executeUtilityCommand = (
  command: string | undefined,
  args: string[],
  context: CommandContext,
): ScispaceCommandResult | undefined => {
  if (!command || command === "help") {
    return {
      kind: "text",
      output: helpText,
    };
  }

  if (command === "lsdata") {
    const output = context.datasets
      .map(
        (dataset) =>
          `${dataset.name}\t${dataset.rows.length} rows\tcolumns: ${datasetColumnNames(dataset).join(", ")}`,
      )
      .join("\n");
    return { kind: "text", output: output || "No datasets loaded" };
  }

  if (command === "elt") {
    const dataset = findDataset(context.datasets, args[0] ?? "");
    const asIndex = args.indexOf("as");
    const name = asIndex >= 0 ? args[asIndex + 1] : undefined;
    if (!dataset) return { kind: "error", output: `Dataset not found: ${args[0] ?? ""}` };
    if (!name) return { kind: "error", output: "Usage: elt <dataset> as <newName>" };

    const derived: Dataset = {
      ...dataset,
      id: crypto.randomUUID(),
      name,
      sourcePath: `~/raw/${name}`,
      createdBy: "elt",
      createdAt: Date.now(),
      rows: dataset.rows.map((row) => ({ ...row })),
    };

    return { kind: "dataset-created", dataset: derived, output: `Created dataset ${name}` };
  }

  return undefined;
};
