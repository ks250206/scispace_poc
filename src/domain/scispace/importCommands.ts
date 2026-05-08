import { defaultImportParseOptions, normalizeVirtualPath, parseDelimitedText } from "../csv";
import type { PendingImport, ScispaceCommandResult } from "../types";
import {
  importDelimiters,
  parseBooleanOption,
  parseInteger,
  parseOptionalBoolean,
  readOption,
  type CommandContext,
} from "./commandUtils";

export const executeImportCommand = (
  command: string,
  args: string[],
  context: CommandContext,
): ScispaceCommandResult | undefined => {
  if (command === "import-open") {
    const importId = args[0] ?? "";
    const fileName = readOption(args, "name");
    const text = readOption(args, "text");
    const mode = readOption(args, "mode") ?? "tabular";
    if (!importId) return { kind: "error", output: "importId is required" };
    if (!fileName) return { kind: "error", output: "name is required" };
    if (text === undefined) return { kind: "error", output: "text is required" };
    if (mode !== "tabular" && mode !== "raw") {
      return { kind: "error", output: "mode must be tabular or raw" };
    }
    const pendingImport: PendingImport = {
      id: importId,
      fileName,
      text: decodeURIComponent(text),
      mode,
      options: defaultImportParseOptions,
    };
    return {
      kind: "import-open",
      importId,
      pendingImport,
      output: `Import opened: ${fileName}`,
    };
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

  if (command === "import-set") {
    const importId = args[0] ?? "";
    const pendingImport = context.pendingImports?.find((item) => item.id === importId);
    if (!pendingImport) return { kind: "error", output: `Pending import not found: ${importId}` };

    const skipRowsValue = readOption(args, "skipRows");
    const skipRows = skipRowsValue === undefined ? undefined : parseInteger(skipRowsValue);
    if (skipRowsValue !== undefined && (skipRows === undefined || skipRows < 0)) {
      return { kind: "error", output: `Invalid skipRows: ${skipRowsValue}` };
    }

    const delimiter = readOption(args, "delimiter");
    if (delimiter !== undefined && !importDelimiters.has(delimiter)) {
      return { kind: "error", output: `Invalid delimiter: ${delimiter}` };
    }

    const hasHeader = parseOptionalBoolean(readOption(args, "hasHeader"));
    if (readOption(args, "hasHeader") !== undefined && hasHeader === undefined) {
      return { kind: "error", output: "hasHeader must be true or false" };
    }

    const mode = readOption(args, "mode");
    if (mode !== undefined && mode !== "tabular" && mode !== "raw") {
      return { kind: "error", output: "mode must be tabular or raw" };
    }

    const columnNames = readOption(args, "columnNames")
      ?.split(",")
      .map((column) => column.trim());
    const pendingImportUpdate: PendingImport = {
      ...pendingImport,
      mode: mode ?? pendingImport.mode,
      options: {
        ...pendingImport.options,
        skipRows: skipRows ?? pendingImport.options.skipRows,
        delimiter: (delimiter ??
          pendingImport.options.delimiter) as PendingImport["options"]["delimiter"],
        commentPrefix: readOption(args, "commentPrefix") ?? pendingImport.options.commentPrefix,
        hasHeader: hasHeader ?? pendingImport.options.hasHeader,
        columnNames: columnNames ?? pendingImport.options.columnNames,
      },
    };
    return {
      kind: "import-updated",
      importId,
      pendingImport: pendingImportUpdate,
      output: `Import settings updated: ${pendingImport.fileName}`,
    };
  }

  if (command === "import-column") {
    const importId = args[0] ?? "";
    const pendingImport = context.pendingImports?.find((item) => item.id === importId);
    if (!pendingImport) return { kind: "error", output: `Pending import not found: ${importId}` };
    const column = readOption(args, "column");
    const action = readOption(args, "action");
    if (!column) return { kind: "error", output: "column is required" };
    if (action !== "include" && action !== "exclude") {
      return { kind: "error", output: "action must be include or exclude" };
    }

    const excluded = new Set(pendingImport.options.excludedColumnIds);
    if (action === "exclude") excluded.add(column);
    else excluded.delete(column);
    const pendingImportUpdate: PendingImport = {
      ...pendingImport,
      options: { ...pendingImport.options, excludedColumnIds: [...excluded] },
    };
    return {
      kind: "import-updated",
      importId,
      pendingImport: pendingImportUpdate,
      output: `Import column ${action}: ${column}`,
    };
  }

  if (command === "import-line") {
    const importId = args[0] ?? "";
    const pendingImport = context.pendingImports?.find((item) => item.id === importId);
    if (!pendingImport) return { kind: "error", output: `Pending import not found: ${importId}` };
    const lineValue = readOption(args, "line");
    const lineNumber = lineValue === undefined ? undefined : parseInteger(lineValue);
    if (lineNumber === undefined || lineNumber < 1) {
      return { kind: "error", output: `Invalid import line: ${lineValue ?? "missing"}` };
    }
    const value = readOption(args, "value");
    if (value === undefined) return { kind: "error", output: "value is required" };
    const lines = pendingImport.text.split(/\r?\n/);
    if (lineNumber > lines.length) {
      return { kind: "error", output: `Import line out of range: ${lineNumber}` };
    }
    lines[lineNumber - 1] = decodeURIComponent(value);
    const pendingImportUpdate: PendingImport = {
      ...pendingImport,
      text: lines.join("\n"),
    };
    return {
      kind: "import-updated",
      importId,
      pendingImport: pendingImportUpdate,
      output: `Import line updated: ${lineNumber}`,
    };
  }

  if (command === "import-cancel") {
    const importId = args[0] ?? "";
    const pendingImport = context.pendingImports?.find((item) => item.id === importId);
    if (!pendingImport) return { kind: "error", output: `Pending import not found: ${importId}` };
    return {
      kind: "import-cancel",
      importId,
      output: `Import cancelled: ${pendingImport.fileName}`,
    };
  }

  if (command === "import-confirm") {
    const importId = args[0] ?? "";
    const pathOption = readOption(args, "path");
    const path = pathOption ? decodeURIComponent(pathOption) : undefined;
    const mode = readOption(args, "mode") ?? (parseBooleanOption(args, "raw") ? "raw" : "tabular");
    const pendingImport = context.pendingImports?.find((item) => item.id === importId);
    if (!pendingImport) return { kind: "error", output: `Pending import not found: ${importId}` };
    if (!path)
      return { kind: "error", output: "Usage: import-confirm <importId> path=<virtualPath>" };
    if (mode !== "tabular" && mode !== "raw") {
      return { kind: "error", output: "mode must be tabular or raw" };
    }
    if (mode === "raw") {
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

  return undefined;
};
