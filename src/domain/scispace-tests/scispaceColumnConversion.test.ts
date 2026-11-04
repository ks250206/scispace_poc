import { describe, expect, it } from "vite-plus/test";
import { createDatasetColumns } from "../csv";
import { executeScispaceCommand } from "../scispace";
import type { Dataset, DataValue } from "../types";

const datasetWith = (values: (DataValue | undefined)[]): Dataset => ({
  id: "sample-id",
  name: "sample.csv",
  sourcePath: "~/raw/sample.csv",
  columns: createDatasetColumns(["value", "row"]),
  rows: values.map((value, row) => {
    const record: Record<string, DataValue> = { row };
    if (value !== undefined) record.value = value;
    return record;
  }),
  createdAt: 0,
  createdBy: "upload",
});

const command = (dataset: Dataset, args: string) =>
  executeScispaceCommand(`table-edit sample-id column=value ${args}`, { datasets: [dataset] });

const updated = (dataset: Dataset, args: string) => {
  const result = command(dataset, args);
  expect(result.kind, result.output).toBe("dataset-updated");
  if (result.kind !== "dataset-updated") throw new Error(result.output);
  return result.dataset;
};

describe("column conversion commands", () => {
  it("previews signed numeric values and requires explicit handling of invalid rows", () => {
    const dataset = datasetWith([" -1.2e-3 ", "+.5", "4.", "", "  ", undefined, "0x10", "1e999"]);
    const preview = command(dataset, "action=preview-conversion type=number");
    expect(preview).toMatchObject({
      kind: "text",
      output: expect.stringContaining("3 convertible, 3 blank, 2 invalid"),
    });
    expect(preview.output).toContain('Row 1: " -1.2e-3 " → -0.0012');
    expect(preview.output).toContain("Invalid rows: 7, 8");
    expect(command(dataset, "action=convert-column type=number").kind).toBe("error");
    expect(dataset.rows[0]?.value).toBe(" -1.2e-3 ");

    const converted = updated(dataset, "action=convert-column type=number invalid=missing");
    expect(converted.columns[0]).toMatchObject({
      id: "value",
      dataType: "number",
      explicitType: true,
    });
    expect(converted.rows.map(({ value }) => value)).toEqual([
      -0.0012,
      0.5,
      4,
      "",
      "  ",
      undefined,
      "",
      "",
    ]);
    expect(command(converted, "action=set-cell row=1 value=word").kind).toBe("error");
    expect(updated(converted, "action=set-cell row=1 value=-3.").rows[0]?.value).toBe(-3);
  });

  it("supports calculations and plotting after conversion and preserves explicit string edits", () => {
    const dataset = updated(datasetWith(["1.5", "2e1"]), "action=convert-column type=number");
    const result = executeScispaceCommand('dataset-calc sample-id column=scaled expr="value * 2"', {
      datasets: [dataset],
    });
    expect(result.kind).toBe("dataset-updated");
    if (result.kind === "dataset-updated") expect(result.dataset.rows[1]?.scaled).toBe(40);
    expect(
      executeScispaceCommand("plot sample-id x=row y=value", { datasets: [dataset] }).kind,
    ).toBe("plot-created");
    const strings = updated(dataset, "action=convert-column type=string");
    expect(strings.rows[1]?.value).toBe("20");
    expect(updated(strings, "action=set-cell row=1 value=0002").rows[0]?.value).toBe("0002");
  });

  it("validates calendar dates and uses the selected slash format", () => {
    const dataset = datasetWith(["01/02/2026", "29/02/2024", "31/04/2026"]);
    expect(command(dataset, "action=convert-column type=date").kind).toBe("error");
    const dates = updated(dataset, "action=convert-column type=date format=dmy invalid=missing");
    expect(dates.rows.map(({ value }) => value)).toEqual(["2026-02-01", "2024-02-29", ""]);
    expect(
      updated(datasetWith(["01/02/2026"]), "action=convert-column type=date format=mdy").rows[0]
        ?.value,
    ).toBe("2026-01-02");
    expect(command(dates, "action=set-cell row=1 value=2025-02-29").kind).toBe("error");
    expect(updated(dates, "action=set-cell row=1 value=2024-02-29").rows[0]?.value).toBe(
      "2024-02-29",
    );
  });

  it("normalizes offset datetimes and sorts chronologically in either direction", () => {
    const dataset = datasetWith([
      "2026-11-04T00:10:00-03:00",
      "2026-11-04T08:30+09:00",
      "2026-11-03T15:30:00.000Z",
      "2026-11-04T12:30",
      "2026-02-30T10:00Z",
      "",
    ]);
    const converted = updated(dataset, "action=convert-column type=datetime invalid=missing");
    expect(converted.rows.map(({ value }) => value)).toEqual([
      "2026-11-04T03:10:00.000Z",
      "2026-11-03T23:30:00.000Z",
      "2026-11-03T15:30:00.000Z",
      "",
      "",
      "",
    ]);
    expect(updated(converted, "action=sort-dates").rows.map(({ row }) => row)).toEqual([
      2, 1, 0, 3, 4, 5,
    ]);
    expect(updated(converted, "action=sort-dates order=desc").rows.map(({ row }) => row)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
  });

  it("normalizes and sorts clock times without a date or offset", () => {
    const dataset = datasetWith([
      "14:30:45.25",
      "9:30",
      "09:30:00.004",
      "00:00",
      "23:59:59.999",
      "24:00",
      "08:60",
      "09:30:60",
      "09:30Z",
      "09:30+09:00",
      "",
    ]);
    expect(command(dataset, "action=convert-column type=time").kind).toBe("error");
    const converted = updated(dataset, "action=convert-column type=time invalid=missing");
    expect(converted.columns[0]?.dataType).toBe("time");
    expect(converted.rows.map(({ value }) => value)).toEqual([
      "14:30:45.250",
      "09:30:00",
      "09:30:00.004",
      "00:00:00",
      "23:59:59.999",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
    expect(
      updated(converted, "action=sort-dates")
        .rows.slice(0, 5)
        .map(({ row }) => row),
    ).toEqual([3, 1, 2, 0, 4]);
    expect(updated(converted, "action=set-cell row=1 value=6:00").rows[0]?.value).toBe("06:00:00");
  });

  it("rejects invalid command options", () => {
    const dataset = datasetWith(["1"]);
    expect(command(dataset, "action=convert-column type=mixed").kind).toBe("error");
    expect(command(dataset, "action=convert-column type=date format=guess").kind).toBe("error");
    expect(command(dataset, "action=convert-column type=datetime format=dmy").kind).toBe("error");
    expect(command(dataset, "action=convert-column type=number invalid=ignore").kind).toBe("error");
    expect(command(dataset, "action=sort-dates").kind).toBe("error");
    expect(
      executeScispaceCommand(
        "table-edit sample-id action=convert-column column=absent type=number",
        { datasets: [dataset] },
      ).kind,
    ).toBe("error");
    const dates = updated(datasetWith(["2026-01-01"]), "action=convert-column type=date");
    expect(command(dates, "action=sort-dates order=no").kind).toBe("error");
  });
});
