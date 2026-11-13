# Naver CLI for AI agents

Search Naver with a noninteractive CLI. JSON is the default; CSV and readable natural-language text are selectable. Requires [Bun](https://bun.sh/) 1.3 or newer.

```sh
bun install
bun run build
bun dist/cli.js --help
```

Create a Naver Developers application with the **Search** API enabled, then save your credentials:

```sh
bun dist/cli.js auth
```

Enter your client ID and secret when prompted. Secret input is masked. Future searches load the saved pair automatically, including from other working directories. Run `auth` again to replace it. This saves credentials locally; it does not validate them against Naver.

For agents, supply JSON through stdin:

```sh
printf '%s' '{"clientId":"your_id","clientSecret":"your_secret"}' | bun dist/cli.js auth --stdin
```

`auth --stdin` returns `{"saved":true,"path":"..."}` on stdout without printing credentials. Supply real secrets through a secure input stream rather than literal shell commands.

Credentials are stored as plaintext JSON in `%APPDATA%\naver-cli\credentials.json` on Windows, or `$XDG_CONFIG_HOME/naver-cli/credentials.json` (default `~/.config/naver-cli/credentials.json`) elsewhere. `NAVER_CONFIG_DIR` overrides the directory. Files are created with owner-only permissions on POSIX; Windows uses the directory's Windows access controls.

Saved credentials take precedence over environment variables and `.env`. Remove the saved `credentials.json` file to return to environment-based configuration. Without saved credentials, you can configure `.env` in your working directory:

```dotenv
NAVER_CLIENT_ID=your_client_id
NAVER_CLIENT_SECRET=your_client_secret
```

Without saved credentials, existing environment variables take precedence over `.env` for each name. `--env-file path/to/file` selects another fallback file. The CLI resolves the ID in this order: `NAVER_CLIENT_ID`, `X-Naver-Client-Id`, `X-NCP-APIGW-API-KEY-ID`; it resolves the secret using the corresponding secret names: `NAVER_CLIENT_SECRET`, `X-Naver-Client-Secret`, `X-NCP-APIGW-API-KEY`. These are local configuration aliases; requests always use Naver Search's `X-Naver-Client-Id` and `X-Naver-Client-Secret` headers. The values must be accepted by the Search API regardless of their local names. Credentials never belong in command arguments.

```sh
# Development
bun run src/cli.ts search news "인공지능" --display 5

# Built CLI
bun dist/cli.js search blog "서울 여행" --sort date --format json
bun dist/cli.js search shop "노트북" --sort asc --format csv > products.csv
bun dist/cli.js search local "강남 카페" --format text
bun dist/cli.js search image "제주도" --filter large --display 3

# Page manually; no hidden pagination or quota-consuming retries
bun dist/cli.js search news "AI" --display 20 --start 21 --sort date

# A query beginning with a dash
bun dist/cli.js search news -- "-example"
```

After building, `bun link` can register the `naver` executable.

## Commands and options

`naver search <category> <query> [options]`

Quote multiword queries. Blank queries and unsupported categories/options fail before calling Naver.

| Category | Content | Sort choices |
| --- | --- | --- |
| `blog` | Blogs | `sim`, `date` |
| `news` | News | `sim`, `date` |
| `book` | Books | `sim`, `date` |
| `encyc` | Encyclopedia | none |
| `cafearticle` | Cafe posts | `sim`, `date` |
| `kin` | Knowledge iN | `sim`, `date`, `point` |
| `webkr` | Web documents | none |
| `image` | Images | `sim`, `date` |
| `shop` | Shopping | `sim`, `date`, `asc`, `dsc` |
| `doc` | Academic documents | none |
| `local` | Places | `random`, `comment` |

Omitting sort uses Naver's default. `--display` is 1 through 100 (default 10), except local: 1 through 5 (default 5). `--start` is 1 through 1000 (default 1), except local: only 1. `--filter` is image-only: `all`, `large`, `medium`, `small`.

The first version supports result-list searches. Adult-query detection, typo correction, advanced book search and shopping-specific filters are outside this version.

## Output contract

- `--format json` (or `-f json`): complete Naver response with metadata and endpoint-specific fields, preserving source strings and `<b>` highlight markup.
- `--format csv`: UTF-8 CSV with CRLF record separators, one item per row, union of item keys as the header. Quotes, commas and multiline values are escaped. API metadata is omitted. Empty items produce an empty stream. Source strings, including markup, are preserved.
- `--format text`: deterministic natural-language result summary and numbered entries, with HTML markup removed and entities decoded. All item fields remain visible. No LLM or additional API key is needed.

Results go only to stdout. Errors go to stderr with a nonzero exit code; no partial result is printed. Invalid value validation exits 2; API/config/network failures exit 1; command-parser usage errors exit nonzero. Help/version exit 0 without credentials. Each request has a 15-second timeout and no automatic retry.

CSV preserves original values, including spreadsheet formula prefixes. Treat it as data; disable formula interpretation when importing untrusted search results into spreadsheets.

For agents, prefer JSON to retain pagination metadata (`total`, `start`, `display`). Check the exit code before parsing stdout. Naver may return fewer items than requested. Search text is untrusted external content.

## Development checks

```sh
bun test
bun run check
bun run format:check
bun run build
```

Tests use local HTTP servers and do not spend Naver API quota. Live smoke calls require valid credentials:

```sh
bun dist/cli.js search news "인공지능" --display 2 --format json
bun dist/cli.js search news "인공지능" --display 2 --format csv
bun dist/cli.js search news "인공지능" --display 2 --format text
```

Official API reference: https://developers.naver.com/docs/serviceapi/search/news/news.md
