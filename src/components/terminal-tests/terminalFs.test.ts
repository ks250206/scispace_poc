import { describe, expect, it } from "vitest";
import { executeTerminalFsCommand } from "../TerminalPanel";

describe("terminal virtual fs", () => {
  it("supports cwd-based virtual fs navigation and file-list style output", () => {
    const result = executeTerminalFsCommand(
      "cd ~/raw && ls",
      { cwd: "/home/user" },
      [
        {
          id: "raw-dir",
          path: "~/raw",
          name: "raw",
          kind: "directory",
          createdAt: 1,
        },
        {
          id: "waveform-file",
          path: "~/raw/waveform.csv",
          name: "waveform.csv",
          kind: "file",
          datasetId: "waveform",
          text: "time,signal\n0,1",
          createdAt: 1,
        },
      ],
      [
        {
          id: "waveform",
          name: "waveform.csv",
          sourcePath: "~/raw/waveform.csv",
          columns: [
            { id: "time", name: "time", dataType: "number" },
            { id: "signal", name: "signal", dataType: "number" },
          ],
          rows: [{ time: 0, signal: 1 }],
          createdBy: "upload",
          createdAt: 1,
        },
      ],
    );

    expect(result).toMatchObject({ cwd: "/home/user/raw", exitCode: 0 });
    expect(result.output).toContain("[dataset] ~/raw/waveform.csv");
  });

  it("reads raw file contents relative to the terminal cwd", () => {
    const result = executeTerminalFsCommand(
      "cat waveform.csv",
      { cwd: "/home/user/raw" },
      [
        {
          id: "waveform-file",
          path: "~/raw/waveform.csv",
          name: "waveform.csv",
          kind: "file",
          text: "time,signal\n0,1",
          createdAt: 1,
        },
      ],
      [],
    );

    expect(result).toMatchObject({ exitCode: 0, output: "time,signal\n0,1" });
  });
});
