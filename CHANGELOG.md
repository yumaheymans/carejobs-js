# Changelog

All notable changes to this package are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-10-19

### Added

- `CareJobs` client with `searchJobs`, `getPay`, `getJobMarket`, `getJobsByState`,
  `listEmployers` and `getEmployer`, each returning the typed data of the
  CareJobs.Now MCP tool plus the readable summary as `.text`.
- Low-level `listTools()` and `callTool()` for any tool the server adds later.
- `CareJobsError` with a `code` of `tool`, `rpc`, `http`, `network`, `timeout` or
  `protocol`.
- Types derived from the live `tools/list` schemas, with job kinds as a
  string-literal union (`Kind`, `KINDS`).
- `carejobs` command line tool: `search`, `pay`, `market`, `state`, `employers`
  and `employer`, with a readable default and `--json` for raw output.
- Zero runtime dependencies. Node 18 or newer.

[1.0.0]: https://github.com/yumaheymans/carejobs-js/releases/tag/v1.0.0
