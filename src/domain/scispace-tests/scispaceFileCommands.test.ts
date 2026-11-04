import { describe, expect, it } from "vite-plus/test";
import { dataset, executeScispaceCommand, runEmptyCommand } from "./scispaceCommandTestUtils";

describe("scispace file commands", () => {
  it("parses virtual file operation commands", () => {
    expect(runEmptyCommand("file-mkdir ~/raw/analysis")).toMatchObject({
      kind: "file-command",
      action: "mkdir",
      path: "~/raw/analysis",
    });
    expect(runEmptyCommand('file-rename ~/raw/waveform.csv name="renamed file.csv"')).toMatchObject(
      {
        kind: "file-command",
        action: "rename",
        path: "~/raw/waveform.csv",
        name: "renamed file.csv",
      },
    );
    expect(runEmptyCommand("file-move ~/raw/waveform.csv to=~/raw/analysis")).toMatchObject({
      kind: "file-command",
      action: "move",
      path: "~/raw/waveform.csv",
      targetDirectory: "~/raw/analysis",
    });
    expect(runEmptyCommand("file-delete ~/raw/waveform.csv")).toMatchObject({
      kind: "file-command",
      action: "delete",
      path: "~/raw/waveform.csv",
    });
    expect(runEmptyCommand("file-list ~/raw")).toMatchObject({
      kind: "file-command",
      action: "list",
      path: "~/raw",
    });
    expect(runEmptyCommand("file-list")).toMatchObject({
      kind: "file-command",
      action: "list",
      path: "~/raw",
    });
  });

  it("reports malformed virtual file operation commands", () => {
    expect(runEmptyCommand("file-mkdir /tmp").kind).toBe("error");
    expect(runEmptyCommand("file-rename ~/raw/a.csv").kind).toBe("error");
    expect(runEmptyCommand("file-rename ~/raw/a.csv name=../bad.csv").kind).toBe("error");
    expect(runEmptyCommand("file-move ~/raw/a.csv").kind).toBe("error");
    expect(runEmptyCommand("file-move ~/raw/a.csv to=/tmp").kind).toBe("error");
    expect(runEmptyCommand("file-delete").kind).toBe("error");
    expect(runEmptyCommand("file-list /tmp")).toMatchObject({
      kind: "error",
      output: "Usage: file-list [~/raw/<path>]",
    });
  });

  it("prints virtual file lists with parsed and raw statuses", () => {
    const result = executeScispaceCommand("file-list ~/raw", {
      datasets: [dataset],
      files: [
        {
          id: "~/raw/analysis",
          path: "~/raw/analysis",
          name: "analysis",
          kind: "directory",
          createdAt: 1,
        },
        {
          id: "~/raw/waveform.csv",
          path: "~/raw/waveform.csv",
          name: "waveform.csv",
          kind: "file",
          datasetId: "seed-waveform",
          text: "index,time\n0,0",
          createdAt: 1,
        },
        {
          id: "~/raw/notes.txt",
          path: "~/raw/notes.txt",
          name: "notes.txt",
          kind: "file",
          text: "hello",
          parseError: "Raw file stored without tabular parsing",
          createdAt: 1,
        },
      ],
    });

    expect(result).toMatchObject({ kind: "file-command", action: "list" });
    expect(result.output).toContain("[dir] ~/raw/analysis");
    expect(result.output).toContain(
      "[dataset] ~/raw/waveform.csv -> waveform.csv (160 rows, 4 cols)",
    );
    expect(result.output).toContain("[raw] ~/raw/notes.txt");
  });
});
