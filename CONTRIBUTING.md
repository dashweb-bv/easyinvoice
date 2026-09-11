# Contributing

Use Node.js 24.15 or newer within Node 24 (`nvm install`, then `nvm use`) and pnpm 12,
pinned by `packageManager` in `package.json`.
Follow the [pnpm installation guide](https://pnpm.io/installation) if pnpm is not installed.
CI and publishing use the same `.nvmrc` and package manager versions on GitHub-hosted Ubuntu 24.04 ARM64 runners.
The published package supports Node.js 22.14.0 and newer and can be installed with npm, pnpm, or Yarn.
Use the latest patch of a supported Node.js LTS release in production.

```sh
pnpm install --frozen-lockfile
pnpm run check
```

`pnpm run check` checks types and formatting, builds the package, runs the tests, and validates the npm tarball.
It also checks that the README's main example matches `examples/create-invoice.mts` and compiles against the
declarations from the installed tarball, without running the example or contacting the API.
Tests mock the network and browser APIs; they do not send invoice data to the hosted service. The PDF integration
test also renders a synthetic document with the installed PDF.js legacy build and its Node canvas support.
Dependency installation requires internet access. Use `pnpm run format` to format changes.

CI also runs the packed consumer on Node.js 22.14.0 while keeping builds and TypeScript checks on Node.js 24.
To repeat that check locally, run `pnpm run test:package /path/to/node22` after building.

The separate Chromium test checks the browser bundle, a real PDF.js worker, and rendered PDF pages:

```sh
pnpm exec playwright install --with-deps --only-shell chromium
pnpm run test:browser
```

The browser test serves its fixtures locally and does not contact the invoice API. CI requires it to pass
before publishing; the browser download is only needed when running this test.

`pnpm install` installs Husky hooks. Before each commit, lint-staged formats staged files with Prettier and the hook
checks TypeScript. Commit messages must follow Conventional Commits, for example `fix: handle an empty response`
or `feat: support another invoice option`. CI checks commit messages and the pull request title, which becomes
the commit message when squash merging. Formatting uses the same `.prettierignore` as the full check.

`pnpm run test:coverage` writes `coverage/lcov.info`, using source maps to report coverage against the TypeScript
source. Coverage checks require at least 90% aggregate line, branch, and function coverage.
After successful checks on pushes to `master`, CI uploads this report to Codecov from the Node.js 24 job.
The README badge reads the latest `master` coverage from Codecov; no README edits are needed when coverage changes.
The repository must be enabled in Codecov with its upload token stored in the GitHub Actions secret `CODECOV_TOKEN`
(the same secret used by the previous workflow). The badge updates after the first successful CI upload.

## Structure

- `src/easyinvoice.ts`: invoice requests and browser download, print, and render methods.
- `src/types.ts`: public invoice data and result types.
- `src/pdf.ts` and `src/mobile.ts`: optional PDF.js loading and browser rendering support.
- `src/index.cts`, `src/index.mts`, and `src/browser.ts`: CommonJS, ES module, and CDN entry points.
- `scripts/build.mts`: TypeScript declarations and JavaScript output, plus the bundled CDN script.
- `test/`: compatibility checks using Node's built-in test runner.

Edit TypeScript source rather than generated `dist/` files. Keep invoice validation and calculations on the
hosted API; forward its options and results without inventing a second invoice schema. Preserve public method
signatures, callback behavior, and package entry points, and add a focused regression check when behavior changes.

## Releases

Merge Conventional Commits into `master`; the build workflow releases automatically after all checks pass.
semantic-release chooses the highest required bump since the last release:

- Breaking changes (`feat!:` or a `BREAKING CHANGE:` footer): major.
- Features (`feat:`): minor.
- Other conventional commit types, including `fix:`, `docs:`, and `chore:`: patch.

The workflow updates and commits `package.json`, publishes the npm package, and creates
a GitHub release with generated notes and a `v<version>` tag. Do not edit version numbers or create release tags
manually. Release commits use `[skip ci]` to avoid another build.
The pnpm lockfile does not record the root package version, so version-only releases leave it unchanged.

`conventional-changelog-conventionalcommits` stays on version 9 because the release notes writer used by
semantic-release does not support version 10's hooks yet. Upgrade it when the release notes writer supports them.

The first run seeds `v3.0.47` at the commit recorded for that existing npm release, preserving the version history.
For example, a subsequent fix releases `3.0.48`; a feature releases `3.1.0`.

The existing `npm_token` Actions secret must authorize publishing `easyinvoice`. The workflow's `GITHUB_TOKEN`
needs permission to push the release commit and tag to `master`; repository rules must allow this bot write.
Pull requests run checks without publishing. Both jobs use Node.js 24 and Ubuntu ARM64, with Husky disabled in CI.
