import { describe, expect, it } from "vitest";
import { createRunner } from "./runner";

const node = process.execPath;

describe("process runner", () => {
  it("captures output and exit code", async () => {
    const result = await createRunner().run(node, ["-e", "process.stdout.write('hello')"]);
    expect(result.code).toBe(0);
    expect(result.output).toBe("hello");
  });

  it("reports a non-zero exit without throwing", async () => {
    const result = await createRunner().run(node, ["-e", "process.exit(3)"]);
    expect(result.code).toBe(3);
  });

  it("streams lines to onLine", async () => {
    const lines: string[] = [];
    await createRunner().run(node, ["-e", "console.log('a'); console.log('b')"], {
      onLine: (line) => lines.push(line),
    });
    expect(lines).toEqual(["a", "b"]);
  });

  it("passes cwd and env", async () => {
    const result = await createRunner().run(node, ["-e", "process.stdout.write(process.cwd() + '|' + process.env.CD_TEST)"], {
      cwd: process.cwd(),
      env: { CD_TEST: "yes" },
    });
    expect(result.output).toBe(`${process.cwd()}|yes`);
  });

  it("streams stderr lines without merging them into stdout", async () => {
    const lines: string[] = [];
    await createRunner().run(
      process.execPath,
      ["-e", "process.stdout.write('out-no-newline'); process.stderr.write('err\\n')"],
      { onLine: (line) => lines.push(line) },
    );
    expect(lines).toContain("err");
    expect(lines.some((line) => line.includes("out-no-newlineerr"))).toBe(false);
  });

  it("flushes a trailing partial line when the process exits", async () => {
    const lines: string[] = [];
    await createRunner().run(process.execPath, ["-e", "process.stdout.write('tail')"], {
      onLine: (line) => lines.push(line),
    });
    expect(lines).toEqual(["tail"]);
  });

  it("rejects when the command cannot be spawned", async () => {
    await expect(createRunner().run("definitely-not-a-real-binary-xyz", [])).rejects.toThrow();
  });

  it("passes arguments through without a shell", async () => {
    const result = await createRunner().run(process.execPath, [
      "-e",
      "process.stdout.write(process.argv[1] ?? '')",
      "a && b",
    ]);
    expect(result.output).toBe("a && b");
  });
});
