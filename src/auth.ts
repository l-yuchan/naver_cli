import { isCancel, password, text } from "@clack/prompts";
import { readFileSync } from "node:fs";
import {
  credentialsPath,
  credentialsSchema,
  CredentialError,
  saveCredentials,
} from "./credentials";

export async function authenticate(fromStdin: boolean): Promise<void> {
  if (fromStdin) {
    let input: unknown;
    try {
      input = JSON.parse(readFileSync(0, "utf8"));
    } catch (error) {
      if (error instanceof Error)
        throw new CredentialError("Expected JSON on stdin with clientId and clientSecret.");
      throw error;
    }
    const parsed = credentialsSchema.safeParse(input);
    if (!parsed.success)
      throw new CredentialError("Expected nonblank clientId and clientSecret strings on stdin.");
    await saveCredentials(parsed.data);
  } else {
    if (!process.stdin.isTTY)
      throw new CredentialError(
        "Interactive auth requires a terminal. For agents, use 'naver auth --stdin'.",
      );
    const clientId = await text({
      message: "Client ID",
      output: process.stderr,
      validate: (value) => (value?.trim() ? undefined : "Client ID is required."),
    });
    if (isCancel(clientId)) {
      process.stderr.write("Authentication setup cancelled.\n");
      process.exitCode = 130;
      return;
    }
    const clientSecret = await password({
      message: "Client secret",
      mask: "*",
      output: process.stderr,
      validate: (value) => (value?.trim() ? undefined : "Client secret is required."),
    });
    if (isCancel(clientSecret)) {
      process.stderr.write("Authentication setup cancelled.\n");
      process.exitCode = 130;
      return;
    }
    await saveCredentials({ clientId, clientSecret });
  }
  process.stdout.write(JSON.stringify({ saved: true, path: credentialsPath() }) + "\n");
}
