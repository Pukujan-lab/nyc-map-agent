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
});
