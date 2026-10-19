// Live tests: these call https://carejobs.now/api/mcp (free, no key).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CARE_TYPES, CareJobs, CareJobsError, EMPLOYER_TYPES, KINDS, SORTS, VERSION } from "../dist/index.js";

const cj = new CareJobs({ timeoutMs: 60_000 });
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("VERSION matches package.json", () => {
  assert.equal(VERSION, pkg.version);
});

test("searchJobs returns typed jobs and a text summary", async () => {
  const result = await cj.searchJobs({ limit: 2 });
  assert.equal(typeof result.text, "string");
  assert.ok(result.text.length > 0);
  assert.ok(result.total > 0);
  assert.ok(result.jobs.length >= 1 && result.jobs.length <= 2);
  const job = result.jobs[0];
  assert.equal(typeof job.title, "string");
  assert.equal(typeof job.employer, "string");
  assert.ok(Array.isArray(job.schedule));
  assert.match(job.url, /^https:\/\/carejobs\.now\/jobs\//);
  assert.equal(typeof result.more, "string");
});

test("searchJobs filters by state, kind and query", async () => {
  const result = await cj.searchJobs({ query: "icu", kind: "nurses", state: "TX", limit: 2 });
  assert.ok(result.jobs.length <= 2);
  for (const job of result.jobs) assert.match(job.location, /TX$/);
});

test("getPay answers for the whole board and for one kind", async () => {
  const overview = await cj.getPay();
  assert.ok(overview.pay_by_kind.length > 0);
  assert.ok(overview.board.median > 0);
  const nurses = await cj.getPay({ kind: "nurses" });
  assert.equal(nurses.kind, "nurses");
  assert.ok(nurses.pay.median > 0);
  assert.ok(nurses.best_paying.length > 0);
  assert.equal(typeof nurses.text, "string");
});

test("getJobMarket counts open jobs by kind, state and employer", async () => {
  const market = await cj.getJobMarket();
  assert.ok(market.open_jobs > 1000);
  assert.ok(market.open_by_kind.length > 5);
  assert.ok(market.open_by_state.some((state) => state.code === "TX"));
  assert.ok(market.open_by_employer.length > 10);
});

test("getJobsByState answers for every state and for one", async () => {
  const all = await cj.getJobsByState();
  assert.ok(all.states.length >= 50);
  const texas = await cj.getJobsByState({ state: "TX", limit: 2 });
  assert.equal(texas.state, "TX");
  assert.ok(texas.newest.length <= 2);
  const slice = await cj.getJobsByState({ state: "TX", kind: "nurses", limit: 1 });
  assert.equal(slice.kind, "nurses");
});

test("listEmployers and getEmployer", async () => {
  const list = await cj.listEmployers({ query: "kaiser", limit: 3 });
  assert.ok(list.entries.some((entry) => entry.slug === "kaiser-permanente"));
  const employer = await cj.getEmployer("kaiser-permanente");
  assert.equal(employer.slug, "kaiser-permanente");
  assert.ok(employer.open_jobs > 0);
  assert.ok(employer.open_by_kind.length > 0);
  assert.match(employer.url, /^https:\/\/carejobs\.now\/employers\//);
});

test("a bad argument is a CareJobsError with code tool", async () => {
  await assert.rejects(cj.getPay({ kind: "registered-nurse" }), (error) => {
    assert.ok(error instanceof CareJobsError);
    assert.equal(error.code, "tool");
    assert.equal(error.tool, "get_healthcare_pay");
    assert.match(error.message, /Unknown kind/);
    return true;
  });
  await assert.rejects(cj.getEmployer("no-such-employer-xyz"), (error) => {
    assert.ok(error instanceof CareJobsError && error.code === "tool");
    return true;
  });
});

test("an unknown tool is a CareJobsError with code rpc", async () => {
  await assert.rejects(cj.callTool("no_such_tool"), (error) => {
    assert.ok(error instanceof CareJobsError);
    assert.equal(error.code, "rpc");
    return true;
  });
});

test("the enums in the types match the live tools/list schemas", async () => {
  const tools = await cj.listTools();
  assert.deepEqual(tools.map((tool) => tool.name).sort(), [
    "get_healthcare_employer",
    "get_healthcare_job_market",
    "get_healthcare_jobs_by_state",
    "get_healthcare_pay",
    "list_healthcare_employers",
    "search_healthcare_jobs",
  ]);
  const props = (name) => tools.find((tool) => tool.name === name).inputSchema.properties;
  for (const name of ["search_healthcare_jobs", "get_healthcare_pay", "get_healthcare_jobs_by_state", "list_healthcare_employers"]) {
    assert.deepEqual(props(name).kind.enum, [...KINDS], `${name} kind`);
  }
  assert.deepEqual(props("search_healthcare_jobs").sort.enum, [...SORTS]);
  assert.deepEqual(props("list_healthcare_employers").care.enum, [...CARE_TYPES]);
  assert.deepEqual(props("list_healthcare_employers").type.enum, [...EMPLOYER_TYPES]);
});
