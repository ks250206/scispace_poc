import { normalizeVirtualPath, parseDelimitedText } from "./csv";
import type { Dataset, PendingImport, PlotSpec, ScispaceCommandResult } from "./types";

export interface CommandContext {
  datasets: Dataset[];
  pendingImports?: PendingImport[];
}

const findDataset = (datasets: Dataset[], token: string): Dataset | undefined =>
  datasets.find(
    (dataset) =>
      dataset.id === token || dataset.name === token || dataset.sourcePath.endsWith(`/${token}`),
  );

const readOption = (tokens: string[], key: string): string | undefined => {
  const prefix = `${key}=`;
  return tokens.find((token) => token.startsWith(prefix))?.slice(prefix.length);
};

const parseBooleanOption = (tokens: string[], key: string): boolean =>
  readOption(tokens, key) === "true";

export const executeScispaceCommand = (
  input: string,
  context: CommandContext,
): ScispaceCommandResult => {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  const [command, ...args] = tokens;

  if (!command || command === "help") {
    return {
      kind: "text",
      output: [
        "scispace commands:",
        "  lsdata",
        "  table <dataset>",
        "  plot <dataset> x=<column> y=<column>",
        "  import-preview <importId>",
        "  import-confirm <importId> path=<virtualPath>",
        "  elt <dataset> as <newName>",
      ].join("\n"),
    };
  }

  if (command === "lsdata") {
    const output = context.datasets
      .map(
        (dataset) =>
          `${dataset.name}\t${dataset.rows.length} rows\tcolumns: ${dataset.columns.join(", ")}`,
      )
      .join("\n");
    return { kind: "text", output: output || "No datasets loaded" };
  }

  if (command === "table") {
    const dataset = findDataset(context.datasets, args[0] ?? "");
    if (!dataset) return { kind: "error", output: `Dataset not found: ${args[0] ?? ""}` };
    return {
      kind: "open-table",
      datasetId: dataset.id,
      output: `Table opened: ${dataset.name} (${dataset.rows.length} rows)`,
    };
  }

  if (command === "plot") {
    const dataset = findDataset(context.datasets, args[0] ?? "");
    if (!dataset) return { kind: "error", output: `Dataset not found: ${args[0] ?? ""}` };

    const x = readOption(args, "x") ?? dataset.columns[0];
    const y = readOption(args, "y") ?? dataset.columns[1];
    if (!dataset.columns.includes(x) || !dataset.columns.includes(y)) {
      return { kind: "error", output: `Unknown plot columns for ${dataset.name}: x=${x} y=${y}` };
    }

    const spec: PlotSpec = {
      id: crypto.randomUUID(),
      type: "line",
      source: dataset.id,
      x,
      y,
      title: `${dataset.name}: ${y} vs ${x}`,
    };

    return { kind: "plot", spec, output: `Plot opened: ${spec.title}` };
  }

  if (command === "import-preview") {
    const importId = args[0] ?? "";
    const pendingImport = context.pendingImports?.find((item) => item.id === importId);
    if (!pendingImport) return { kind: "error", output: `Pending import not found: ${importId}` };

    try {
      const preview = parseDelimitedText(
        pendingImport.text,
        pendingImport.fileName,
        normalizeVirtualPath(pendingImport.fileName),
        Date.now(),
        pendingImport.options,
      );
      return {
        kind: "import-preview",
        importId,
        preview: parseBooleanOption(args, "full")
          ? preview
          : { ...preview, rows: preview.rows.slice(0, 500) },
        output: `Import preview parsed: ${pendingImport.fileName}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to parse tabular file";
      return { kind: "import-preview", importId, error: message, output: message };
    }
  }

  if (command === "import-confirm") {
    const importId = args[0] ?? "";
    const pathOption = readOption(args, "path");
    const path = pathOption ? decodeURIComponent(pathOption) : undefined;
    const rawOnly = parseBooleanOption(args, "raw");
    const pendingImport = context.pendingImports?.find((item) => item.id === importId);
    if (!pendingImport) return { kind: "error", output: `Pending import not found: ${importId}` };
    if (!path)
      return { kind: "error", output: "Usage: import-confirm <importId> path=<virtualPath>" };
    if (rawOnly) {
      return {
        kind: "import-confirm",
        importId,
        parseError: "Raw file stored without tabular parsing",
        output: `Raw import confirmed: ${path}`,
      };
    }

    try {
      const dataset = parseDelimitedText(
        pendingImport.text,
        path.split("/").at(-1) ?? pendingImport.fileName,
        path,
        Date.now(),
        pendingImport.options,
      );
      return { kind: "import-confirm", importId, dataset, output: `Import confirmed: ${path}` };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to parse tabular file";
      return { kind: "import-confirm", importId, parseError: message, output: message };
    }
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

  return { kind: "error", output: `Unknown scispace command: ${command}` };
};
