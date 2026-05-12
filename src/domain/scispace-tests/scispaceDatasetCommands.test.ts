import { describe, expect, it } from "vitest";
import type { Dataset } from "../types";
import { dataset, executeScispaceCommand, runCommand } from "./scispaceCommandTestUtils";

describe("scispace dataset commands", () => {
  it("creates empty datasets from command input", () => {
    const result = runCommand("dataset-new calc columns=x,y rows=3");

    expect(result.kind).toBe("dataset-created");
    if (result.kind === "dataset-created") {
      expect(result.dataset).toMatchObject({
        name: "calc",
        sourcePath: "~/raw/calc.csv",
        createdBy: "elt",
      });
      expect(result.dataset.columns.map((column) => column.id)).toEqual(["x", "y"]);
      expect(result.dataset.rows).toEqual([
        { x: "", y: "" },
        { x: "", y: "" },
        { x: "", y: "" },
      ]);
      expect(result.output).toBe("Created dataset calc (3 rows, 2 cols)");
    }
  });

  it("calculates new columns with column and scalar expressions", () => {
    const result = runCommand('dataset-calc waveform.csv column=sum expr="signal + background"');

    expect(result.kind).toBe("dataset-updated");
    if (result.kind === "dataset-updated") {
      expect(result.dataset.columns.at(-1)).toMatchObject({
        id: "sum",
        name: "sum",
        dataType: "number",
      });
      expect(result.dataset.rows[0]?.sum).toBe(10);
      expect(result.dataset.rows[1]?.sum).toBeCloseTo(11.4885);
    }
  });

  it("supports parentheses, scalar math, and existing column overwrite", () => {
    const result = runCommand(
      'dataset-calc waveform.csv column=signal expr="(signal + background) * 2"',
    );

    expect(result.kind).toBe("dataset-updated");
    if (result.kind === "dataset-updated") {
      expect(result.dataset.columns.map((column) => column.id)).toEqual(
        dataset.columns.map((column) => column.id),
      );
      expect(result.dataset.rows[0]?.signal).toBe(20);
      expect(result.dataset.rows[1]?.signal).toBeCloseTo(22.977);
    }
  });

  it("resolves column names as expression identifiers", () => {
    const namedDataset: Dataset = {
      ...dataset,
      columns: [
        { id: "x1", name: "time", dataType: "number" },
        { id: "v1", name: "voltage", dataType: "number" },
      ],
      rows: [
        { x1: 1, v1: 2 },
        { x1: 3, v1: 4 },
      ],
    };

    const result = executeScispaceCommand(
      'dataset-calc waveform.csv column=double expr="voltage * 2"',
      {
        datasets: [namedDataset],
      },
    );

    expect(result.kind).toBe("dataset-updated");
    if (result.kind === "dataset-updated") {
      expect(result.dataset.rows.map((row) => row.double)).toEqual([4, 8]);
    }
  });

  it("reports malformed dataset commands without partial updates", () => {
    expect(runCommand("dataset-new calc columns=x,y rows=-1").kind).toBe("error");
    expect(runCommand("dataset-new calc columns= rows=3").kind).toBe("error");
    expect(runCommand('dataset-calc missing.csv column=sum expr="signal + background"').kind).toBe(
      "error",
    );
    expect(runCommand('dataset-calc waveform.csv column=sum expr="signal +"').kind).toBe("error");
    expect(runCommand('dataset-calc waveform.csv column=sum expr="missing + 1"').kind).toBe(
      "error",
    );
    expect(runCommand('dataset-calc waveform.csv column=sum expr="signal / 0"').kind).toBe("error");
  });

  it("rejects non-numeric row values in expressions", () => {
    const mixedDataset: Dataset = {
      ...dataset,
      columns: [
        { id: "name", name: "name", dataType: "string" },
        { id: "value", name: "value", dataType: "number" },
      ],
      rows: [{ name: "sample", value: 1 }],
    };

    const result = executeScispaceCommand(
      'dataset-calc waveform.csv column=bad expr="name + value"',
      {
        datasets: [mixedDataset],
      },
    );

    expect(result).toMatchObject({
      kind: "error",
      output: "Non-numeric value in column name at row 1",
    });
  });
});
