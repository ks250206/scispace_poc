import type { Dataset, ImportDelimiter, ImportParseOptions } from "./types";

export const defaultImportParseOptions: ImportParseOptions = {
  skipRows: 0,
  delimiter: "auto",
  commentPrefix: "",
  hasHeader: true,
  columnNames: [],
};

const normalizeCell = (value: string): number | string => {
  const trimmed = value.trim();
  if (trimmed === "") return "";
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) && /^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(trimmed)
    ? numeric
    : trimmed;
};

export const normalizeVirtualPath = (fileName: string, directory = "~/raw"): string => {
  const safeName = fileName.trim().replaceAll("\\", "/").split("/").filter(Boolean).at(-1);

  return `${directory.replace(/\/$/, "")}/${safeName || "untitled.txt"}`;
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

export const parseDelimitedText = (
  text: string,
  name: string,
  sourcePath: string,
  now = Date.now(),
  options: Partial<ImportParseOptions> = {},
): Dataset => {
  const resolvedOptions = { ...defaultImportParseOptions, ...options };
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .slice(Math.max(0, resolvedOptions.skipRows))
    .filter(
      (line) =>
        resolvedOptions.commentPrefix === "" ||
        !line.trimStart().startsWith(resolvedOptions.commentPrefix),
    )
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    throw new Error("Empty tabular file");
  }

  const delimiter = delimiterToString(resolvedOptions.delimiter, lines[0]);
  const firstCells = splitDelimitedLine(lines[0], delimiter);
  const headers = resolvedOptions.hasHeader
    ? firstCells.map((header, index) => header.trim() || `column_${index + 1}`)
    : firstCells.map((_, index) => {
        const columnName = resolvedOptions.columnNames[index]?.trim();
        return columnName || `column_${index + 1}`;
      });
  const dataLines = resolvedOptions.hasHeader ? lines.slice(1) : lines;

  const rows = dataLines.map((line) => {
    const cells = splitDelimitedLine(line, delimiter);
    return Object.fromEntries(
      headers.map((header, index) => [header, normalizeCell(cells[index] ?? "")]),
    );
  });

  return {
    id: crypto.randomUUID(),
    name,
    sourcePath,
    columns: headers,
    rows,
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
    columns: ["index", "time", "signal", "background"],
    rows,
    createdBy: "seed",
    createdAt: now,
  };
};

export const datasetToDelimitedText = (dataset: Dataset): string => {
  const body = dataset.rows.map((row) =>
    dataset.columns.map((column) => String(row[column] ?? "")).join(","),
  );
  return [dataset.columns.join(","), ...body].join("\n");
};
