# Search CLI verification - November 13, 2026

## Local checks: PASS

Invocation:

```sh
bun run format && bun run check && bun test && bun run format:check && bun run build
```

Final command monitor: `mon_12D0ETYASXWPQ1GM`, exit 0.

- Strict `tsc --noEmit`: PASS.
- `oxlint --deny-warnings src test`: PASS, no warnings.
- Tests: 23 pass, 0 fail, 44 assertions across 3 files.
- Formatting: PASS.
- Build: 123 modules, `dist/cli.js`, 0.41 MB.
- Editor LSP binaries were unavailable; compiler and lint diagnostics ran locally.

Tests cover real local HTTP transport (UTF-8 query encoding and credential headers), API 401/429 and malformed responses, endpoint parameter restrictions, CSV escaping and sparse columns, JSON metadata, text decoding and numbering, empty results, help and CLI argument rejection.

## Built CLI scenarios

Captured through `Bun.spawn([process.execPath, "dist/cli.js", ...args])`, with stdout, stderr and exit code collected separately. Monitor: `mon_YN8VK4MECNQ06NHV`, completed exit 0.

1. `bun dist/cli.js --help`: PASS. Exit 0, usage and search command on stdout; stderr empty.
2. `bun dist/cli.js search news AI --display 0`: PASS. Exit 2, stdout empty, stderr `error: display: Too small: expected number to be >=1`.
3. Live searches:

```sh
bun dist/cli.js search news "인공지능" --display 2 --format json
bun dist/cli.js search news "인공지능" --display 2 --format csv
bun dist/cli.js search news "인공지능" --display 2 --format text
```

All three: **successful live results NOT VERIFIED**. Exit 1, stdout empty, stderr:

```text
error [024]: Naver HTTP 401 (024): NID AUTH Result Invalid (1000) : Authentication failed. (인증에 실패했습니다.)
```

The CLI loaded the existing `.env`, mapping `X-NCP-APIGW-API-KEY-ID` to `X-Naver-Client-Id` and `X-NCP-APIGW-API-KEY` to `X-Naver-Client-Secret`. Credential values were never printed or changed.

An earlier direct HTTPS GET to `/v1/search/news.json?query=naver&display=1` using the same values also returned HTTP 401 with error code 024. The rejection comes from the remote API; changing local variable names does not resolve it.

## Findings and review

- Official documentation confirmed eleven result-list search categories, category-specific sorting, image-size filters and local search limits. Academic document search has no documented sort parameter; the initial assumption was corrected.
- Initial compiler runs caught dotenv's narrow error-code declaration and Bun test callback rest-argument inference; both fixed without type suppressions.
- The first subprocess test run hit the default 5-second timeout on two cold Windows starts. Standalone reproduction and subsequent full runs completed normally, with the original timeout retained and no skipped tests.
- Self-review: source files have separate CLI, transport and output responsibilities, all below 150 nonblank lines. External data is schema parsed. Default requests use HTTPS, do not follow redirects, have a timeout and do not retry. Secrets are omitted from diagnostics.
- HEAVY tier retained because this introduces an external integration. No independent review gate was requested.
- No repository commits: the workspace was not a Git repository.

## Cleanup

Local HTTP servers are stopped in test `finally` blocks. All check and smoke commands exited; the inconclusive documentation child was cancelled. No browser, TUI, persistent server or QA file was created. The isolated runtime cache root is removed at final cleanup; the durable notepad and this evidence remain.

Final receipt: removed `C:/Users/chabun/AppData/Local/Temp/naver-ulw-kBnjpt`; stat returned ENOENT. Task-only runtime cache environment variables cleared.
