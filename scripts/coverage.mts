import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
mkdirSync(join(root, "coverage"), { recursive: true });

execFileSync(
  process.execPath,
  [
    "--enable-source-maps",
    "--test",
    "--experimental-test-coverage",
    "--test-coverage-include={dist,src}/{easyinvoice,mobile,pdf}.{js,ts}",
    "--test-coverage-lines=90",
    "--test-coverage-branches=90",
    "--test-coverage-functions=90",
    "--test-reporter=spec",
    "--test-reporter=lcov",
    "--test-reporter-destination=stdout",
    "--test-reporter-destination=coverage/lcov.info",
    ...readdirSync(join(root, "test"))
      .filter((file) => file.endsWith(".test.mts"))
      .sort()
      .map((file) => join(root, "test", file)),
  ],
  { cwd: root, stdio: "inherit" },
);

const report = readFileSync(join(root, "coverage/lcov.info"), "utf8");
assert.match(
  report,
  /^SF:src\//m,
  "Coverage must map to TypeScript source files.",
);
assert.match(
  report,
  /^LF:[1-9]\d*$/m,
  "Coverage must contain measured source lines.",
);
