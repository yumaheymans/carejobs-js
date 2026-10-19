import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { runCli } from "../dist/cli.js";
import { VERSION } from "../dist/index.js";

async function cli(...argv) {
  let out = "";
  let err = "";
  const code = await runCli(argv, { out: (text) => (out += text), err: (text) => (err += text) });
  return { code, out, err };
}

test("--help and --version", async () => {
  const help = await cli("--help");
  assert.equal(help.code, 0);
  assert.match(help.out, /carejobs search/);
  assert.equal((await cli("--version")).out, `${VERSION}\n`);
});

test("usage errors exit 2 without calling the API", async () => {
  for (const argv of [
    ["bogus"],
    ["search", "--kind", "plumbers"],
    ["search", "--sort", "random"],
    ["search", "--limit", "x"],
    ["pay", "--remote"],
    ["market", "extra"],
    ["employer"],
    ["search", "--nope"],
  ]) {
    const result = await cli(...argv);
    assert.equal(result.code, 2, argv.join(" "));
    assert.match(result.err, /^carejobs: /);
  }
});

test("pay --kind registered-nurse is understood as nurses (live)", async () => {
  const result = await cli("pay", "--kind", "registered-nurse", "--json");
  assert.equal(result.code, 0, result.err);
  assert.equal(JSON.parse(result.out).kind, "nurses");
});

test("search prints a readable summary by default and raw data with --json (live)", async () => {
  const readable = await cli("search", "icu nurse", "--state", "TX", "--limit", "2");
  assert.equal(readable.code, 0, readable.err);
  assert.match(readable.out, /open healthcare jobs match/);
  const raw = await cli("search", "icu nurse", "--state", "TX", "--limit", "2", "--json");
  const data = JSON.parse(raw.out);
  assert.ok(data.jobs.length <= 2);
  assert.equal("text" in data, false);
});

test("an API error exits 1 (live)", async () => {
  const result = await cli("employer", "no-such-employer-xyz");
  assert.equal(result.code, 1);
  assert.match(result.err, /Unknown employer/);
});

test("the bin file runs", () => {
  const out = execFileSync(process.execPath, [new URL("../dist/bin.js", import.meta.url).pathname, "--version"], {
    encoding: "utf8",
  });
  assert.equal(out.trim(), VERSION);
});
