import { BashShell } from "@wterm/just-bash";
import { formatVirtualFileList } from "../../domain/scispace/fileCommands";
import type { Dataset, VirtualFile } from "../../domain/types";
import type { TerminalFsCommandResult, TerminalFsState } from "./terminalTypes";

export const toBashPath = (path: string): string => path.replace(/^~\//, "/home/user/");

export const buildInitialFiles = (files: VirtualFile[]): Record<string, string> =>
  Object.fromEntries([
    ["/home/user/README.txt", "SciSpace REPL. Try: help or file-list ~/raw\n"],
    ...files.filter((file) => file.text).map((file) => [toBashPath(file.path), file.text ?? ""]),
  ]);

const normalizeShellPath = (path: string): string => {
  if (path === "~") return "/home/user";
  if (path.startsWith("~/")) return toBashPath(path);
  return path.replace(/\/+$/, "") || "/";
};

const joinShellPath = (cwd: string, path?: string): string => {
  if (!path || path === ".") return cwd;
  if (path === "..") return cwd === "/home/user" ? cwd : cwd.slice(0, cwd.lastIndexOf("/"));
  if (path.startsWith("/") || path.startsWith("~")) return normalizeShellPath(path);
  return normalizeShellPath(`${cwd}/${path}`);
};

const shellPathToVirtualPath = (shellPath: string): string | undefined => {
  const normalized = normalizeShellPath(shellPath);
  if (normalized === "/home/user") return "~/raw";
  if (normalized === "/home/user/raw") return "~/raw";
  if (normalized.startsWith("/home/user/raw/"))
    return `~/${normalized.slice("/home/user/".length)}`;
  return undefined;
};

export const resolveShellRawPath = (path: string, cwd: string): string => {
  const expanded = normalizeShellPath(path);
  const absolute = expanded.startsWith("/") ? expanded : cwd + "/" + expanded;
  const segments: string[] = [];
  for (const segment of absolute.split("/")) {
    if (segment === "..") segments.pop();
    else if (segment && segment !== ".") segments.push(segment);
  }
  const resolved = "/" + segments.join("/");
  return resolved === "/home/user/raw" || resolved.startsWith("/home/user/raw/")
    ? "~/" + segments.slice(2).join("/")
    : resolved;
};

const shellPathForPrompt = (shellPath: string): string => shellPath.replace("/home/user", "~");

const isKnownDirectory = (path: string, files: VirtualFile[]): boolean => {
  const virtualPath = shellPathToVirtualPath(path);
  if (!virtualPath) return false;
  if (virtualPath === "~/raw") return true;
  return files.some((file) => file.kind === "directory" && file.path === virtualPath);
};

export const executeTerminalFsCommand = (
  commandLine: string,
  state: TerminalFsState,
  files: VirtualFile[],
  datasets: Dataset[],
): TerminalFsCommandResult => {
  const commands = commandLine
    .split("&&")
    .map((command) => command.trim())
    .filter(Boolean);
  let cwd = state.cwd;
  const output: string[] = [];

  for (const commandText of commands) {
    const [command, ...args] = commandText.split(/\s+/);
    if (command === "pwd") {
      output.push(shellPathForPrompt(cwd));
      continue;
    }

    if (command === "cd") {
      const nextPath = joinShellPath(cwd, args[0] ?? "~");
      if (!isKnownDirectory(nextPath, files)) {
        return { cwd, exitCode: 1, output: `cd: no such directory: ${args[0] ?? "~"}` };
      }
      cwd = nextPath;
      continue;
    }

    if (command === "ls") {
      const target = shellPathToVirtualPath(joinShellPath(cwd, args[0]));
      if (!target) return { cwd, exitCode: 1, output: `ls: unsupported path: ${args[0] ?? "."}` };
      output.push(formatVirtualFileList(target, files, datasets));
      continue;
    }

    if (command === "cat") {
      const target = shellPathToVirtualPath(joinShellPath(cwd, args[0]));
      const file = target
        ? files.find((item) => item.kind === "file" && item.path === target)
        : undefined;
      if (!target || !file) {
        return { cwd, exitCode: 1, output: `cat: no such file: ${args[0] ?? ""}` };
      }
      output.push(file.text ?? "");
      continue;
    }

    if (command === "clear") {
      return { clear: true, cwd, exitCode: 0, output: "\x1b[2J\x1b[H" };
    }

    return { cwd, exitCode: 127, output: `${command}: command not found` };
  }

  return { cwd, exitCode: 0, output: output.join("\n") };
};

export const syncBashFiles = async (
  bash: BashShell["bash"] | null | undefined,
  files: VirtualFile[],
): Promise<void> => {
  if (!bash) return;
  await bash.fs.rm("/home/user/raw", { recursive: true, force: true });
  await bash.fs.mkdir("/home/user/raw", { recursive: true });
  await Promise.all(
    files
      .filter((file) => file.kind === "directory")
      .map((file) => bash.fs.mkdir(toBashPath(file.path), { recursive: true })),
  );
  await Promise.all(
    files
      .filter((file) => file.text)
      .map((file) => bash.fs.writeFile(toBashPath(file.path), file.text ?? "")),
  );
};
