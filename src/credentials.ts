import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { parse } from "dotenv";
import { z } from "zod";
import type { Credentials } from "./search";

const credentialValue = z
  .string()
  .trim()
  .min(1)
  .regex(/^[^\r\n]+$/);
export const credentialsSchema = z.object({
  clientId: credentialValue,
  clientSecret: credentialValue,
});

export class CredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialError";
  }
}

export function credentialsPath(): string {
  const base =
    process.env["NAVER_CONFIG_DIR"] ??
    join(
      process.env["APPDATA"] ?? process.env["XDG_CONFIG_HOME"] ?? join(homedir(), ".config"),
      "naver-cli",
    );
  return join(base, "credentials.json");
}

async function optionalFile(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw new CredentialError("Cannot read credential configuration. Check file access.");
  }
}

export async function saveCredentials(credentials: Credentials): Promise<void> {
  const parsed = credentialsSchema.safeParse(credentials);
  if (!parsed.success)
    throw new CredentialError("Client ID and secret must be nonblank single-line strings.");
  const file = credentialsPath();
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await mkdir(dirname(file), { recursive: true, mode: 0o700 });
    await writeFile(temporary, JSON.stringify(parsed.data) + "\n", { mode: 0o600, flag: "wx" });
    await rename(temporary, file);
  } catch (error) {
    if (error instanceof Error)
      throw new CredentialError("Cannot save credentials. Check configuration directory access.");
    throw error;
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function loadCredentials(envFile: string): Promise<Credentials> {
  const stored = await optionalFile(credentialsPath());
  if (stored !== undefined) {
    try {
      return credentialsSchema.parse(JSON.parse(stored));
    } catch (error) {
      if (error instanceof Error)
        throw new CredentialError(
          "Saved credentials are invalid. Run 'naver auth' to replace them.",
        );
      throw error;
    }
  }
  const content = await optionalFile(envFile);
  if (content === undefined && envFile !== ".env") {
    throw new CredentialError(`Cannot load env file: ${envFile}`);
  }
  const environment = { ...parse(content ?? ""), ...process.env };
  const credentials = credentialsSchema.safeParse({
    clientId:
      environment["NAVER_CLIENT_ID"] ??
      environment["X-Naver-Client-Id"] ??
      environment["X-NCP-APIGW-API-KEY-ID"],
    clientSecret:
      environment["NAVER_CLIENT_SECRET"] ??
      environment["X-Naver-Client-Secret"] ??
      environment["X-NCP-APIGW-API-KEY"],
  });
  if (!credentials.success) {
    throw new CredentialError("Run 'naver auth' or set NAVER_CLIENT_ID and NAVER_CLIENT_SECRET.");
  }
  return credentials.data;
}
