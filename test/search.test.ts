import { expect, test } from "bun:test";
import { search, searchInputSchema, validateSearch } from "../src/search";

test("search sends encoded terms and credentials and parses the wire response", async () => {
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      if (
        url.pathname !== "/v1/search/news.json" ||
        url.searchParams.get("query") !== "서울 & AI" ||
        url.searchParams.get("display") !== "2" ||
        url.searchParams.get("start") !== "3" ||
        url.searchParams.get("sort") !== "date" ||
        request.headers.get("X-Naver-Client-Id") !== "test-id" ||
        request.headers.get("X-Naver-Client-Secret") !== "test-secret"
      ) {
        return Response.json(
          { errorCode: "BAD_REQUEST", errorMessage: "Contract violation" },
          { status: 400 },
        );
      }
      return Response.json({
        lastBuildDate: "today",
        total: 7,
        start: 3,
        display: 2,
        items: [{ title: "서울", originallink: "https://example.com/story" }],
      });
    },
  });
  try {
    const result = await search(
      searchInputSchema.parse({
        category: "news",
        query: "서울 & AI",
        display: "2",
        start: "3",
        sort: "date",
      }),
      { clientId: "test-id", clientSecret: "test-secret" },
      server.url.origin,
    );
    expect(result.total).toBe(7);
    expect(result.items).toEqual([{ title: "서울", originallink: "https://example.com/story" }]);
  } finally {
    await server.stop(true);
  }
});

test.each([
  {
    status: 401,
    body: { errorCode: "024", errorMessage: "Authentication failed" },
    message: "Naver HTTP 401 (024): Authentication failed",
  },
  {
    status: 429,
    body: { errorCode: "012", errorMessage: "Quota exceeded" },
    message: "Naver HTTP 429 (012): Quota exceeded",
  },
  { status: 200, body: { unexpected: true }, message: "unexpected search response" },
])(
  "search reports HTTP $status without returning fabricated results",
  async ({ status, body, message }) => {
    const server = Bun.serve({ port: 0, fetch: () => Response.json(body, { status }) });
    try {
      await expect(
        search(
          searchInputSchema.parse({ category: "news", query: "test", display: "1", start: "1" }),
          { clientId: "id", clientSecret: "secret" },
          server.url.origin,
        ),
      ).rejects.toThrow(message);
    } finally {
      await server.stop(true);
    }
  },
);

test.each([
  { category: "local", display: "6", start: "1" },
  { category: "local", display: "5", start: "2" },
  { category: "webkr", display: "10", start: "1", sort: "date" },
  { category: "doc", display: "10", start: "1", sort: "date" },
  { category: "news", display: "10", start: "1", filter: "large" },
])("rejects unsupported endpoint parameters: $category $display $start", (options) => {
  expect(() => validateSearch(searchInputSchema.parse({ ...options, query: "test" }))).toThrow();
});
