import type { VirtualFile } from "../../domain/types";

export const makeDirectoryRecord = (path: string): VirtualFile => ({
  id: path,
  path,
  name: path.split("/").at(-1) ?? path,
  kind: "directory",
  createdAt: Date.now(),
});

export const normalizeDirectoryPath = (path: string): string => {
  const trimmed = path.trim().replaceAll("\\", "/").replace(/\/+$/, "");
  if (trimmed === "~" || trimmed === "~/raw") return "~/raw";
  if (trimmed.startsWith("~/raw/")) return trimmed;
  return `~/raw/${trimmed.replace(/^~\//, "").replace(/^raw\//, "")}`;
};

export const safePathName = (name: string, fallback: string): string =>
  name.trim().replaceAll("\\", "/").split("/").filter(Boolean).at(-1) ?? fallback;

export const parentDirectoryOf = (path: string): string => {
  const slashIndex = path.lastIndexOf("/");
  return slashIndex > "~/raw".length ? path.slice(0, slashIndex) : "~/raw";
};

export const joinVirtualPath = (directory: string, name: string): string =>
  `${normalizeDirectoryPath(directory)}/${safePathName(name, "untitled")}`;

export const uniquifyPath = (path: string, files: VirtualFile[]): string => {
  const existing = new Set(files.map((file) => file.path));
  if (!existing.has(path)) return path;

  const slashIndex = path.lastIndexOf("/");
  const directory = slashIndex >= 0 ? path.slice(0, slashIndex + 1) : "";
  const fileName = slashIndex >= 0 ? path.slice(slashIndex + 1) : path;
  const dotIndex = fileName.lastIndexOf(".");
  const stem = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  const extension = dotIndex > 0 ? fileName.slice(dotIndex) : "";

  for (let index = 1; ; index += 1) {
    const candidate = `${directory}${stem} (${index})${extension}`;
    if (!existing.has(candidate)) return candidate;
  }
};

export const descendantPaths = (path: string, files: VirtualFile[]): Set<string> => {
  const prefix = `${path}/`;
  return new Set(
    files
      .filter((file) => file.path === path || file.path.startsWith(prefix))
      .map((file) => file.path),
  );
};

export const rewriteAffectedVirtualPaths = (
  files: VirtualFile[],
  path: string,
  basePath: string,
): {
  affectedPaths: Set<string>;
  rewrittenFiles: VirtualFile[];
  rewrittenAffectedFiles: VirtualFile[];
} => {
  const affectedPaths = descendantPaths(path, files);
  const rewrittenAffectedEntries = files
    .filter((file) => affectedPaths.has(file.path))
    .map((file) => {
      const nextPath = file.path === path ? basePath : `${basePath}${file.path.slice(path.length)}`;
      return [
        file.path,
        {
          ...file,
          id: nextPath,
          path: nextPath,
          name: nextPath.split("/").at(-1) ?? nextPath,
        },
      ] as const;
    });
  const rewrittenByOldPath = new Map(rewrittenAffectedEntries);
  return {
    affectedPaths,
    rewrittenFiles: files.map((file) =>
      affectedPaths.has(file.path) ? (rewrittenByOldPath.get(file.path) ?? file) : file,
    ),
    rewrittenAffectedFiles: rewrittenAffectedEntries.map(([, file]) => file),
  };
};
