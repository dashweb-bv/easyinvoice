import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const config: {
  branches: string[];
  plugins: (string | [string, Record<string, unknown>])[];
} = JSON.parse(
  readFileSync(new URL("../.releaserc.json", import.meta.url), "utf8"),
);
const analyzer = config.plugins.find(
  (plugin) =>
    Array.isArray(plugin) && plugin[0] === "@semantic-release/commit-analyzer",
);
assert.ok(Array.isArray(analyzer));
// These plugins do not publish TypeScript declarations.
const { analyzeCommits } = await import(import.meta.resolve(analyzer[0]));
const { prepare } = await import(import.meta.resolve("@semantic-release/npm"));
const logger = { log() {} };

test("release rules recognize maintenance, features, and breaking changes", async () => {
  for (const [message, expected] of [
    ["fix: preserve invoice errors", "patch"],
    ["docs: update the README", "patch"],
    ["feat: add an invoice option", "minor"],
    ["feat!: remove a legacy option", "major"],
    ["fix: update the API\n\nBREAKING CHANGE: remove a legacy option", "major"],
    ["Merge pull request #1 from example/branch", null],
  ] as const) {
    assert.equal(
      await analyzeCommits(analyzer[1], {
        cwd: fileURLToPath(new URL("..", import.meta.url)),
        commits: [{ hash: "test", message }],
        logger,
      }),
      expected,
      message,
    );
  }
});

test("a release continues from the existing npm version without publishing", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "easyinvoice-release-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const remote = join(directory, "remote.git");
  const repository = join(directory, "repository");
  // Keep this test independent of CI credentials and developer Git hooks.
  const env = {
    PATH: process.env.PATH,
    HUSKY: "0",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Release test",
    GIT_AUTHOR_EMAIL: "release@example.invalid",
    GIT_COMMITTER_NAME: "Release test",
    GIT_COMMITTER_EMAIL: "release@example.invalid",
  };
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: directory,
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  git("init", "--bare", "--initial-branch=master", remote);
  git("init", "--initial-branch=master", repository);
  symlinkSync(
    fileURLToPath(new URL("../node_modules", import.meta.url)),
    join(repository, "node_modules"),
    "dir",
  );
  git("-C", repository, "commit", "--allow-empty", "-m", "3.0.47");
  git("-C", repository, "tag", "v3.0.47");
  git("-C", repository, "remote", "add", "origin", remote);
  git("-C", repository, "push", "--tags", "--set-upstream", "origin", "master");
  const options = {
    branches: config.branches,
    repositoryUrl: pathToFileURL(remote).href,
    dryRun: true,
    ci: false,
    // Only analysis runs: no npm, GitHub, or release-commit plugins.
    plugins: config.plugins
      .filter(
        (plugin) =>
          Array.isArray(plugin) &&
          [
            "@semantic-release/commit-analyzer",
            "@semantic-release/release-notes-generator",
          ].includes(plugin[0]),
      )
      .map((plugin) => {
        assert.ok(Array.isArray(plugin));
        return [fileURLToPath(import.meta.resolve(plugin[0])), plugin[1]] as [
          string,
          Record<string, unknown>,
        ];
      }),
  };
  // semantic-release intercepts stdout; a child keeps Node's test protocol intact.
  const script = join(directory, "release.mjs");
  const resultFile = join(directory, "result.json");
  writeFileSync(
    script,
    `
import release from ${JSON.stringify(import.meta.resolve("semantic-release"))};
import { writeFileSync } from "node:fs";
const result = await release(${JSON.stringify(options)}, { cwd: ${JSON.stringify(repository)} });
writeFileSync(${JSON.stringify(resultFile)}, JSON.stringify(result));
`,
  );
  const runRelease = () => {
    execFileSync(process.execPath, [script], {
      cwd: repository,
      env,
      stdio: "pipe",
    });
    return JSON.parse(readFileSync(resultFile, "utf8"));
  };
  assert.equal(runRelease(), false);

  git(
    "-C",
    repository,
    "commit",
    "--allow-empty",
    "-m",
    "fix: preserve invoice errors",
  );
  git("-C", repository, "push", "origin", "master");
  const result = runRelease();
  assert.ok(result);
  assert.equal(result.lastRelease.version, "3.0.47");
  assert.equal(result.nextRelease.version, "3.0.48");
  assert.equal(git("-C", remote, "tag", "--list").trim(), "v3.0.47");

  const gitPlugin = config.plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === "@semantic-release/git",
  );
  assert.ok(Array.isArray(gitPlugin));
  const { prepare: prepareGit } = await import(
    import.meta.resolve(gitPlugin[0])
  );
  writeFileSync(
    join(repository, "package.json"),
    JSON.stringify({ name: "easyinvoice-release-test", version: "3.0.48" }),
  );
  writeFileSync(
    join(repository, "unrelated.txt"),
    "Leave unrelated files out of the release.",
  );
  await prepareGit(gitPlugin[1], {
    cwd: repository,
    env,
    branch: { name: "master" },
    options: { repositoryUrl: options.repositoryUrl },
    lastRelease: result.lastRelease,
    nextRelease: result.nextRelease,
    logger,
  });
  assert.equal(
    git("-C", remote, "log", "-1", "--format=%s").trim(),
    "chore(release): 3.0.48 [skip ci]",
  );
  assert.equal(
    git("-C", remote, "show", "--format=", "--name-only", "master").trim(),
    "package.json",
  );
  assert.equal(
    JSON.parse(git("-C", remote, "show", "master:package.json")).version,
    "3.0.48",
  );
});

test("release preparation updates the version and preserves the pnpm lockfile", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "easyinvoice-version-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const manifest = {
    name: "easyinvoice-release-test",
    version: "3.0.47",
    private: true,
  };
  writeFileSync(join(directory, "package.json"), JSON.stringify(manifest));
  // pnpm's root importer tracks dependencies, not the package's own version.
  const lockfile = "lockfileVersion: '9.0'\n\nimporters:\n  .: {}\n";
  writeFileSync(join(directory, "pnpm-lock.yaml"), lockfile);
  writeFileSync(join(directory, ".npmrc"), "");
  const output = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  await prepare(
    { npmPublish: false },
    {
      cwd: directory,
      env: {
        PATH: process.env.PATH,
        HUSKY: "0",
        NPM_CONFIG_USERCONFIG: join(directory, ".npmrc"),
        NPM_CONFIG_CACHE: join(directory, "npm-cache"),
      },
      nextRelease: { version: "3.0.48" },
      logger,
      stdout: output,
      stderr: output,
    },
  );
  const published = JSON.parse(
    readFileSync(join(directory, "package.json"), "utf8"),
  );
  assert.equal(published.version, "3.0.48");
  assert.equal(
    readFileSync(join(directory, "pnpm-lock.yaml"), "utf8"),
    lockfile,
  );
  assert.equal(existsSync(join(directory, "package-lock.json")), false);
});
