import type {
  DataValue,
  Dataset,
  DatasetColumn,
  DetectedImportPreset,
  ImportDelimiter,
  ImportParseOptions,
} from "./types";

export const defaultImportParseOptions: ImportParseOptions = {
  skipRows: 0,
  delimiter: "auto",
  commentPrefix: "",
  hasHeader: true,
  columnNames: [],
  excludedColumnIds: [],
};

export const normalizeDataValue = (value: string): number | string => {
  const trimmed = value.trim();
  if (trimmed === "") return "";
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) && /^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(trimmed)
    ? numeric
    : trimmed;
};

const inferColumnType = (values: DataValue[]): DatasetColumn["dataType"] => {
  const nonEmptyValues = values.filter((value) => value !== "");
  if (nonEmptyValues.length === 0) return "string";
  const hasNumber = nonEmptyValues.some((value) => typeof value === "number");
  const hasString = nonEmptyValues.some((value) => typeof value === "string");
  if (hasNumber && hasString) return "mixed";
  return hasNumber ? "number" : "string";
};

const uniqueColumnId = (name: string, index: number, usedIds: Set<string>): string => {
  const fallback = `column_${index + 1}`;
  const base =
    name
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^\w.-]/g, "_") || fallback;
  let candidate = base;
  let suffix = 1;
  while (usedIds.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  usedIds.add(candidate);
  return candidate;
};

export const createDatasetColumns = (
  names: string[],
  rows: Record<string, DataValue>[] = [],
): DatasetColumn[] => {
  const usedIds = new Set<string>();
  return names.map((name, index) => {
    const displayName = name.trim() || `column_${index + 1}`;
    const id = uniqueColumnId(displayName, index, usedIds);
    return {
      id,
      name: displayName,
      sourceName: displayName,
      dataType: inferColumnType(rows.map((row) => row[id] ?? row[displayName] ?? "")),
    };
  });
};

export const normalizeDataset = (dataset: Dataset): Dataset => {
  const legacyColumns = dataset.columns as unknown[];
  if (legacyColumns.length > 0 && typeof legacyColumns[0] !== "string") {
    const usedIds = new Set<string>();
    const columns = dataset.columns.map((column, index) => ({
      id: column.id || uniqueColumnId(column.name, index, usedIds),
      name: column.name || column.id || `column_${index + 1}`,
      sourceName: column.sourceName ?? column.name ?? column.id,
      dataType: column.dataType ?? inferColumnType(dataset.rows.map((row) => row[column.id] ?? "")),
    }));
    return { ...dataset, columns };
  }

  const usedIds = new Set<string>();
  const columns = (legacyColumns as string[]).map((name, index) => {
    const displayName = String(name || `column_${index + 1}`);
    const id = uniqueColumnId(displayName, index, usedIds);
    return {
      id,
      name: displayName,
      sourceName: displayName,
      dataType: inferColumnType(dataset.rows.map((row) => row[displayName] ?? "")),
    };
  });
  const rows = dataset.rows.map((row) =>
    Object.fromEntries(
      columns.map((column) => [
        column.id,
        row[column.sourceName ?? column.name] ?? row[column.id] ?? "",
      ]),
    ),
  );
  return { ...dataset, columns, rows };
};

export const datasetColumnIds = (dataset: Dataset): string[] =>
  normalizeDataset(dataset).columns.map((column) => column.id);

export const datasetColumnNames = (dataset: Dataset): string[] =>
  normalizeDataset(dataset).columns.map((column) => column.name);

export const resolveDatasetColumnId = (
  dataset: Dataset,
  token: string | undefined,
): string | undefined => {
  if (!token) return undefined;
  const normalized = normalizeDataset(dataset);
  return normalized.columns.find((column) => column.id === token || column.name === token)?.id;
};

export const datasetColumnLabel = (dataset: Dataset, columnId: string): string =>
  normalizeDataset(dataset).columns.find((column) => column.id === columnId)?.name ?? columnId;

export const normalizeVirtualPath = (fileName: string, directory = "~/raw"): string => {
  const safeName = fileName.trim().replaceAll("\\", "/").split("/").filter(Boolean).at(-1);

  return `${directory.replace(/\/$/, "")}/${safeName || "untitled.txt"}`;
};

const detectRigakuRasPreset = (
  lines: string[],
  fileName: string,
): DetectedImportPreset | undefined => {
  if (!/\.ras$/i.test(fileName) && !lines.some((line) => line.trim() === "*RAS_INT_START")) {
    return undefined;
  }
  const startIndex = lines.findIndex((line) => line.trim() === "*RAS_INT_START");
  const endIndex = lines.findIndex((line) => line.trim() === "*RAS_INT_END");
  if (startIndex < 0 || endIndex <= startIndex) return undefined;
  const metadata = Object.fromEntries(
    lines
      .slice(0, startIndex)
      .filter((line) => line.startsWith("*"))
      .map((line) => {
        const match = line.match(/^\*(\S+)\s+"?([^"]*)"?/);
        return match ? [match[1], match[2].trim()] : undefined;
      })
      .filter((entry): entry is [string, string] => Boolean(entry)),
  );

  return {
    id: "rigaku-ras",
    label: "Rigaku RAS",
    dataStartLine: startIndex + 2,
    options: {
      skipRows: startIndex + 1,
      delimiter: "space",
      commentPrefix: "*",
      hasHeader: false,
      columnNames: ["angle", "intensity", "attenuation"],
    },
    metadata,
  };
};

