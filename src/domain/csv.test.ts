import { describe, expect, it } from "vitest";
import {
  createSeedDataset,
  datasetToDelimitedText,
  datasetColumnNames,
  normalizeVirtualPath,
  normalizeDataset,
  parseDelimitedText,
} from "./csv";

describe("csv domain", () => {
  it("normalizes upload names into ~/raw paths", () => {
    expect(normalizeVirtualPath("nested/sample.csv")).toBe("~/raw/sample.csv");
    expect(normalizeVirtualPath("")).toBe("~/raw/untitled.txt");
  });

  it("parses CSV text into typed dataset rows", () => {
    const dataset = parseDelimitedText(
      "time,signal,label\n0,1.5,a\n1,2.25,b",
      "sample.csv",
      "~/raw/sample.csv",
      10,
    );

    expect(datasetColumnNames(dataset)).toEqual(["time", "signal", "label"]);
    expect(dataset.columns[0]).toMatchObject({ id: "time", dataType: "number" });
    expect(dataset.rows).toEqual([
      { time: 0, signal: 1.5, label: "a" },
      { time: 1, signal: 2.25, label: "b" },
    ]);
    expect(dataset.createdBy).toBe("upload");
  });

  it("parses TSV and quoted cells", () => {
    const dataset = parseDelimitedText(
      'x\ty\n"1"\t"two ""quoted"""',
      "sample.tsv",
      "~/raw/sample.tsv",
    );

    expect(datasetColumnNames(dataset)).toEqual(["x", "y"]);
    expect(dataset.rows[0]).toEqual({ x: 1, y: 'two "quoted"' });
  });

  it("fills empty header names and rejects empty files", () => {
    const dataset = parseDelimitedText(
      ",signal\n0,1",
      "blank-header.csv",
      "~/raw/blank-header.csv",
    );

    expect(datasetColumnNames(dataset)).toEqual(["column_1", "signal"]);
    expect(() => parseDelimitedText("\n", "empty.csv", "~/raw/empty.csv")).toThrow(
      "Empty tabular file",
    );
  });

  it("applies import parse options for skipped rows, delimiters, and comment prefixes", () => {
    const dataset = parseDelimitedText(
      "instrument header\n# comment\nx;y\n1;10\n2;20",
      "configured.csv",
      "~/raw/configured.csv",
      10,
      { skipRows: 1, delimiter: "semicolon", commentPrefix: "#" },
    );

    expect(datasetColumnNames(dataset)).toEqual(["x", "y"]);
    expect(dataset.rows).toEqual([
      { x: 1, y: 10 },
      { x: 2, y: 20 },
    ]);
  });

  it("supports explicit delimiter choices and empty cells", () => {
    expect(
      parseDelimitedText("x,y\n1,", "comma.csv", "~/raw/comma.csv", 10, { delimiter: "comma" })
        .rows[0],
    ).toEqual({ x: 1, y: "" });
    expect(
      parseDelimitedText("x y\n1 2", "space.csv", "~/raw/space.csv", 10, { delimiter: "space" })
        .rows[0],
    ).toEqual({ x: 1, y: 2 });
    expect(
      parseDelimitedText("x\ty\n1\t2", "tab.tsv", "~/raw/tab.tsv", 10, { delimiter: "tab" })
        .rows[0],
    ).toEqual({ x: 1, y: 2 });
  });

  it("auto-detects semicolon delimiters", () => {
    const dataset = parseDelimitedText("x;y\n1;2", "semi.csv", "~/raw/semi.csv", 10);

    expect(datasetColumnNames(dataset)).toEqual(["x", "y"]);
    expect(dataset.rows[0]).toEqual({ x: 1, y: 2 });
  });

  it("uses generated column names when a file has no header row", () => {
    const dataset = parseDelimitedText("1,2\n3,4", "no-header.csv", "~/raw/no-header.csv", 10, {
      hasHeader: false,
    });

    expect(datasetColumnNames(dataset)).toEqual(["column_1", "column_2"]);
    expect(dataset.rows).toEqual([
      { column_1: 1, column_2: 2 },
      { column_1: 3, column_2: 4 },
    ]);
  });

  it("uses custom column names when a headerless file provides them", () => {
    const dataset = parseDelimitedText("1,2\n3,4", "no-header.csv", "~/raw/no-header.csv", 10, {
      hasHeader: false,
      columnNames: ["energy", "intensity"],
    });

    expect(datasetColumnNames(dataset)).toEqual(["energy", "intensity"]);
    expect(dataset.rows[0]).toEqual({ energy: 1, intensity: 2 });
  });

  it("round-trips generated seed data to delimited text", () => {
    const dataset = createSeedDataset(10);
    const text = datasetToDelimitedText(dataset);

    expect(dataset.rows).toHaveLength(160);
    expect(text.split("\n")[0]).toBe("index,time,signal,background");
  });

  it("normalizes legacy string columns into column objects", () => {
    const dataset = normalizeDataset({
      id: "legacy",
      name: "legacy.csv",
      sourcePath: "~/raw/legacy.csv",
      columns: ["x", "signal"] as never,
      rows: [{ x: 1, signal: 2 }],
      createdBy: "upload",
      createdAt: 10,
    });

    expect(dataset.columns).toEqual([
      { id: "x", name: "x", sourceName: "x", dataType: "number" },
      { id: "signal", name: "signal", sourceName: "signal", dataType: "number" },
    ]);
    expect(dataset.rows[0]).toEqual({ x: 1, signal: 2 });
  });
});
