import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("load-env provides a WebSocket implementation when Node does not", () => {
  const script = [
    "delete globalThis.WebSocket;",
    "await import('./load-env.js');",
    "if (typeof globalThis.WebSocket !== 'function') process.exit(1);",
  ].join(" ");
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "--eval", script],
    {
      cwd: new URL(".", import.meta.url),
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
});
