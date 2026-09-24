# Module unit tests

Unit tests for `modules/` use Node's built-in test runner
(`node:test` + `node:assert`) with native TypeScript stripping
(`node --experimental-strip-types`), so no dependency install is
required to run them.

The real `@zuplo/runtime` package is only available inside a Zuplo
deployment/dev environment. For tests we substitute a minimal stub
(`test/zuplo-runtime-stub/`) that provides `environment` (backed by
`process.env`) and placeholder `ZuploContext`/`ZuploRequest` exports.
This is test-only scaffolding; it does not affect production code
or the Zuplo runtime used in deployment.

## Running locally

```bash
mkdir -p node_modules/@zuplo
cp -r test/zuplo-runtime-stub node_modules/@zuplo/runtime
node --experimental-strip-types --test test/*.test.ts
```

(Requires Node 22.6+ for `--experimental-strip-types`.)
