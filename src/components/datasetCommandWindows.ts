export const quoteDatasetCommandValue = (value: string): string =>
  /\s|["']|=|,/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value;

export const datasetOption = (key: string, value: string): string =>
  `${key}=${quoteDatasetCommandValue(value)}`;
