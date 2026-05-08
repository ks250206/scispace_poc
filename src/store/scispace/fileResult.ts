import type { ScispaceCommandResult } from "../../domain/types";
import type { ResultApplyContext } from "./resultApplyContext";
import { parentDirectoryOf } from "./virtualFiles";

export const applyFileResult = async (
  current: ScispaceCommandResult,
  context: ResultApplyContext,
): Promise<ScispaceCommandResult> => {
  let result = current;
  const { get } = context;
  if (result.kind === "file-command") {
    const fileCommand = result;
    const target = get().files.find((file) => file.path === fileCommand.path);
    if (fileCommand.action === "mkdir") {
      const directory = await get().createDirectory(
        fileCommand.path.split("/").at(-1) ?? "",
        parentDirectoryOf(fileCommand.path),
      );
      result = directory
        ? { ...fileCommand, output: `Directory created: ${directory.path}` }
        : { kind: "error", output: `Directory not created: ${fileCommand.path}` };
    } else if (fileCommand.action === "rename") {
      if (!target || !fileCommand.name) {
        result = { kind: "error", output: `File not found: ${fileCommand.path}` };
      } else {
        await get().renameVirtualItem(fileCommand.path, fileCommand.name);
        result = { ...fileCommand, output: `Renamed: ${fileCommand.path}` };
      }
    } else if (fileCommand.action === "move") {
      const directory =
        fileCommand.targetDirectory === "~/raw"
          ? undefined
          : get().files.find((file) => file.path === fileCommand.targetDirectory);
      if (!target) {
        result = { kind: "error", output: `File not found: ${fileCommand.path}` };
      } else if (
        fileCommand.targetDirectory !== "~/raw" &&
        (!directory || directory.kind !== "directory")
      ) {
        result = {
          kind: "error",
          output: `Directory not found: ${fileCommand.targetDirectory}`,
        };
      } else {
        await get().moveVirtualItem(fileCommand.path, fileCommand.targetDirectory ?? "~/raw");
        result = { ...fileCommand, output: `Moved: ${fileCommand.path}` };
      }
    } else if (fileCommand.action === "delete") {
      if (!target) {
        result = { kind: "error", output: `File not found: ${fileCommand.path}` };
      } else {
        await get().deleteVirtualItem(fileCommand.path);
        result = { ...fileCommand, output: `Deleted: ${fileCommand.path}` };
      }
    }
  }

  return result;
};
