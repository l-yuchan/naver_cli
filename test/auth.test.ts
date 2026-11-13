import { expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const credentialsModule = new URL("../src/credentials.ts", import.meta.url).href;

async function run(
  args: readonly string[],
  options: { readonly directory: string; readonly input?: string },
) {
  const child = Bun.spawn([process.execPath, "--no-env-file", ...args], {
    cwd: options.directory,
    env: {
      ...process.env,
      NAVER_CONFIG_DIR: options.directory,
      NAVER_CLIENT_ID: "environment-id",
      NAVER_CLIENT_SECRET: "environment-secret",
    },
    stdin: new TextEncoder().encode(options.input ?? ""),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, code };
}

test("auth persists credentials across CLI processes and saved credentials take precedence", async () => {
  const directory = await mkdtemp(join(tmpdir(), "naver-auth-test-"));
  const pair = { clientId: "stored-id", clientSecret: "stored-secret" };
  try {
    const saved = await run([cli, "auth", "--stdin"], { directory, input: JSON.stringify(pair) });
    expect(saved.code).toBe(0);
    expect(JSON.parse(saved.stdout).saved).toBe(true);
    expect(saved.stdout + saved.stderr).not.toContain(pair.clientSecret);
    const loaded = await run(
      [
        "-e",
        `import {loadCredentials} from ${JSON.stringify(credentialsModule)}; console.log(JSON.stringify(await loadCredentials(".env")));`,
      ],
      { directory },
    );
    expect(loaded.code).toBe(0);
    expect(JSON.parse(loaded.stdout)).toEqual(pair);
    if (process.platform !== "win32") {
      expect((await stat(join(directory, "credentials.json"))).mode & 0o777).toBe(0o600);
    }
    expect(await readdir(directory)).toEqual(["credentials.json"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test.each([
  "invalid json",
  '{"clientId":"","clientSecret":"secret"}',
  '{"clientId":"id","clientSecret":"  "}',
  '{"clientId":123,"clientSecret":"secret"}',
  '{"clientId":"id\\r\\ninjected-header","clientSecret":"secret"}',
])("invalid auth input preserves previous credentials: %s", async (input) => {
  const directory = await mkdtemp(join(tmpdir(), "naver-auth-test-"));
  const original = '{"clientId":"previous-id","clientSecret":"previous-secret"}\n';
  try {
    await writeFile(join(directory, "credentials.json"), original);
    const result = await run([cli, "auth", "--stdin"], { directory, input });
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toContain("previous-secret");
    expect(await readFile(join(directory, "credentials.json"), "utf8")).toBe(original);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("auth can replace corrupt storage without reading or exposing its old contents", async () => {
  const directory = await mkdtemp(join(tmpdir(), "naver-auth-test-"));
  try {
    await writeFile(join(directory, "credentials.json"), "corrupt");
    const result = await run([cli, "auth", "--stdin"], {
      directory,
      input: '{"clientId":"new-id","clientSecret":"new-secret"}',
    });
    expect(result.code).toBe(0);
    expect(JSON.parse(await readFile(join(directory, "credentials.json"), "utf8"))).toEqual({
      clientId: "new-id",
      clientSecret: "new-secret",
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("search rejects corrupt saved credentials instead of silently using unrelated environment credentials", async () => {
  const directory = await mkdtemp(join(tmpdir(), "naver-auth-test-"));
  try {
    await writeFile(join(directory, "credentials.json"), '{"clientSecret":"do-not-print"}');
    const result = await run([cli, "search", "news", "test"], { directory });
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Saved credentials are invalid");
    expect(result.stderr).not.toContain("do-not-print");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("noninteractive auth requires explicit stdin mode instead of hanging", async () => {
  const directory = await mkdtemp(join(tmpdir(), "naver-auth-test-"));
  try {
    const result = await run([cli, "auth"], { directory });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("--stdin");
    expect(await readdir(directory)).toEqual([]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test.each([true, false])(
  "without stored auth, environment and dotenv fallback remain supported (environment: %s)",
  async (useEnvironment) => {
    const directory = await mkdtemp(join(tmpdir(), "naver-auth-test-"));
    try {
      await writeFile(
        join(directory, ".env"),
        "X-NCP-APIGW-API-KEY-ID=file-id\nX-NCP-APIGW-API-KEY=file-secret\n",
      );
      const clearEnvironment = useEnvironment
        ? ""
        : `
      for (const key of ["NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET", "X-Naver-Client-Id", "X-Naver-Client-Secret", "X-NCP-APIGW-API-KEY-ID", "X-NCP-APIGW-API-KEY"]) delete process.env[key];`;
      const result = await run(
        [
          "-e",
          `
      import {loadCredentials} from ${JSON.stringify(credentialsModule)};
      ${clearEnvironment}
      console.log(JSON.stringify(await loadCredentials(".env")));
    `,
        ],
        { directory },
      );
      expect(result.code).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        useEnvironment
          ? { clientId: "environment-id", clientSecret: "environment-secret" }
          : { clientId: "file-id", clientSecret: "file-secret" },
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
