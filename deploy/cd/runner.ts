import { spawn } from "node:child_process";

export interface RunOptions {
  cwd?: string;
  env?: Record<string, string>;
  onLine?: (line: string) => void;
}

export interface RunResult {
  code: number;
  output: string;
}

export interface Runner {
  run(cmd: string, args: string[], opts?: RunOptions): Promise<RunResult>;
}

interface LineSplitter {
  push(text: string): void;
  flush(): void;
}

/** The only place the deploy code shells out. Tests inject a fake Runner. */
export function createRunner(): Runner {
  return {
    run(cmd, args, opts = {}) {
      return new Promise<RunResult>((resolve, reject) => {
        const child = spawn(cmd, args, {
          cwd: opts.cwd,
          env: { ...process.env, ...opts.env },
          shell: false,
        });
        let output = "";

        // Each stream needs its own partial line: a stdout fragment followed by
        // a stderr line must not be glued into one fabricated line.
        const splitter = (): LineSplitter => {
          let pending = "";
          const emit = (line: string) => opts.onLine?.(line.endsWith("\r") ? line.slice(0, -1) : line);
          return {
            push(text) {
              pending += text;
              const lines = pending.split("\n");
              pending = lines.pop() ?? "";
              for (const line of lines) emit(line);
            },
            flush() {
              if (pending) emit(pending);
              pending = "";
            },
          };
        };
        const out = splitter();
        const err = splitter();

        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (text: string) => {
          output += text;
          out.push(text);
        });
        child.stderr.on("data", (text: string) => {
          output += text;
          err.push(text);
        });
        child.on("error", reject);
        child.on("close", (code) => {
          out.flush();
          err.flush();
          resolve({ code: code ?? -1, output });
        });
      });
    },
  };
}
