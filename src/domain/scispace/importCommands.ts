import { isColumnDateFormat, isConversionType } from "../columnConversion";
import {
  defaultImportParseOptions,
  InvalidImportColumnValue,
  normalizeVirtualPath,
  parseDelimitedText,
} from "../csv";
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
  if (command === "import-open" || command === "upload-open") {
    const importId = args[0] ?? "";
    const isUpload = command === "upload-open";
    const uploadRef = readOption(args, "ref") ?? importId;
    const uploadPayload = isUpload ? context.uploadPayloads?.[uploadRef] : undefined;
    const fileName = readOption(args, "name") ?? uploadPayload?.fileName;
    const encodedText = readOption(args, "text");
    const text = encodedText === undefined ? uploadPayload?.text : decodeURIComponent(encodedText);
    const mode = readOption(args, "mode") ?? uploadPayload?.mode ?? "tabular";
    if (!importId) return { kind: "error", output: "importId is required" };
    if (!fileName) return { kind: "error", output: "name is required" };
    if (text === undefined) {
      return isUpload
        ? { kind: "error", output: `Upload payload not found: ${uploadRef}` }
        : { kind: "error", output: "text is required" };
    }
    if (mode !== "tabular" && mode !== "raw") {
      return { kind: "error", output: "mode must be tabular or raw" };
    }
    const pendingImport: PendingImport = {
      id: importId,
      fileName,
      text,
      mode,
      options: defaultImportParseOptions,
    };
    return {
      kind: "import-open",
      importId,
      pendingImport,
      output: `${command === "upload-open" ? "Upload" : "Import"} opened: ${fileName}`,
    };
  }

  if (command === "import-preview") {
    const importId = args[0] ?? "";
    const pendingImport = context.pendingImports?.find((item) => item.id === importId);
    if (!pendingImport) return { kind: "error", output: `Pending import not found: ${importId}` };

    try {
      const columnTypeErrors = new Map<string, string>();
      const preview = parseDelimitedText(
        pendingImport.text,
        pendingImport.fileName,
        normalizeVirtualPath(pendingImport.fileName),
        Date.now(),
        pendingImport.options,
        (columnId, message) => {
          if (!columnTypeErrors.has(columnId)) columnTypeErrors.set(columnId, message);
        },
      );
      return {
        kind: "import-preview",
        importId,
        preview: parseBooleanOption(args, "full")
          ? preview
          : { ...preview, rows: preview.rows.slice(0, 500) },
        ...(columnTypeErrors.size
          ? { columnTypeErrors: Object.fromEntries(columnTypeErrors) }
          : {}),
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

    if (readOption(args, "preset") === "apply") {
      if (!pendingImport.detectedPreset) {
        return { kind: "error", output: `No detected preset for import: ${importId}` };
      }
      return {
        kind: "import-updated",
        importId,
        pendingImport: {
          ...pendingImport,
          mode: "tabular",
          presetOverridden: false,
          options: {
            ...defaultImportParseOptions,
            ...pendingImport.detectedPreset.options,
            excludedColumnIds: [],
          },
        },
        output: `Import preset reapplied: ${pendingImport.detectedPreset.label}`,
      };
    }

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
    const changedPresetSetting =
      pendingImport.detectedPreset !== undefined &&
      (skipRowsValue !== undefined ||
        delimiter !== undefined ||
        readOption(args, "commentPrefix") !== undefined ||
        readOption(args, "hasHeader") !== undefined ||
        mode !== undefined ||
        columnNames !== undefined);
    const pendingImportUpdate: PendingImport = {
      ...pendingImport,
      presetOverridden: changedPresetSetting ? true : pendingImport.presetOverridden,
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
    if (action === "type") {
      const index = (parseInteger(readOption(args, "index")) ?? 0) - 1;
      const type = readOption(args, "type");
      const format = readOption(args, "format") ?? "iso";
      if (!pendingImport.allPreview?.columns[index])
        return { kind: "error", output: "Invalid import column index" };
      if (type !== "auto" && !isConversionType(type))
        return {
          kind: "error",
          output: "type must be auto, number, string, date, datetime, or time",
        };
      if (!isColumnDateFormat(format) || (format !== "iso" && type !== "date"))
        return { kind: "error", output: "format must be iso, or dmy or mdy for date columns" };
      const columnTypes = { ...pendingImport.options.columnTypes };
      if (type === "auto") delete columnTypes[index];
      else columnTypes[index] = { type, format };
      return {
        kind: "import-updated",
        importId,
        pendingImport: {
          ...pendingImport,
          options: { ...pendingImport.options, columnTypes },
        },
        output: `Import column ${index + 1} type: ${type}`,
      };
    }
    if (!column) return { kind: "error", output: "column is required" };
    if (action === "rename") {
      const name = readOption(args, "name");
      const index = pendingImport.allPreview?.columns.findIndex(({ id }) => id === column) ?? -1;
      if (name === undefined) return { kind: "error", output: "name is required" };
      if (index < 0) return { kind: "error", output: `Unknown import column: ${column}` };
      const columnNames = Array.from(pendingImport.options.columnNames, (value) => value ?? "");
      while (columnNames.length <= index) columnNames.push("");
      columnNames[index] = name.trim();
      return {
        kind: "import-updated",
        importId,
        pendingImport: {
          ...pendingImport,
          presetOverridden: pendingImport.detectedPreset ? true : pendingImport.presetOverridden,
          options: { ...pendingImport.options, columnNames },
        },
        output: `Import column renamed: ${column}`,
      };
    }
    if (action !== "include" && action !== "exclude") {
      return { kind: "error", output: "action must be include, exclude, rename, or type" };
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
      if (error instanceof InvalidImportColumnValue)
        return { kind: "error", output: error.message };
      const message = error instanceof Error ? error.message : "Unable to parse tabular file";
      return { kind: "import-confirm", importId, parseError: message, output: message };
    }
  }

  return undefined;
};
