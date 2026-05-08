import type { Dataset, ScispaceCommandResult, VirtualFile } from "../types";
import { isSafeFileName, isVirtualRawPath, readOption, type CommandContext } from "./commandUtils";

const formatVirtualFileList = (
  path: string,
  files: VirtualFile[] | undefined,
  datasets: Dataset[],
): string => {
  const listedFiles = (files ?? [])
    .filter((file) => file.path === path || file.path.startsWith(`${path}/`))
    .sort((left, right) => left.path.localeCompare(right.path));
  if (listedFiles.length === 0) return `No files under ${path}`;
  return listedFiles
    .map((file) => {
      if (file.kind === "directory") return `[dir] ${file.path}`;
      const dataset = datasets.find((item) => item.id === file.datasetId);
      if (dataset) {
        return `[dataset] ${file.path} -> ${dataset.name} (${dataset.rows.length} rows, ${dataset.columns.length} cols)`;
      }
      return `[raw] ${file.path}${file.parseError ? ` (${file.parseError})` : ""}`;
    })
    .join("\n");
};

export const executeVirtualFileCommand = (
  command: string,
  args: string[],
  context: CommandContext,
): ScispaceCommandResult | undefined => {
  if (command === "file-mkdir") {
    const path = args[0];
    if (!isVirtualRawPath(path)) return { kind: "error", output: "Usage: file-mkdir ~/raw/<path>" };
    return { kind: "file-command", action: "mkdir", path, output: `Directory created: ${path}` };
  }

  if (command === "file-rename") {
    const path = args[0];
    const name = readOption(args, "name");
    if (!isVirtualRawPath(path) || !isSafeFileName(name)) {
      return { kind: "error", output: "Usage: file-rename ~/raw/<path> name=<newName>" };
    }
    return { kind: "file-command", action: "rename", path, name, output: `Renamed: ${path}` };
  }

  if (command === "file-move") {
    const path = args[0];
    const targetDirectory = readOption(args, "to");
    if (!isVirtualRawPath(path) || !isVirtualRawPath(targetDirectory)) {
      return { kind: "error", output: "Usage: file-move ~/raw/<path> to=~/raw/<directory>" };
    }
    return {
      kind: "file-command",
      action: "move",
      path,
      targetDirectory,
      output: `Moved: ${path}`,
    };
  }

  if (command === "file-delete") {
    const path = args[0];
    if (!isVirtualRawPath(path))
      return { kind: "error", output: "Usage: file-delete ~/raw/<path>" };
    return { kind: "file-command", action: "delete", path, output: `Deleted: ${path}` };
  }

  if (command === "file-list") {
    const path = args[0] ?? "~/raw";
    if (!isVirtualRawPath(path))
      return { kind: "error", output: "Usage: file-list [~/raw/<path>]" };
    return {
      kind: "file-command",
      action: "list",
      path,
      output: formatVirtualFileList(path, context.files, context.datasets),
    };
  }

  return undefined;
};
