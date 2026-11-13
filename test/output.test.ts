import { describe, expect, test } from "bun:test";
import { render } from "../src/output";
import type { SearchResponse } from "../src/output";

const response: SearchResponse = {
  lastBuildDate: "Fri, 13 Nov 2026 00:00:00 +0900",
  total: 2,
  start: 4,
  display: 2,
  items: [
    {
      title: '<b>서울</b>, "news"',
      description: "First\nsecond &amp; third",
      link: "https://example.com",
    },
    { title: "Other", price: 1000 },
  ],
};

describe("output contracts", () => {
  test("JSON preserves metadata, endpoint fields and source markup", () => {
    const output = render(response, { format: "json", category: "news", query: "서울" });
    expect(JSON.parse(output)).toEqual(response);
  });

  test("CSV quotes commas, double quotes and newlines and aligns sparse fields", () => {
    const output = render(response, { format: "csv", category: "news", query: "서울" });
    expect(output).toBe(
      'title,description,link,price\r\n"<b>서울</b>, ""news""","First\nsecond &amp; third",https://example.com,\r\nOther,,,1000\r\n',
    );
  });

  test("text decodes entities, strips markup and uses the requested result position", () => {
    const output = render(response, { format: "text", category: "news", query: "서울" });
    expect(output).toContain('4. 서울, "news"');
    expect(output).toContain("First\nsecond & third");
    expect(output).toContain("5. Other");
    expect(output).toContain("price: 1000");
    expect(output).not.toContain("<b>");
  });

  test.each(["json", "csv", "text"] as const)(
    "empty results remain valid in %s format",
    (format) => {
      const empty = { ...response, total: 0, items: [] };
      const output = render(empty, { format, category: "news", query: "none" });
      switch (format) {
        case "json":
          expect(JSON.parse(output).items).toEqual([]);
          break;
        case "csv":
          expect(output).toBe("");
          break;
        case "text":
          expect(output).toContain("No results found.");
          break;
        default: {
          const exhaustive: never = format;
          throw new TypeError(exhaustive);
        }
      }
    },
  );
});
