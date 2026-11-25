# Running tests

- Run all tests with `npm test`, or run TypeScript and the tests together with `npm run check`.
- Filter by path substring with `npm test -- audio` or by a repo-relative glob with `npm test -- "src/audio/**/*.test.ts"`. Add `--list` to print the matching paths.
- The runner uses half the available CPUs (rounded down, with a minimum of one) and allows 120 seconds per file. Override these with `--jobs N` and `--timeout S` (whole seconds).
- Use `--bail` to stop starting new files after the first failure. Files already running finish normally. Use `--quiet` to show only the final summary and failure output.

## Adding a test

Put a `*.test.ts` or `*.test.tsx` file under `src` or `scripts` and use `node:assert/strict` for assertions. Each file runs in its own process from the repository root. Keep tests independent so they can run in parallel. To run a single file directly, use `node --import tsx path/to/file.test.ts` from the root.
