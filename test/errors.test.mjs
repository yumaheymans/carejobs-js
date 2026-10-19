// Offline tests: a stub fetch stands in for the server.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CareJobs, CareJobsError } from "../dist/index.js";

const reply = (body, init = {}) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": init.type ?? "application/json" },
  });

const client = (fetchImpl) => new CareJobs({ fetch: fetchImpl, baseUrl: "https://example.test/", timeoutMs: 1000 });
const ok = (structuredContent, text = "summary") => ({
  jsonrpc: "2.0",
  id: 1,
  result: { content: [{ type: "text", text }], structuredContent },
});

test("sends the MCP request with the documented headers", async () => {
  let seen;
  const cj = new CareJobs({
    baseUrl: "https://example.test/",
    userAgent: "my-app/2",
    fetch: async (url, init) => {
      seen = { url, init, body: JSON.parse(init.body) };
      return reply(ok({ total: 0, pay: null, jobs: [], more: "" }));
    },
  });
  const result = await cj.searchJobs({ query: "icu", minHourlyUsd: 50, remote: true });
  assert.equal(seen.url, "https://example.test/api/mcp");
  assert.equal(seen.init.method, "POST");
  assert.equal(seen.init.headers["Content-Type"], "application/json");
  assert.equal(seen.init.headers.Accept, "application/json, text/event-stream");
  assert.equal(seen.init.headers["User-Agent"], "my-app/2");
  assert.equal(seen.body.method, "tools/call");
  assert.deepEqual(seen.body.params, {
    name: "search_healthcare_jobs",
    arguments: { query: "icu", min_hourly_usd: 50, remote: true },
  });
  assert.equal(result.text, "summary");
  assert.equal(result.total, 0);
});

test("reads an event-stream answer", async () => {
  const cj = client(async () =>
    reply(`event: message\ndata: ${JSON.stringify(ok({ total: 7, pay: null, jobs: [], more: "" }))}\n\n`, {
      type: "text/event-stream",
    }),
  );
  assert.equal((await cj.searchJobs()).total, 7);
});

test("an HTTP error becomes code http with the status", async () => {
  const cj = client(async () => reply("slow down", { status: 429, type: "text/plain" }));
  await assert.rejects(cj.getJobMarket(), (error) => {
    assert.ok(error instanceof CareJobsError);
    assert.equal(error.code, "http");
    assert.equal(error.status, 429);
    assert.match(error.message, /429/);
    return true;
  });
});

test("a JSON-RPC error becomes code rpc", async () => {
  const cj = client(async () => reply({ jsonrpc: "2.0", id: 1, error: { code: -32602, message: "Unknown tool: x" } }));
  await assert.rejects(cj.getJobMarket(), (error) => {
    assert.equal(error.code, "rpc");
    assert.equal(error.rpcCode, -32602);
    assert.equal(error.message, "Unknown tool: x");
    return true;
  });
});

test("isError becomes code tool with the server's message", async () => {
  const cj = client(async () => reply({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "Unknown kind 'x'." }], isError: true } }));
  await assert.rejects(cj.getPay(), (error) => {
    assert.equal(error.code, "tool");
    assert.equal(error.tool, "get_healthcare_pay");
    assert.equal(error.message, "Unknown kind 'x'.");
    return true;
  });
});

test("a body that is not JSON-RPC becomes code protocol", async () => {
  await assert.rejects(client(async () => reply("<html>hi</html>")).getJobMarket(), (error) => error.code === "protocol");
  await assert.rejects(client(async () => reply({ jsonrpc: "2.0", id: 1, result: { content: [] } })).getJobMarket(), (error) => error.code === "protocol");
});

test("a failed connection becomes code network", async () => {
  const cj = client(async () => {
    throw new TypeError("fetch failed");
  });
  await assert.rejects(cj.getJobMarket(), (error) => error.code === "network" && /fetch failed/.test(error.message));
});

test("no answer in time becomes code timeout", async () => {
  const cj = new CareJobs({
    timeoutMs: 20,
    // A real connection keeps the event loop alive while it waits; this timer stands in for it.
    fetch: (url, init) =>
      new Promise((resolve, reject) => {
        const hold = setTimeout(resolve, 5000);
        init.signal.addEventListener("abort", () => {
          clearTimeout(hold);
          reject(init.signal.reason);
        });
      }),
  });
  await assert.rejects(cj.getJobMarket(), (error) => error.code === "timeout");
});
