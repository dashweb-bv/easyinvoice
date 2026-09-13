# Contributing

Use Node.js 24 (`nvm install`, then `nvm use`, reads `.nvmrc`) and pnpm 12, pinned by `packageManager` in
`package.json`. Follow the [pnpm installation guide](https://pnpm.io/installation) if pnpm is not installed.
CI and publishing use the same `.nvmrc` and package manager versions on GitHub-hosted Ubuntu 24.04 ARM64 runners.
The published package supports Node.js 22.14.0 and newer and can be installed with npm, pnpm, or Yarn.
Use the latest patch of a supported Node.js LTS release in production.

```sh
pnpm install --frozen-lockfile
pnpm run check
```

`pnpm run check` builds the package, checks types, ESLint, and Prettier formatting, runs the tests with coverage,
and validates the npm tarball with [publint](https://publint.dev), [Are the types wrong?](https://arethetypeswrong.github.io),
and `scripts/check-package.mts`. The package check also verifies that the README's main example matches
`examples/create-invoice.mts` and compiles against the declarations from the installed tarball, without running
the example or contacting the API. Tests mock the network and do not send invoice data to the hosted service.
Dependency installation requires internet access. Use `pnpm run format` to format and auto-fix changes.

ESLint runs type-aware rules against the tests, which import the built `dist/` entry points, so build before
linting. `pnpm run check` and the pre-commit hook do this automatically.

CI also runs the packed consumer on Node.js 22.14.0 while keeping builds and TypeScript checks on Node.js 24.
To repeat that check locally, run `pnpm run test:package /path/to/node22` after building.

`pnpm install` installs Husky hooks. Before each commit, the hook builds the package and lint-staged formats staged
files with Prettier and lints staged TypeScript with ESLint. Commit messages must follow Conventional Commits,
for example `fix: handle an empty response` or `feat: support another invoice option`. CI checks commit messages
and the pull request title, which becomes the commit message when squash merging.

`pnpm run test:coverage` writes `coverage/lcov.info`, using source maps to report coverage against the TypeScript
source. Coverage checks require at least 90% aggregate line, branch, and function coverage.
CI uploads this report to Codecov on every push and pull request. A failed upload is shown as a failed step with an
error annotation on the run, but it does not fail the job, so a Codecov problem never blocks a release. If the step
fails on every run, the `CODECOV_TOKEN` secret or the repository's Codecov setup is wrong rather than Codecov itself.
The README badge reads the latest `master` coverage from Codecov; no README edits are needed when coverage changes.
The repository must be enabled in Codecov with its upload token stored in the GitHub Actions secret `CODECOV_TOKEN`.

## Structure

- `src/easyinvoice.ts`: stateless, promise-based invoice requests.
- `src/error.ts`: the `EasyInvoiceError` rejection type.
- `src/types.ts`: public invoice data, option, and result types.
- `src/index.cts` and `src/index.mts`: Node.js CommonJS and ES module entry points.
- `scripts/build.mts`: compiles TypeScript to JavaScript and declarations.
- `test/`: compatibility checks using Node's built-in test runner.

Edit TypeScript source rather than generated `dist/` files. Keep invoice validation and calculations on the
hosted API; forward its options and results without inventing a second invoice schema. Keep the client stateless
and free of runtime dependencies. Add focused regression checks when behavior changes and document breaking
changes with a migration note.

Keep the ES module entry and its imports as native ESM so bundlers can tree-shake unused code.
The CommonJS entry wraps the ES module entry using Node.js 22.14+'s synchronous ESM loading.
Importing the package must have no side effects, as declared by `sideEffects: false` in `package.json`.
The package uses plain `import`/`require` export conditions so that Node.js, bundlers, and TypeScript's
`bundler` module resolution all resolve it.

## Dependencies

The project uses TypeScript 6, the last release with the JavaScript compiler API that ESLint's typescript-eslint
requires. Move to TypeScript 7 once typescript-eslint supports it.

`pnpm-workspace.yaml` sets `minimumReleaseAge` so that freshly published dependency versions are not installed
for seven days. Dependabot uses the same cooldown and opens weekly grouped pull requests for npm dependencies and
GitHub Actions. Actions are pinned to commit SHAs; Dependabot updates the SHA and the version comment together.
`.gitattributes` normalizes line endings to LF so Prettier checks pass on every platform.

`conventional-changelog-conventionalcommits` stays on version 9 because the release notes writer used by
semantic-release does not support version 10's hooks yet. Upgrade it when the release notes writer supports them.

## Releases

Merge Conventional Commits into `master`. The CI workflow (`.github/workflows/ci.yml`) runs the checks for pull
requests and pushes, and the release workflow (`.github/workflows/release.yml`) runs after CI succeeds for a push
to `master`, releasing exactly the commit that CI checked. semantic-release chooses the highest required bump
since the last release:

- Breaking changes (`feat!:`, `refactor!:`, or a `BREAKING CHANGE:` footer): major.
- Features (`feat:`): minor.
- `fix:`, `perf:`, `refactor:`, `revert:`, and `docs(readme):` commits: patch.
- Other types, such as `chore:`, `ci:`, `test:`, `build:`, and other `docs:` commits, do not publish a release.

The workflow publishes the npm package and creates a GitHub release with generated notes and a `v<version>` tag.
The version in `package.json` stays at `0.0.0-development`; the Git tags are the source of truth, and
semantic-release writes the real version into the published package. Do not edit version numbers or create
release tags manually.

Publishing uses [npm trusted publishing](https://docs.npmjs.com/trusted-publishers): the release job authenticates
through GitHub's OIDC token (`id-token: write`) and npm generates provenance attestations automatically.
The trusted publisher on npm is registered for this repository's `release.yml` workflow, and no npm token is
stored in the repository secrets. The workflow's `GITHUB_TOKEN` needs `contents: write` to create the release
and tag; repository rules must allow the workflow to create tags.

Pull requests run checks without publishing. Both workflows use Node.js 24 and Ubuntu ARM64, with Husky disabled
in CI.
