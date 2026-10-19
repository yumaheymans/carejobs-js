import { parseArgs } from "node:util";
import { CareJobs, CareJobsError } from "./client.js";
import { CARE_TYPES, EMPLOYER_TYPES, KINDS, SORTS } from "./types.js";
import type { Care, EmployerType, Kind, Sort } from "./types.js";
import { VERSION } from "./version.js";

export interface CliIo {
  out(text: string): void;
  err(text: string): void;
}

const defaultIo: CliIo = {
  out: (text) => void process.stdout.write(text),
  err: (text) => void process.stderr.write(text),
};

const HELP = `carejobs ${VERSION}: search US healthcare jobs and the pay employers post (https://carejobs.now)

Usage:
  carejobs search [words] [options]   Search open jobs
  carejobs pay [options]              Posted hourly pay
  carejobs market                     How many jobs are open, by kind, state and employer
  carejobs state [STATE] [options]    Open jobs in one state (no state: every state)
  carejobs employers [words] [opts]   List employers, most open jobs first
  carejobs employer SLUG              One employer

Options by command:
  search     --kind K  --employer E  --state S  --remote  --min-hourly USD
             --sort mixed|newest|highest_pay  --limit N (1 to 25)
  pay        --kind K  --employer E
  state      --kind K  --limit N (1 to 25)
  employers  --query Q  --type employer|ai-program|job-board  --care C
             --state S  --kind K  --limit N (1 to 100)

Options for every command:
  --json          Print the raw data as JSON instead of a readable summary
  --base-url URL  API host (default https://carejobs.now)
  --timeout SEC   Give up after this many seconds (default 30)
  -h, --help      Show this help
  -v, --version   Show the version

Examples:
  carejobs search "icu nurse" --state TX --limit 5
  carejobs pay --kind nurses
  carejobs state TX --kind nursing-assistants
  carejobs employers --query kaiser
  carejobs employer kaiser-permanente --json

Kinds: ${KINDS.join(", ")}
Common short names work too (rn, cna, np, doctor, ...).
Care types: ${CARE_TYPES.join(", ")}
No API key needed. MCP server: https://carejobs.now/api/mcp
`;

/** Short names people type for a kind. The API itself only knows the exact kinds. */
const KIND_ALIASES: Record<string, Kind> = {
  "registered-nurse": "nurses",
  "registered-nurses": "nurses",
  nurse: "nurses",
  rn: "nurses",
  lpn: "nurses",
  lvn: "nurses",
  np: "nurse-practitioners",
  nps: "nurse-practitioners",
  pa: "nurse-practitioners",
  pas: "nurse-practitioners",
  "nurse-practitioner": "nurse-practitioners",
  "physician-assistant": "nurse-practitioners",
  doctor: "physicians",
  doctors: "physicians",
  physician: "physicians",
  cna: "nursing-assistants",
  cnas: "nursing-assistants",
  pct: "nursing-assistants",
  "nursing-assistant": "nursing-assistants",
  caregiver: "caregivers",
  "home-health-aide": "caregivers",
  therapy: "therapy-rehab",
  therapist: "therapy-rehab",
  "mental-health-care": "mental-health",
  pharmacist: "pharmacy",
  "surgical-tech": "surgical-techs",
  surgical: "surgical-techs",
  ems: "emts-paramedics",
  emt: "emts-paramedics",
  paramedic: "emts-paramedics",
  "medical-assistant": "medical-assistants",
  ma: "medical-assistants",
};

class UsageError extends Error {}

type Command = "search" | "pay" | "market" | "state" | "employers" | "employer";

const ALLOWED: Record<Command, readonly string[]> = {
  search: ["kind", "employer", "state", "remote", "min-hourly", "sort", "limit", "query"],
  pay: ["kind", "employer"],
  market: [],
  state: ["state", "kind", "limit"],
  employers: ["query", "type", "care", "state", "kind", "limit"],
  employer: [],
};

function isCommand(name: string): name is Command {
  return Object.prototype.hasOwnProperty.call(ALLOWED, name);
}

function parseKind(input: string): Kind {
  const key = input.trim().toLowerCase().replace(/[\s_]+/g, "-");
  const exact = KINDS.find((kind) => kind === key);
  if (exact) return exact;
  const alias = KIND_ALIASES[key];
  if (alias) return alias;
  throw new UsageError(`Unknown kind '${input}'. Use one of: ${KINDS.join(", ")}.`);
}

function parseChoice<T extends string>(flag: string, input: string, choices: readonly T[]): T {
  const key = input.trim().toLowerCase();
  const match = choices.find((choice) => choice === key);
  if (!match) throw new UsageError(`Unknown --${flag} '${input}'. Use one of: ${choices.join(", ")}.`);
  return match;
}

function parsePositiveInt(flag: string, input: string): number {
  if (!/^\d+$/.test(input) || Number(input) < 1) {
    throw new UsageError(`--${flag} needs a whole number of 1 or more, not '${input}'.`);
  }
  return Number(input);
}

function parseSeconds(input: string): number {
  const seconds = Number(input);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new UsageError(`--timeout needs a number of seconds above 0, not '${input}'.`);
  }
  return Math.round(seconds * 1000);
}

