# Persistent auth verification - November 13, 2026

## Real interactive command: PASS

Invocation: `NAVER_CONFIG_DIR=<owned temporary profile> bun dist/cli.js auth`.

Monitor/session: `mon_9TGF5Z42FRYFBJRF`.

Actions:

1. Entered disposable client ID `qa-auth-id` using `bash_input`.
2. Entered disposable secret without submitting, then inspected the live rendered terminal grid:

```text
Client ID
qa-auth-id

Client secret
**************_
```

3. Submitted Enter. The command exited 0 and emitted `{"saved":true,"path":"<temporary profile>/credentials.json"}`.
4. Parsed the resulting file without printing its values. Both client ID and client secret matched the supplied disposable inputs.

This is actual PTY input and a rendered terminal-grid capture; no pixel screenshot was captured.

## Built stdin auth and subsequent loading: PASS

Invoked the built CLI through `Bun.spawn([process.execPath, absoluteCliPath, "auth", "--stdin"])` with JSON bytes on stdin, from a different working directory. The profile was the same isolated directory.

Monitor: `mon_VVCBVTXR2BZ2QJ8C`.

- Valid input `{clientId:"agent-id", clientSecret:"agent-secret"}`: exit 0, saved/path JSON on stdout, empty stderr.
- Malformed input `malformed`: exit 1, empty stdout, stderr `error: Expected JSON on stdin with clientId and clientSecret.`
- Loaded credentials after that separate CLI process: both values still matched the valid pair, PASS true. Malformed input did not replace them.
- The initial QA command had a Windows backslash-escaping syntax error in its `bun -e` source, before invoking the CLI. The corrected portable command passed. Production code was unchanged by this correction.

## Project checks: PASS

Invocation:

```sh
bun run format && bun run check && bun test && bun run format:check && bun run build
```

Monitor: `mon_9NYZKDDRDHE5BGEC`, exit 0.

- 34 tests pass, 0 failures, 83 assertions.
- Strict TypeScript and oxlint pass.
- Formatting check passes.
- Build succeeds: 132 modules, `dist/cli.js` 0.44 MB.

Tests protect stored credentials across processes, saved-over-environment precedence, prior credentials surviving malformed/blank/multiline input, corrupt-storage recovery, corrupt saved config failing without secret leakage, explicit noninteractive mode, and environment/dotenv fallback. The pre-existing search tests remain green.

## Review and limitations

Self-review: CLI dispatch, auth interaction, and credential persistence have separate owners. External JSON and stored credentials pass Zod schemas. Secret inputs do not appear in success/error output. Saves use a unique exclusive temporary file and atomic rename, with POSIX file mode 0600. Existing `.env` is untouched. Saved credentials take precedence over environment and dotenv because Bun may load `.env` before application code runs.

Saving does not verify credentials against Naver. The prior Search API authentication rejection is unrelated to local persistence and was not retested with disposable credentials. POSIX permissions were not exercised on this Windows workstation; the modes are set in the implementation and the test checks them when run on POSIX.

No editor LSP binary was installed; strict compiler/lint diagnostics ran. No independent reviewer gate was triggered. No Git repository exists, so no repository commits were created.

## Cleanup

Disposable profile and runtime caches are contained in `C:/Users/chabun/AppData/Local/Temp/naver-auth-Rg2HyO`. All test children and QA commands exited. No real saved credential profile was created or overwritten.

Final receipt: removed the owned directory recursively; stat returned ENOENT. Disposable credentials and runtime caches are gone.
