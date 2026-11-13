import he from "he";
import { z } from "zod";

const scalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const searchResponseSchema = z
  .object({
    lastBuildDate: z.string(),
    total: z.number().int().nonnegative(),
    start: z.number().int().nonnegative(),
    display: z.number().int().nonnegative(),
    items: z.array(z.record(z.string(), scalar)),
  })
  .passthrough();

export type SearchResponse = z.infer<typeof searchResponseSchema>;
export const formatSchema = z.enum(["json", "csv", "text"]);
export type OutputFormat = z.infer<typeof formatSchema>;

function plain(value: unknown): string {
  // Strip markup before decoding, preserving escaped literal angle brackets.
  return he.decode(String(value ?? "").replace(/<[^>]*>/g, ""));
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function render(
  response: SearchResponse,
  context: { readonly format: OutputFormat; readonly category: string; readonly query: string },
): string {
  switch (context.format) {
    case "json":
      return JSON.stringify(response, null, 2) + "\n";
    case "csv": {
      // Union preserves endpoint-specific fields, including fields absent in row one.
      const columns = [...new Set(response.items.flatMap((item) => Object.keys(item)))];
      if (columns.length === 0) return "";
      return (
        [
          columns.map(csvCell).join(","),
          ...response.items.map((item) => columns.map((key) => csvCell(item[key])).join(",")),
        ].join("\r\n") + "\r\n"
      );
    }
    case "text": {
      const heading = `${response.total.toLocaleString("en-US")} ${context.category} results for "${context.query}".`;
      if (response.items.length === 0) return heading + "\nNo results found.\n";
      const rows = response.items.map((item, index) => {
        const title = plain(item["title"] ?? item["name"] ?? "Result");
        const fields = Object.entries(item)
          .filter(([key]) => key !== "title" && key !== "name")
          .map(([key, value]) => `   ${key}: ${plain(value)}`);
        return [`${response.start + index}. ${title}`, ...fields].join("\n");
      });
      return `${heading}\nShowing ${response.items.length} results starting at ${response.start}.\n\n${rows.join("\n\n")}\n`;
    }
    default: {
      const exhaustive: never = context.format;
      throw new TypeError(`Unknown format: ${exhaustive}`);
    }
  }
}
