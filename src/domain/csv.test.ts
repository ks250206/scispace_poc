import { describe, expect, it } from "vitest";
import {
  createSeedDataset,
  datasetToDelimitedText,
  normalizeVirtualPath,
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

    expect(dataset.columns).toEqual(["time", "signal", "label"]);
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

    expect(dataset.columns).toEqual(["x", "y"]);
    expect(dataset.rows[0]).toEqual({ x: 1, y: 'two "quoted"' });
  });

  it("fills empty header names and rejects empty files", () => {
    const dataset = parseDelimitedText(
      ",signal\n0,1",
      "blank-header.csv",
      "~/raw/blank-header.csv",
    );

    expect(dataset.columns).toEqual(["column_1", "signal"]);
    expect(() => parseDelimitedText("\n", "empty.csv", "~/raw/empty.csv")).toThrow(
      "Empty tabular file",
    );
  });

  it("round-trips generated seed data to delimited text", () => {
    const dataset = createSeedDataset(10);
    const text = datasetToDelimitedText(dataset);

    expect(dataset.rows).toHaveLength(160);
    expect(text.split("\n")[0]).toBe("index,time,signal,background");
  });
});
