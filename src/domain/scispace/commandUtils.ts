import type { Dataset, PendingImport, PlotSpec, VirtualFile } from "../types";

export interface CommandContext {
  datasets: Dataset[];
  files?: VirtualFile[];
  pendingImports?: PendingImport[];
  plotSpecs?: PlotSpec[];
}

export const findDataset = (datasets: Dataset[], token: string): Dataset | undefined =>
  datasets.find(
    (dataset) =>
      dataset.id === token || dataset.name === token || dataset.sourcePath.endsWith(`/${token}`),
  );

export const tokenizeCommand = (input: string): string[] => {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | undefined;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if ((char === "'" || char === '"') && !quote) {
      quote = char;
    } else if (char === quote) {
      quote = undefined;
    } else if (/\s/.test(char) && !quote) {
      if (current) tokens.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current) tokens.push(current);
  return tokens;
};

export const readOption = (tokens: string[], key: string): string | undefined => {
  const prefix = `${key}=`;
  return tokens.find((token) => token.startsWith(prefix))?.slice(prefix.length);
};

export const isString = (value: string | undefined): value is string => Boolean(value);

export const parseBooleanOption = (tokens: string[], key: string): boolean =>
  readOption(tokens, key) === "true";

export const parseOptionalBoolean = (value: string | undefined): boolean | undefined => {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
};

export const parsePositiveNumber = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
};

export const parseNonNegativeNumber = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
};

export const parseInteger = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;
  const number = Number(value);
  return Number.isInteger(number) ? number : undefined;
};

export const parseColor = (value: string | undefined): string | undefined => {
  if (value === undefined) return undefined;
  return /^#[\da-f]{6}$/i.test(value) ? value : undefined;
};

export const importDelimiters = new Set(["auto", "comma", "tab", "space", "semicolon"]);

export const isVirtualRawPath = (path: string | undefined): path is string =>
  path === "~/raw" || Boolean(path?.startsWith("~/raw/"));

export const isSafeFileName = (name: string | undefined): name is string => {
  if (!name?.trim()) return false;
  return !name.includes("/") && !name.includes("\\") && name !== "." && name !== "..";
};
