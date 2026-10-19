# carejobs

Client and command line tool for the [CareJobs.Now](https://carejobs.now) healthcare jobs API. Search open US healthcare jobs, see the pay employers post, and look up employers and states, from JavaScript or TypeScript.

- Free, no API key.
- Zero runtime dependencies. Node 18 or newer (it uses the global `fetch`).
- Written in TypeScript, ships ESM and type declarations.
- The same API is a remote MCP server at <https://carejobs.now/api/mcp>, so any MCP client can use it too.

## Install

```sh
npm install carejobs
```

Or run the command line tool without installing:

```sh
npx carejobs search "icu nurse" --state TX --limit 5
```

## Quick start

```ts
import { CareJobs } from "carejobs";

const cj = new CareJobs();

const jobs = await cj.searchJobs({ query: "icu", state: "TX", kind: "nurses", limit: 5 });
console.log(`${jobs.total} jobs match`);
for (const job of jobs.jobs) {
  console.log(job.title, "|", job.employer, "|", job.location, "|", job.url);
}

const pay = await cj.getPay({ kind: "nurses" });
console.log(`Median posted pay for nurses: $${pay.pay.median}/hr`);

// Every answer also carries the server's readable summary:
console.log(pay.text);
```

Each method returns the typed data of the matching tool plus `.text`, a readable plain-text summary written by the server. Field names are the ones the API sends (`typical_low`, `open_jobs`, and so on). Options are camelCase.

## Client

```ts
const cj = new CareJobs({
  baseUrl: "https://carejobs.now", // default
  timeoutMs: 30000,                // default
  userAgent: "my-app/1.0",         // default "carejobs-js/<version>"
  fetch: customFetch,              // optional, default is the global fetch
});
```

### `searchJobs(options?)`

Open healthcare jobs at US hospitals, health systems, clinics and care companies, plus the job boards the site reads. Every option is optional.

| Option | Type | Meaning |
| --- | --- | --- |
| `query` | `string` | Words every job must carry in its title, place, department or schedule ("ICU", "night") |
| `kind` | `Kind` | Kind of job, see below |
| `employer` | `string` | Employer slug or name ("kaiser-permanente") |
| `state` | `string` | Two-letter code or name ("TX", "Texas") |
| `remote` | `boolean` | Only remote jobs |
| `minHourlyUsd` | `number` | Only jobs whose posted hourly ceiling reaches this (1 to 1000) |
| `sort` | `"mixed" \| "newest" \| "highest_pay"` | Default `"mixed"` |
| `limit` | `number` | 1 to 25, default 10 |

Returns `{ total, pay, jobs, more, text }`. `total` counts every match, `jobs` holds the ones returned. Each job has `title`, `employer`, `via`, `kind`, `pay`, `schedule`, `facility`, `location`, `listed`, `url` (its page on CareJobs.Now, where the user applies) and `employer_page`.

### `getPay(options?)`

What jobs post as hourly pay, measured from open jobs (before shift differentials and bonuses). The answer depends on the options, and the types follow:

```ts
await cj.getPay();                                              // every kind of job
await cj.getPay({ kind: "nurses" });                            // one kind, plus the employers posting the most
await cj.getPay({ employer: "kaiser-permanente" });             // one employer, overall and by kind
await cj.getPay({ kind: "nurses", employer: "kaiser-permanente" });
```

"Typical" pay runs from the 25th percentile of what jobs pay to the 90th-percentile advertised ceiling. A market rate is reported only where at least three employers post a rate (`market_rate`).

### `getJobMarket()`

How many healthcare jobs are open, how many were first listed in the last 7 days, and the open jobs by kind, by state and by employer.

### `getJobsByState(options?)`

```ts
await cj.getJobsByState();                                 // every state
await cj.getJobsByState({ state: "TX", limit: 5 });        // one state: kinds, pay, towns, employers, newest jobs
await cj.getJobsByState({ state: "OH", kind: "nursing-assistants" });
```

`kind` needs a `state`. `limit` (1 to 25) is how many of the newest jobs to return.

### `listEmployers(options?)`

Employers, AI-training programs and job boards the site reads, most open jobs first. Options: `query`, `type` (`"employer" | "ai-program" | "job-board"`), `care` (see `CARE_TYPES`), `state`, `kind`, `limit` (1 to 100, default 20).

### `getEmployer(slug)`

One employer by slug or name: what it is, where it hires, open jobs by kind, posted pay, newest and best-paid jobs, and links to its page, every open job and its own careers site.

### Kinds

`Kind` is a string-literal union, and `KINDS` is the same list as an array:

```
nurses, nurse-practitioners, physicians, nursing-assistants, caregivers,
therapy-rehab, mental-health, pharmacy, imaging, lab, surgical-techs,
emts-paramedics, medical-assistants, dental, admin, allied-health, ai-training
```

The types are derived from the live `tools/list` schemas, and a test checks them against the live server.

### Errors

Every failure is a `CareJobsError` with a `code`:

| `code` | Meaning |
| --- | --- |
| `tool` | The server ran the tool and answered with an error (unknown kind, unknown employer). `message` is the server's explanation. |
| `rpc` | JSON-RPC error (`rpcCode` is set) |
| `http` | Non-2xx HTTP status (`status` is set) |
| `network` | The request never completed |
| `timeout` | No answer within `timeoutMs` |
| `protocol` | The answer was not the MCP shape |

```ts
import { CareJobs, CareJobsError } from "carejobs";

try {
  await new CareJobs().getEmployer("no-such-employer");
} catch (error) {
  if (error instanceof CareJobsError && error.code === "tool") console.error(error.message);
  else throw error;
}
```

The client does not retry. Wrap calls yourself if you need that.

### Low level

`cj.listTools()` returns the server's tools with their input schemas, and `cj.callTool(name, args)` calls any tool by name (arguments in the API's snake_case), for tools added after this version.

