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
        let pending = "";
        const onData = (chunk: Buffer) => {
          const text = chunk.toString();
          output += text;
          pending += text;
          const lines = pending.split("\n");
          pending = lines.pop() ?? "";
          for (const line of lines) opts.onLine?.(line);
        };
        child.stdout.on("data", onData);
        child.stderr.on("data", onData);
        child.on("error", reject);
        child.on("close", (code) => {
          if (pending) opts.onLine?.(pending);
          resolve({ code: code ?? -1, output });
        });
      });
    },
  };
}
