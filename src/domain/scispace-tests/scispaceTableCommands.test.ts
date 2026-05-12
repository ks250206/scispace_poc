import { describe, expect, it } from "vitest";
import { dataset, executeScispaceCommand, runCommand } from "./scispaceCommandTestUtils";

describe("scispace table commands", () => {
  it("opens a table for a dataset", () => {
    const result = runCommand("table waveform.csv");
    expect(result).toMatchObject({ kind: "open-table", datasetId: "seed-waveform" });
  });

  it("deletes table rows and columns through table-edit commands", () => {
    const deletedRow = runCommand("table-edit waveform.csv action=delete-row index=1");
    expect(deletedRow.kind).toBe("dataset-updated");
    if (deletedRow.kind === "dataset-updated") {
      expect(deletedRow.dataset.rows).toHaveLength(dataset.rows.length - 1);
      expect(deletedRow.dataset.rows[0]?.index).toBe(1);
      expect(deletedRow.output).toBe("Deleted row 1 from waveform.csv");
    }

    const deletedColumn = runCommand("table-edit waveform.csv action=delete-column column=signal");
    expect(deletedColumn.kind).toBe("dataset-updated");
    if (deletedColumn.kind === "dataset-updated") {
      expect(deletedColumn.dataset.columns.map((column) => column.id)).toEqual([
        "index",
        "time",
        "background",
      ]);
      expect(deletedColumn.dataset.rows[0]).not.toHaveProperty("signal");
      expect(deletedColumn.output).toBe("Deleted column signal from waveform.csv");
    }
  });

  it("updates table cells through table-edit commands", () => {
    const updated = runCommand(
      "table-edit waveform.csv action=set-cell row=1 column=signal value=123.45",
    );

    expect(updated.kind).toBe("dataset-updated");
    if (updated.kind === "dataset-updated") {
      expect(updated.dataset.rows[0]?.signal).toBe(123.45);
      expect(updated.output).toBe("Updated cell row 1 column signal in waveform.csv");
    }
  });

  it("inserts table columns through table-edit commands", () => {
    const inserted = runCommand(
      "table-edit waveform.csv action=insert-column column=derived before=signal",
    );

    expect(inserted.kind).toBe("dataset-updated");
    if (inserted.kind === "dataset-updated") {
      expect(inserted.dataset.columns.map((column) => column.id)).toEqual([
        "index",
        "time",
        "derived",
        "signal",
        "background",
      ]);
      expect(inserted.dataset.rows[0]).toMatchObject({ derived: "" });
      expect(inserted.output).toBe("Inserted column derived into waveform.csv");
    }

    const appended = runCommand("table-edit waveform.csv action=insert-column column=tail");
    expect(appended.kind).toBe("dataset-updated");
    if (appended.kind === "dataset-updated") {
      expect(appended.dataset.columns.at(-1)).toMatchObject({ id: "tail", name: "tail" });
      expect(appended.dataset.rows[0]).toMatchObject({ tail: "" });
    }
  });

  it("clears and fills table ranges through table-range commands", () => {
    const cleared = runCommand("table-range waveform.csv action=clear r1=1 c1=time r2=2 c2=signal");

    expect(cleared.kind).toBe("dataset-updated");
    if (cleared.kind === "dataset-updated") {
      expect(cleared.dataset.rows[0]).toMatchObject({ time: "", signal: "", background: 7 });
      expect(cleared.dataset.rows[1]).toMatchObject({
        time: "",
        signal: "",
        background: dataset.rows[1]?.background,
      });
      expect(cleared.output).toBe("Cleared range rows 1-2 columns time-signal in waveform.csv");
    }

    const filled = runCommand(
      "table-range waveform.csv action=fill-down r1=1 c1=signal r2=3 c2=background",
    );

    expect(filled.kind).toBe("dataset-updated");
    if (filled.kind === "dataset-updated") {
      expect(filled.dataset.rows[0]?.signal).toBe(dataset.rows[0]?.signal);
      expect(filled.dataset.rows[1]?.signal).toBe(dataset.rows[0]?.signal);
      expect(filled.dataset.rows[2]?.signal).toBe(dataset.rows[0]?.signal);
      expect(filled.dataset.rows[1]?.background).toBe(dataset.rows[0]?.background);
      expect(filled.dataset.rows[2]?.background).toBe(dataset.rows[0]?.background);
      expect(filled.output).toBe(
        "Filled down range rows 1-3 columns signal-background in waveform.csv",
      );
    }
  });

  it("reports malformed table-range commands", () => {
    expect(
      runCommand("table-range missing.csv action=clear r1=1 c1=time r2=2 c2=signal").kind,
    ).toBe("error");
    expect(
      runCommand("table-range waveform.csv action=clear r1=0 c1=time r2=2 c2=signal").kind,
    ).toBe("error");
    expect(
      runCommand("table-range waveform.csv action=clear r1=1 c1=missing r2=2 c2=signal").kind,
    ).toBe("error");
    expect(
      runCommand("table-range waveform.csv action=fill-down r1=1 c1=time r2=1 c2=signal").kind,
    ).toBe("error");
    expect(
      runCommand("table-range waveform.csv action=unknown r1=1 c1=time r2=2 c2=signal").kind,
    ).toBe("error");
  });

  it("reports malformed table-edit commands", () => {
    const singleColumnDataset = { ...dataset, columns: [dataset.columns[0]], rows: [{ index: 0 }] };
    expect(runCommand("table-edit missing.csv action=delete-row index=1").kind).toBe("error");
    expect(runCommand("table-edit waveform.csv action=delete-row index=0").kind).toBe("error");
    expect(runCommand("table-edit waveform.csv action=delete-row index=999").kind).toBe("error");
    expect(runCommand("table-edit waveform.csv action=delete-column column=missing").kind).toBe(
      "error",
    );
    expect(
      executeScispaceCommand("table-edit waveform.csv action=delete-column column=index", {
        datasets: [singleColumnDataset],
      }).kind,
    ).toBe("error");
    expect(runCommand("table-edit waveform.csv action=insert-column column=").kind).toBe("error");
    expect(runCommand("table-edit waveform.csv action=insert-column column=signal").kind).toBe(
      "error",
    );
    expect(
      runCommand("table-edit waveform.csv action=insert-column column=derived before=missing").kind,
    ).toBe("error");
  });
});
