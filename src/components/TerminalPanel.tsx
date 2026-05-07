import { useCallback, useEffect, useMemo, useRef } from "react";
import { Terminal, useTerminal } from "@wterm/react";
import "@wterm/react/css";
import { BashShell } from "@wterm/just-bash";
import { defineCommand } from "just-bash";
import { useScispaceStore } from "../store/scispaceStore";

const toBashPath = (path: string): string => path.replace(/^~\//, "/home/user/");

export function TerminalPanel() {
  const { ref, write } = useTerminal();
  const shellRef = useRef<BashShell | null>(null);
  const files = useScispaceStore((state) => state.files);
  const runScispace = useScispaceStore((state) => state.runScispace);

  const initialFiles = useMemo(
    () =>
      Object.fromEntries([
        ["/home/user/README.txt", "SciSpace terminal. Try: scispace lsdata\n"],
        ...files
          .filter((file) => file.text)
          .map((file) => [toBashPath(file.path), file.text ?? ""]),
      ]),
    [files],
  );

  const handleReady = useCallback(async () => {
    if (shellRef.current) return;
    const shell = new BashShell({
      files: initialFiles,
      cwd: "/home/user",
      greeting: ["SciSpace shell", "Run `scispace help` or inspect ~/raw with `ls raw`."],
      prompt: (cwd) => `scispace:${cwd.replace("/home/user", "~")}$ `,
    });
    shellRef.current = shell;
    await shell.attach((data) => write(data));
    shell.bash?.registerCommand(
      defineCommand("scispace", async (args) => {
        const result = await runScispace(args.join(" "));
        return {
          stdout: `${result.output}\n`,
          stderr: result.kind === "error" ? `${result.output}\n` : "",
          exitCode: result.kind === "error" ? 1 : 0,
        };
      }),
    );
  }, [initialFiles, runScispace, write]);

  const handleData = useCallback((data: string) => {
    void shellRef.current?.handleInput(data);
  }, []);

  useEffect(() => {
    const shell = shellRef.current;
    const bash = shell?.bash;
    if (!bash) return;
    void (async () => {
      await bash.fs.mkdir("/home/user/raw", { recursive: true });
      await Promise.all(
        files
          .filter((file) => file.text)
          .map((file) => bash.fs.writeFile(toBashPath(file.path), file.text ?? "")),
      );
    })();
  }, [files]);

  return (
    <section className="terminal-panel">
      <header className="terminal-header">
        <span>scispace shell</span>
        <span>wterm + just-bash</span>
      </header>
      <Terminal
        ref={ref}
        className="terminal-host"
        theme="light"
        onReady={() => void handleReady()}
        onData={handleData}
      />
    </section>
  );
}