const detectEcLabMptPreset = (
  lines: string[],
  fileName: string,
  text: string,
): DetectedImportPreset | undefined => {
  if (!/\.mpt$/i.test(fileName) && !text.startsWith("EC-Lab ASCII FILE")) return undefined;
  const headerLine = lines.find((line) => /^Nb header lines\s*:/i.test(line.trim()));
  const headerLineCount = Number(headerLine?.split(":").at(1)?.trim());
  if (!Number.isInteger(headerLineCount) || headerLineCount < 1) return undefined;

  const metadata = Object.fromEntries(
    lines
      .slice(0, Math.max(0, headerLineCount - 1))
      .map((line) => line.split(":"))
      .filter((parts) => parts.length >= 2)
      .map(([key, ...value]) => [key.trim(), value.join(":").trim()])
      .filter(([key]) => key.length > 0),
  );

  return {
    id: "ec-lab-mpt",
    label: "EC-Lab MPT",
    dataStartLine: headerLineCount,
    options: {
      skipRows: headerLineCount - 1,
      delimiter: "tab",
      commentPrefix: "",
      hasHeader: true,
    },
    metadata,
  };
};

export const detectImportPreset = (
  text: string,
  fileName: string,
): DetectedImportPreset | undefined => {
  const lines = text.split(/\r?\n/);
  return detectRigakuRasPreset(lines, fileName) ?? detectEcLabMptPreset(lines, fileName, text);
};

const delimiterToString = (delimiter: ImportDelimiter, sampleLine: string): string => {
  if (delimiter === "comma") return ",";
  if (delimiter === "tab") return "\t";
  if (delimiter === "space") return " ";
  if (delimiter === "semicolon") return ";";
  if (sampleLine.includes("\t")) return "\t";
  if (sampleLine.includes(";")) return ";";
  return ",";
};

const splitDelimitedLine = (line: string, delimiter: string): string[] => {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current);
  return cells;
};

const tabularLines = (text: string, options: ImportParseOptions): string[] =>
  text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .slice(Math.max(0, options.skipRows))
    .filter(
      (line) => options.commentPrefix === "" || !line.trimStart().startsWith(options.commentPrefix),
    )
    .filter((line) => line.trim().length > 0);

const parseHeaders = (firstCells: string[], options: ImportParseOptions): string[] =>
  firstCells.map((header, index) => {
    const columnName = options.columnNames[index]?.trim();
    if (columnName) return columnName;
    if (options.hasHeader) return header.trim() || `column_${index + 1}`;
    return `column_${index + 1}`;
  });

export const parseDelimitedText = (
  text: string,
  name: string,
  sourcePath: string,
  now = Date.now(),
  options: Partial<ImportParseOptions> = {},
): Dataset => {
  const resolvedOptions = { ...defaultImportParseOptions, ...options };
  const lines = tabularLines(text, resolvedOptions);

  if (lines.length === 0) {
    throw new Error("Empty tabular file");
  }

  const delimiter = delimiterToString(resolvedOptions.delimiter, lines[0]);
  const firstCells = splitDelimitedLine(lines[0], delimiter);
  const headers = parseHeaders(firstCells, resolvedOptions);
  const dataLines = resolvedOptions.hasHeader ? lines.slice(1) : lines;

  const usedIds = new Set<string>();
  const columns = headers.map((header, index) => ({
    id: uniqueColumnId(header, index, usedIds),
    name: header,
    sourceName: header,
    dataType: "string" as const,
  }));

  const rows = dataLines.map((line) => {
    const cells = splitDelimitedLine(line, delimiter);
    return Object.fromEntries(
      columns.map((column, index) => [column.id, normalizeDataValue(cells[index] ?? "")]),
    );
  });
  const typedColumns = columns.map((column) => ({
    ...column,
    dataType: inferColumnType(rows.map((row) => row[column.id] ?? "")),
  }));
  const excludedColumnIds = new Set(resolvedOptions.excludedColumnIds);
  const includedColumns = typedColumns.filter((column) => !excludedColumnIds.has(column.id));
  if (includedColumns.length === 0) {
    throw new Error("No import columns selected");
  }
  const includedColumnIds = new Set(includedColumns.map((column) => column.id));
  const includedRows = rows.map((row) =>
    Object.fromEntries(Object.entries(row).filter(([columnId]) => includedColumnIds.has(columnId))),
  );

  return {
    id: crypto.randomUUID(),
    name,
    sourcePath,
    columns: includedColumns,
    rows: includedRows,
    createdBy: "upload",
    createdAt: now,
  };
};

export const createSeedDataset = (now = Date.now()): Dataset => {
  const rows = Array.from({ length: 160 }, (_, index) => {
    const x = index / 8;
    return {
      index,
      time: Number(x.toFixed(3)),
      signal: Number((Math.sin(x) * 12 + Math.cos(x / 2) * 3).toFixed(4)),
      background: Number((Math.cos(x / 3) * 2 + 5).toFixed(4)),
    };
  });

  return {
    id: "seed-waveform",
    name: "waveform.csv",
    sourcePath: "~/raw/waveform.csv",
    columns: createDatasetColumns(["index", "time", "signal", "background"], rows),
    rows,
    createdBy: "seed",
    createdAt: now,
  };
};

export const datasetToDelimitedText = (dataset: Dataset): string => {
  const normalized = normalizeDataset(dataset);
  const body = normalized.rows.map((row) =>
    normalized.columns.map((column) => String(row[column.id] ?? "")).join(","),
  );
  return [normalized.columns.map((column) => column.name).join(","), ...body].join("\n");
};
