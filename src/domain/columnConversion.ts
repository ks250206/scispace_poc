import type { Dataset, DatasetColumn, DataValue } from "./types";

export type ColumnConversionType = Exclude<DatasetColumn["dataType"], "mixed">;
export type ColumnDateFormat = "iso" | "dmy" | "mdy";

export const isConversionType = (value?: string): value is ColumnConversionType =>
  value === "number" ||
  value === "string" ||
  value === "date" ||
  value === "datetime" ||
  value === "time";

export const isColumnDateFormat = (value: string): value is ColumnDateFormat =>
  value === "iso" || value === "dmy" || value === "mdy";

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const slashDate = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const isoDateTime =
  /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
const clockTime = /^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.(\d{1,3}))?)?$/;
const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

const parseIsoDate = (date: string): string | undefined => {
  if (!isoDate.test(date)) return undefined;
  const timestamp = Date.parse(`${date}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().startsWith(date)
    ? date
    : undefined;
};

const parseCalendarDate = (text: string, format: ColumnDateFormat) => {
  if (format === "iso") return parseIsoDate(text);
  const match = slashDate.exec(text);
  if (!match) return undefined;
  const [, first, second, year] = match;
  const [month, day] = format === "dmy" ? [second, first] : [first, second];
  return parseIsoDate(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
};

const parseDateTime = (text: string): string | undefined => {
  const match = isoDateTime.exec(text);
  if (!match || !parseIsoDate(match[1])) return undefined;
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) return undefined;
  const canonical = new Date(timestamp).toISOString();
  return canonical.length === 24 ? canonical : undefined;
};

const parseTime = (text: string): string | undefined => {
  const match = clockTime.exec(text);
  if (!match) return undefined;
  const [, hour, minute, second = "00", fraction = ""] = match;
  const milliseconds = fraction.padEnd(3, "0");
  const time = `${hour.padStart(2, "0")}:${minute}:${second}`;
  return milliseconds === "000" ? time : `${time}.${milliseconds}`;
};

export const isBlankColumnValue = (value: DataValue | undefined): boolean =>
  value === undefined || (typeof value === "string" && value.trim() === "");

export const convertColumnValue = (
  value: DataValue,
  type: ColumnConversionType,
  format: ColumnDateFormat = "iso",
): DataValue | undefined => {
  if (isBlankColumnValue(value)) return value;
  if (type === "string") return String(value);
  const text = String(value).trim();
  if (type === "date") return parseCalendarDate(text, format);
  if (type === "datetime") return parseDateTime(text);
  if (type === "time") return parseTime(text);
  const number = Number(text);
  return decimal.test(text) && Number.isFinite(number) ? number : undefined;
};

export const inspectColumnConversion = (
  dataset: Dataset,
  columnId: string,
  type: ColumnConversionType,
  format: ColumnDateFormat,
) => {
  const invalidRows: number[] = [];
  const samples: { row: number; before: DataValue; after: DataValue }[] = [];
  let converted = 0;
  let blank = 0;
  const values = dataset.rows.map((row, index) => {
    const before = row[columnId];
    if (before === undefined || isBlankColumnValue(before)) {
      blank += 1;
      return before;
    }
    const after = convertColumnValue(before, type, format);
    if (after === undefined) invalidRows.push(index + 1);
    else {
      converted += 1;
      if (samples.length < 5) samples.push({ row: index + 1, before, after });
    }
    return after ?? "";
  });
  return { values, converted, blank, invalidRows, samples };
};