## Command line

```sh
carejobs search "icu nurse" --state TX --limit 5
carejobs pay --kind nurses
carejobs market
carejobs state TX
carejobs employers --query kaiser
carejobs employer kaiser-permanente
```

| Command | Options |
| --- | --- |
| `search [words]` | `--kind` `--employer` `--state` `--remote` `--min-hourly USD` `--sort` `--limit` |
| `pay` | `--kind` `--employer` |
| `market` | |
| `state [STATE]` | `--kind` `--limit` |
| `employers [words]` | `--query` `--type` `--care` `--state` `--kind` `--limit` |
| `employer SLUG` | |

Options for every command: `--json` prints the raw data as JSON instead of the readable summary, `--base-url`, `--timeout SECONDS`, `--help`, `--version`.

`--kind` takes the exact kinds above and common short names (`rn`, `cna`, `np`, `doctor`, `registered-nurse` and a few more). The exit code is 0 on success, 1 when the API answers with an error, and 2 for bad usage.

## About the data

Jobs are read daily from the career sites of US hospitals, health systems and care employers. Pay is the hourly rate the employer posts, not a survey of what everyone in a field earns, and only jobs that post a rate count toward it. The board covers the employers it reads, not the whole labor market. Method: <https://carejobs.now/methodology>.

The CareJobs.Now data files (`/roles.json` and `/pay.json`) are published under CC BY 4.0, so credit CareJobs.Now when you use the numbers. See <https://carejobs.now/data> for the files, the OpenAPI description and the current terms.

## Links

- Site: <https://carejobs.now>
- Data and API docs: <https://carejobs.now/data>
- MCP server: <https://carejobs.now/api/mcp>
- OpenAPI spec: <https://github.com/yumaheymans/carejobs-mcp>
- Python package: `pip install carejobs`

## License

MIT, Copyright 2026 CareJobs.Now. The license covers this package's code, not the data it fetches.
