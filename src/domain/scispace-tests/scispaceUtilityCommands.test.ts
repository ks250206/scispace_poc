import { describe, expect, it } from "vitest";
import { dataset, runCommand, runEmptyCommand } from "./scispaceCommandTestUtils";

describe("scispace utility commands", () => {
  it("lists loaded datasets", () => {
    const result = runCommand("lsdata");
    expect(result.output).toContain("waveform.csv");
    expect(result.output).toContain("columns: index, time, signal, background");
  });

  it("prints help and empty dataset states", () => {
    const help = runEmptyCommand("help").output;
    expect(help).toContain("scispace repl commands");
    expect(help).toContain("scispace commands");
    expect(help).toContain("unsafe on|off");
    expect(help).toContain("shell");
    expect(help).toContain("dataset-new <name> columns=<col[,col...]> rows=<n>");
    expect(help).toContain("dataset-calc <dataset> column=<newOrExistingCol> expr=<expression>");
    expect(help).toContain("file-list [path]");
    expect(help).toContain("file-rename <path> name=<newName>");
    expect(runEmptyCommand("lsdata").output).toBe("No datasets loaded");
  });

  it("creates derived datasets through elt", () => {
    const result = runCommand("elt waveform.csv as filtered.csv");
    expect(result.kind).toBe("dataset-created");
    if (result.kind === "dataset-created") {
      expect(result.dataset.name).toBe("filtered.csv");
      expect(result.dataset.rows).toHaveLength(dataset.rows.length);
    }
  });

  it("reports invalid commands as errors", () => {
    const result = runCommand("plot waveform.csv x=missing y=signal");
    expect(result.kind).toBe("error");
  });

  it("reports missing datasets and malformed commands", () => {
    expect(runCommand("table missing.csv").kind).toBe("error");
    expect(runCommand("plot missing.csv").kind).toBe("error");
    expect(runCommand("elt missing.csv as copy.csv").kind).toBe("error");
    expect(runCommand("elt waveform.csv").output).toContain("Usage");
    expect(runCommand("unknown").output).toContain("Unknown");
  });
});
