import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

test.each([
  { args: ["search", "news", "AI", "--display", "0"], exitCode: 2 },
  { args: ["search", "news", "AI", "--start", "1001"], exitCode: 2 },
  { args: ["search", "news", "AI", "--display", "2.5"], exitCode: 2 },
  { args: ["search", "unknown", "AI"], exitCode: 2 },
  { args: ["search", "news", "  "], exitCode: 2 },
  { args: ["search", "news", "AI", "--format", "xml"], exitCode: 1 },
  { args: ["search", "news", "AI", "--unknown"], exitCode: 1 },
])("invalid CLI input fails before a network request: $args", async ({ args, exitCode }) => {
  const child = Bun.spawn([process.execPath, cli, ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(code).toBe(exitCode);
  expect(stdout).toBe("");
  expect(stderr).toContain("error");
});

test("help is available without credentials", async () => {
  const child = Bun.spawn([process.execPath, cli, "search", "--help"], {
    env: { ...process.env, NAVER_CLIENT_ID: "", NAVER_CLIENT_SECRET: "" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(code).toBe(0);
  expect(stdout).toContain("--format");
  expect(stderr).toBe("");
});
