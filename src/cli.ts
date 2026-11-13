#!/usr/bin/env bun
import { Command, CommanderError, Option } from "commander";
import { z } from "zod";
import { render, formatSchema } from "./output";
import { categories, search, searchInputSchema, SearchError, validateSearch } from "./search";
import { authenticate } from "./auth";
import { CredentialError, loadCredentials } from "./credentials";

const program = new Command()
  .name("naver")
  .description("Naver Search API for agents. Results go to stdout; errors go to stderr.")
  .version("0.1.0")
  .exitOverride();

program
  .command("auth")
  .description("Enter and save your Naver client ID and secret for future searches")
  .option("--stdin", "Read JSON {clientId, clientSecret} from stdin instead of prompting")
  .action(async (options: unknown) => {
    const opts = z.object({ stdin: z.boolean().optional() }).parse(options);
    await authenticate(opts.stdin ?? false);
  });

program
  .command("search")
  .description(`Search a category: ${categories.join(", ")}`)
  .argument("<category>", "Naver search category")
  .argument("<query>", "Search terms (quote multiword queries)")
  .option("--display <count>", "Results per request (1..100; local 1..5)")
  .option("--start <position>", "First result position (1..1000; local only 1)", "1")
  .option("--sort <order>", "Category-specific sort (see README)")
  .option("--filter <size>", "Image only: all, large, medium, small")
  .addOption(
    new Option("-f, --format <format>", "Output format")
      .choices(["json", "csv", "text"])
      .default("json"),
  )
  .option("--env-file <path>", "Load credentials from this dotenv file", ".env")
  .action(async (category: string, query: string, options: unknown) => {
    const opts = z
      .object({
        display: z.string().optional(),
        start: z.string(),
        sort: z.string().optional(),
        filter: z.string().optional(),
        format: formatSchema,
        envFile: z.string(),
      })
      .parse(options);
    const input = searchInputSchema.parse({
      category,
      query,
      display: opts.display ?? (category === "local" ? "5" : "10"),
      start: opts.start,
      sort: opts.sort,
      filter: opts.filter,
    });
    validateSearch(input);
    const response = await search(input, await loadCredentials(opts.envFile));
    process.stdout.write(render(response, { format: opts.format, category, query: input.query }));
  });

try {
  await program.parseAsync();
} catch (error) {
  if (error instanceof CommanderError) {
    process.exitCode = error.exitCode;
  } else if (error instanceof z.ZodError) {
    process.stderr.write(
      `error: ${error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}\n`,
    );
    process.exitCode = 2;
  } else if (error instanceof CredentialError) {
    process.stderr.write(`error: ${error.message}\n`);
    process.exitCode = 1;
  } else if (error instanceof SearchError) {
    process.stderr.write(`error [${error.code}]: ${error.message}\n`);
    process.exitCode = 1;
  } else if (error instanceof Error) {
    // Network diagnostics omit URLs and headers to avoid leaking credentials.
    process.stderr.write(
      `error: Request failed (${error.name}). Check connectivity and try again.\n`,
    );
    process.exitCode = 1;
  } else {
    throw error;
  }
}
