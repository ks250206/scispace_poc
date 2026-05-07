import type { Dataset, PlotSpec, ScispaceCommandResult } from "./types";

export interface CommandContext {
  datasets: Dataset[];
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
        "  elt <dataset> as <newName>",
      ].join("\n"),
    };
  }

  if (command === "lsdata") {
    const output = context.datasets
      .map((dataset) => `${dataset.name}\t${dataset.rows.length} rows`)
      .join("\n");
    return { kind: "text", output: output || "No datasets loaded" };
  }

  if (command === "table") {
    const dataset = findDataset(context.datasets, args[0] ?? "");
    if (!dataset) return { kind: "error", output: `Dataset not found: ${args[0] ?? ""}` };
    return {
      kind: "open-table",
      datasetId: dataset.id,
      output: `Opening table for ${dataset.name}`,
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

    return { kind: "plot", spec, output: `Plot queued: ${spec.title}` };
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
