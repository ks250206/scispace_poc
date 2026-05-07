import { describe, expect, it } from "vitest";
import { createSeedDataset } from "./csv";
import { executeScispaceCommand } from "./scispace";

describe("scispace pseudo command interpreter", () => {
  const dataset = createSeedDataset();

  it("lists loaded datasets", () => {
    const result = executeScispaceCommand("lsdata", { datasets: [dataset] });
    expect(result.output).toContain("waveform.csv");
  });

  it("prints help and empty dataset states", () => {
    expect(executeScispaceCommand("help", { datasets: [] }).output).toContain("scispace commands");
    expect(executeScispaceCommand("lsdata", { datasets: [] }).output).toBe("No datasets loaded");
  });

  it("opens a table for a dataset", () => {
    const result = executeScispaceCommand("table waveform.csv", { datasets: [dataset] });
    expect(result).toMatchObject({ kind: "open-table", datasetId: "seed-waveform" });
  });

  it("creates plot specs from column options", () => {
    const result = executeScispaceCommand("plot waveform.csv x=time y=signal", {
      datasets: [dataset],
    });
    expect(result.kind).toBe("plot");
    if (result.kind === "plot") {
      expect(result.spec).toMatchObject({
        source: "seed-waveform",
        x: "time",
        y: "signal",
        type: "line",
      });
    }
  });

  it("creates derived datasets through elt", () => {
    const result = executeScispaceCommand("elt waveform.csv as filtered.csv", {
      datasets: [dataset],
    });
    expect(result.kind).toBe("dataset-created");
    if (result.kind === "dataset-created") {
      expect(result.dataset.name).toBe("filtered.csv");
      expect(result.dataset.rows).toHaveLength(dataset.rows.length);
    }
  });

  it("reports invalid commands as errors", () => {
    const result = executeScispaceCommand("plot waveform.csv x=missing y=signal", {
      datasets: [dataset],
    });
    expect(result.kind).toBe("error");
  });

  it("reports missing datasets and malformed commands", () => {
    expect(executeScispaceCommand("table missing.csv", { datasets: [dataset] }).kind).toBe("error");
    expect(executeScispaceCommand("plot missing.csv", { datasets: [dataset] }).kind).toBe("error");
    expect(
      executeScispaceCommand("elt missing.csv as copy.csv", { datasets: [dataset] }).kind,
    ).toBe("error");
    expect(executeScispaceCommand("elt waveform.csv", { datasets: [dataset] }).output).toContain(
      "Usage",
    );
    expect(executeScispaceCommand("unknown", { datasets: [dataset] }).output).toContain("Unknown");
  });
});