/** Run the CLI. Returns the exit code: 0 ok, 1 the API answered with an error, 2 bad usage. */
export async function runCli(argv: string[], io: CliIo = defaultIo): Promise<number> {
  try {
    return await execute(argv, io);
  } catch (error) {
    if (error instanceof UsageError) {
      io.err(`carejobs: ${error.message}\nRun 'carejobs --help' for usage.\n`);
      return 2;
    }
    if (error instanceof CareJobsError) {
      io.err(`carejobs: ${error.message}\n`);
      return 1;
    }
    throw error;
  }
}

async function execute(argv: string[], io: CliIo): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
        json: { type: "boolean" },
        "base-url": { type: "string" },
        timeout: { type: "string" },
        kind: { type: "string" },
        employer: { type: "string" },
        state: { type: "string" },
        remote: { type: "boolean" },
        "min-hourly": { type: "string" },
        sort: { type: "string" },
        limit: { type: "string" },
        query: { type: "string" },
        type: { type: "string" },
        care: { type: "string" },
      },
    });
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message.split(".")[0] ?? "Bad arguments" : "Bad arguments");
  }
  const { values, positionals } = parsed;

  if (values.help || positionals[0] === "help") {
    io.out(HELP);
    return 0;
  }
  if (values.version) {
    io.out(`${VERSION}\n`);
    return 0;
  }
  const name = positionals[0];
  if (name === undefined) {
    io.err(HELP);
    return 2;
  }
  if (!isCommand(name)) {
    throw new UsageError(`Unknown command '${name}'.`);
  }
  const args = positionals.slice(1);

  for (const flag of Object.keys(values)) {
    if (["json", "base-url", "timeout", "help", "version"].includes(flag)) continue;
    if (!ALLOWED[name].includes(flag)) throw new UsageError(`'${name}' does not take --${flag}.`);
  }

  const client = new CareJobs({
    ...(values["base-url"] ? { baseUrl: values["base-url"] } : {}),
    ...(values.timeout ? { timeoutMs: parseSeconds(values.timeout) } : {}),
    userAgent: `carejobs-cli/${VERSION}`,
  });
  const kind = values.kind === undefined ? undefined : parseKind(values.kind);
  const limit = values.limit === undefined ? undefined : parsePositiveInt("limit", values.limit);

  let result: { text: string };
  switch (name) {
    case "search": {
      const query = args.join(" ") || values.query;
      const minHourly = values["min-hourly"] === undefined ? undefined : parsePositiveInt("min-hourly", values["min-hourly"]);
      const sort: Sort | undefined = values.sort === undefined ? undefined : parseChoice("sort", values.sort, SORTS);
      result = await client.searchJobs({
        ...(query ? { query } : {}),
        ...(kind ? { kind } : {}),
        ...(values.employer ? { employer: values.employer } : {}),
        ...(values.state ? { state: values.state } : {}),
        ...(values.remote ? { remote: true } : {}),
        ...(minHourly === undefined ? {} : { minHourlyUsd: minHourly }),
        ...(sort ? { sort } : {}),
        ...(limit === undefined ? {} : { limit }),
      });
      break;
    }
    case "pay": {
      if (args.length) throw new UsageError(`'pay' takes no arguments, only --kind and --employer.`);
      result = await client.getPay({
        ...(kind ? { kind } : {}),
        ...(values.employer ? { employer: values.employer } : {}),
      });
      break;
    }
    case "market": {
      if (args.length) throw new UsageError(`'market' takes no arguments.`);
      result = await client.getJobMarket();
      break;
    }
    case "state": {
      if (args.length > 1) throw new UsageError(`'state' takes one state, e.g. 'carejobs state TX'.`);
      const state = args[0] ?? values.state;
      result = await client.getJobsByState({
        ...(state ? { state } : {}),
        ...(kind ? { kind } : {}),
        ...(limit === undefined ? {} : { limit }),
      });
      break;
    }
    case "employers": {
      const query = args.join(" ") || values.query;
      const type: EmployerType | undefined = values.type === undefined ? undefined : parseChoice("type", values.type, EMPLOYER_TYPES);
      const care: Care | undefined = values.care === undefined ? undefined : parseChoice("care", values.care, CARE_TYPES);
      result = await client.listEmployers({
        ...(query ? { query } : {}),
        ...(type ? { type } : {}),
        ...(care ? { care } : {}),
        ...(values.state ? { state: values.state } : {}),
        ...(kind ? { kind } : {}),
        ...(limit === undefined ? {} : { limit }),
      });
      break;
    }
    case "employer": {
      const slug = args[0];
      if (!slug || args.length > 1) throw new UsageError(`'employer' takes one slug, e.g. 'carejobs employer kaiser-permanente'.`);
      result = await client.getEmployer(slug);
      break;
    }
  }

  if (values.json) {
    const { text: _text, ...data } = result as { text: string } & Record<string, unknown>;
    io.out(`${JSON.stringify(data, null, 2)}\n`);
  } else {
    io.out(result.text.endsWith("\n") ? result.text : `${result.text}\n`);
  }
  return 0;
}
