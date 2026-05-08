export const quoteImportCommandArg = (value: string): string =>
  /[\s"']/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value;

export const importLineCommand = (importId: string, lineIndex: number, value: string): string =>
  `import-line ${importId} line=${lineIndex + 1} value=${encodeURIComponent(value)}`;

export const importSetCommand = (importId: string, options: string): string =>
  `import-set ${importId} ${options}`;

export const importColumnCommand = (importId: string, columnId: string, exclude: boolean): string =>
  `import-column ${importId} column=${quoteImportCommandArg(columnId)} action=${
    exclude ? "exclude" : "include"
  }`;
