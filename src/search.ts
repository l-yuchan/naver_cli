import ky from "ky";
import { z } from "zod";
import { searchResponseSchema } from "./output";
import type { SearchResponse } from "./output";

export const categories = [
  "blog",
  "news",
  "book",
  "encyc",
  "cafearticle",
  "kin",
  "webkr",
  "image",
  "shop",
  "doc",
  "local",
] as const;
export const categorySchema = z.enum(categories);
export type Category = z.infer<typeof categorySchema>;

export class SearchError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "SearchError";
  }
}

export const searchInputSchema = z.object({
  category: categorySchema,
  query: z.string().trim().min(1, "query must not be empty"),
  display: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(100)),
  start: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(1000)),
  sort: z.string().optional(),
  filter: z.string().optional(),
});
export type SearchInput = z.infer<typeof searchInputSchema>;
export type Credentials = { readonly clientId: string; readonly clientSecret: string };

const sortChoices: Readonly<Record<Category, readonly string[]>> = {
  blog: ["sim", "date"],
  news: ["sim", "date"],
  book: ["sim", "date"],
  encyc: [],
  cafearticle: ["sim", "date"],
  kin: ["sim", "date", "point"],
  webkr: [],
  image: ["sim", "date"],
  shop: ["sim", "date", "asc", "dsc"],
  doc: [],
  local: ["random", "comment"],
};

export function validateSearch(input: SearchInput): URLSearchParams {
  const params = new URLSearchParams({ query: input.query });
  if (input.category === "local" && (input.display > 5 || input.start !== 1)) {
    throw new SearchError("local requires --display 1..5 and --start 1.", "INVALID_INPUT");
  }
  if (input.sort !== undefined) {
    if (!sortChoices[input.category].includes(input.sort)) {
      throw new SearchError(
        `Invalid sort for ${input.category}. Allowed: ${sortChoices[input.category].join(", ") || "(none)"}.`,
        "INVALID_INPUT",
      );
    }
    params.set("sort", input.sort);
  }
  if (input.filter !== undefined) {
    if (input.category !== "image" || !["all", "large", "medium", "small"].includes(input.filter)) {
      throw new SearchError(
        "--filter supports image sizes: all, large, medium, small.",
        "INVALID_INPUT",
      );
    }
    params.set("filter", input.filter);
  }
  params.set("display", String(input.display));
  params.set("start", String(input.start));
  return params;
}

export async function search(
  input: SearchInput,
  credentials: Credentials,
  origin = "https://openapi.naver.com",
): Promise<SearchResponse> {
  const params = validateSearch(input);
  const endpoint = input.category === "image" ? "image" : `${input.category}.json`;
  const response = await ky.get(`${origin}/v1/search/${endpoint}`, {
    searchParams: params,
    headers: {
      "X-Naver-Client-Id": credentials.clientId,
      "X-Naver-Client-Secret": credentials.clientSecret,
    },
    timeout: 15000,
    retry: 0,
    redirect: "error",
    throwHttpErrors: false,
  });
  if (!response.ok) {
    const error = z
      .object({ errorCode: z.string(), errorMessage: z.string() })
      .safeParse(await response.json().catch(() => null));
    throw new SearchError(
      `Naver HTTP ${response.status}${error.success ? ` (${error.data.errorCode}): ${error.data.errorMessage}` : ""}`,
      error.success ? error.data.errorCode : "HTTP_ERROR",
      response.status,
    );
  }
  const result = searchResponseSchema.safeParse(await response.json());
  if (!result.success) {
    throw new SearchError("Naver returned an unexpected search response.", "INVALID_RESPONSE");
  }
  return result.data;
}
