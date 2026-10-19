/**
 * Types for the CareJobs.Now MCP tools.
 *
 * The enums below are copied from the `inputSchema` of the live `tools/list`
 * answer at https://carejobs.now/api/mcp. A test compares them with the live
 * server, so drift is caught instead of shipped.
 */

/** Kinds of healthcare job (the `kind` enum of every tool that takes one). */
export const KINDS = [
  "nurses",
  "nurse-practitioners",
  "physicians",
  "nursing-assistants",
  "caregivers",
  "therapy-rehab",
  "mental-health",
  "pharmacy",
  "imaging",
  "lab",
  "surgical-techs",
  "emts-paramedics",
  "medical-assistants",
  "dental",
  "admin",
  "allied-health",
  "ai-training",
] as const;
export type Kind = (typeof KINDS)[number];

/** Kinds of care for `listEmployers({ care })`. */
export const CARE_TYPES = [
  "health-system",
  "childrens-hospital",
  "outpatient",
  "specialty-care",
  "behavioral-health",
  "autism-care",
  "home-care",
  "senior-care",
  "rehab",
  "dental",
  "pharmacy-retail",
  "kidney-care",
  "labs-imaging",
  "telehealth",
  "staffing",
  "ai-training",
  "job-boards",
] as const;
export type Care = (typeof CARE_TYPES)[number];

/** What an entry is: an employer, an AI-training program or a job board. */
export const EMPLOYER_TYPES = ["employer", "ai-program", "job-board"] as const;
export type EmployerType = (typeof EMPLOYER_TYPES)[number];

/** Sort orders for `searchJobs({ sort })`. */
export const SORTS = ["mixed", "newest", "highest_pay"] as const;
export type Sort = (typeof SORTS)[number];

/** Every answer also carries the readable summary the server writes. */
export type WithText<T> = T & {
  /** The server's readable plain-text summary of the answer. */
  readonly text: string;
};

// ---------------------------------------------------------------------------
// Options (camelCase here, snake_case on the wire)
// ---------------------------------------------------------------------------

export interface SearchJobsOptions {
  /** Words every job must carry in its title, place, department or schedule, e.g. "ICU", "night". */
  query?: string;
  kind?: Kind;
  /** An employer, AI-training program or job board: its slug (e.g. "kaiser-permanente") or its name. */
  employer?: string;
  /** A US state: two-letter code ("TX") or name ("Texas"). */
  state?: string;
  /** Only remote (work-from-home) jobs. */
  remote?: boolean;
  /** Only jobs whose posted hourly ceiling reaches this many US dollars (1 to 1000). */
  minHourlyUsd?: number;
  /** Default "mixed" (the board's order, employers interleaved). */
  sort?: Sort;
  /** How many jobs to return (1 to 25, default 10). */
  limit?: number;
}

export interface GetPayOptions {
  kind?: Kind;
  /** An employer slug or name. */
  employer?: string;
}

export interface GetJobsByStateOptions {
  /** A US state: two-letter code or name. Leave out for every state. */
  state?: string;
  /** Needs a state. */
  kind?: Kind;
  /** How many of the newest jobs to return for a state (1 to 25, default 10). */
  limit?: number;
}

export interface ListEmployersOptions {
  /** Part of the name, e.g. "Kaiser". */
  query?: string;
  type?: EmployerType;
  care?: Care;
  /** Employers with open jobs in this US state. */
  state?: string;
  /** Employers with open jobs of this kind. */
  kind?: Kind;
  /** How many to return (1 to 100, default 20). */
  limit?: number;
}

// ---------------------------------------------------------------------------
// Answers (the `structuredContent` of each tool)
// ---------------------------------------------------------------------------

/** Posted hourly pay (US dollars) measured from open jobs. */
export interface PayStats {
  median: number;
  /** 25th percentile of what jobs pay (the middle of each advertised range). */
  typical_low: number;
  /** 90th-percentile advertised ceiling. */
  typical_high: number;
  /** Distinct posted hourly rates that went in. */
  rate_samples: number;
  employers: number;
  open_jobs: number;
  /** Open jobs that post no hourly rate. */
  no_rate: number;
  /** True only where at least three employers post a rate. */
  market_rate: boolean;
}

/** One open job as `searchJobs` and `getEmployer` return it. */
export interface Job {
  title: string;
  employer: string;
  /** The job board it was read through, when it is another employer's job. */
  via: string | null;
  /** Label of the kind of job, e.g. "Nurses". */
  kind: string;
  /** Posted pay as text, or null when the posting states none. */
  pay: string | null;
  schedule: string[];
  facility: string | null;
  location: string;
  /** ISO date (YYYY-MM-DD) the job was first listed. */
  listed: string;
  /** The job's page on CareJobs.Now, where the user applies. */
  url: string;
  employer_page: string | null;
}

export interface SearchJobsResult {
  /** Open jobs that match the filters (all of them, not just those returned). */
  total: number;
  /** Posted pay across all matching jobs, or null when none post a rate. */
  pay: {
    typical_low: number;
    typical_high: number;
    median: number;
    rate_samples: number;
    /** Matching jobs that post an hourly rate. */
    priced: number;
    /** Matching jobs. */
    open: number;
  } | null;
  jobs: Job[];
  /** The same search on the CareJobs.Now site. */
  more: string;
}

export interface KindPay extends PayStats {
  kind: Kind;
  label: string;
}

export interface PayOverview {
  as_of: string;
  typical_pay_definition: string;
  board: Omit<PayStats, "market_rate">;
  pay_by_kind: KindPay[];
  /** Kinds without a market rate (fewer than three employers post one). */
  no_market_rate: unknown[];
}

export interface EmployerPay extends PayStats {
  slug: string;
  name: string;
}

export interface PayByKind {
  as_of: string;
  kind: Kind;
  open_jobs: number;
  pay: PayStats;
  /** The employers posting the most for this kind of job. */
  best_paying: EmployerPay[];
}

export interface PayByEmployer {
  as_of: string;
  employer: string;
  pay: PayStats;
  pay_text: string | null;
  by_kind: Array<PayStats & { kind: Kind }>;
}

export interface PayByEmployerAndKind {
  as_of: string;
  employer: string;
  kind: Kind;
  open_jobs: number;
  pay: PayStats;
}

export type PayResult = PayOverview | PayByKind | PayByEmployer | PayByEmployerAndKind;

export interface JobMarket {
  open_jobs: number;
  /** Employers and job boards with one or more open jobs. */
  sources_live: number;
  new_last_7d: number;
  new_per_week: number | null;
  /** ISO 8601 timestamp (UTC) of the latest read of the employers' career sites. */
  updated: string;
  open_by_kind: Array<{ slug: Kind; label: string; open_jobs: number }>;
  open_by_state: Array<{ code: string; name: string; open_jobs: number; url: string }>;
  open_by_employer: Array<{ slug: string; name: string; type: EmployerType; open_jobs: number }>;
}

export interface StateOverviewEntry {
  code: string;
  name: string;
  open_jobs: number;
  employers: number;
  top_kinds: Array<{ kind: Kind; label: string; open_jobs: number }>;
  url: string;
}

export interface StatesOverview {
  states: StateOverviewEntry[];
}

/** A newest-job row in a state answer. */
export interface StateJob {
  title: string;
  employer: string;
  /** Where the job is, e.g. "Dallas, TX". */
  where: string;
  pay: string | null;
  listed: string;
  url: string;
}

export interface StateTown {
  /** The town's name. */
  key: string;
  jobs: number;
  slug?: string;
}

export interface StateEmployer {
  /** The employer's slug. */
  key: string;
  jobs: number;
}

export interface StateDetail {
  /** Two-letter state code. */
  state: string;
  name: string;
  open_jobs: number;
  employers: number;
  url: string;
  by_kind: Array<{ kind: Kind; label: string; open_jobs: number; url: string }>;
  pay_by_kind: Array<{
    kind: Kind;
    p25: number;
    median: number;
    p75: number;
    jobs_with_rate: number;
    employers: number;
  }>;
  towns: StateTown[];
  hiring: StateEmployer[];
  newest: StateJob[];
}

export interface StateKindDetail {
  state: string;
  kind: Kind;
  open_jobs: number;
  employers: number;
  url: string;
  /** Hourly pay quartiles, or null when no job in this slice posts a rate. */
  pay: { p25: number; median: number; p75: number; jobs_with_rate: number } | null;
  towns: StateTown[];
  hiring: StateEmployer[];
  newest: StateJob[];
}

export type StateResult = StatesOverview | StateDetail | StateKindDetail;

export interface EmployerSummary {
  slug: string;
  name: string;
  type: EmployerType;
  /** Business model, e.g. "Integrated health system". */
  model: string;
  /** Label of the kind of care, e.g. "Hospitals & health systems". */
  care: string;
  hq: string | null;
  /** Two-letter codes of the states it hires in. */
  states: string[];
  open_jobs: number;
  /** Median of the hourly rates its open jobs post, or null. */
  posted_median_hourly: number | null;
  url: string;
}

export interface EmployerList {
  total: number;
  entries: EmployerSummary[];
}

export interface Employer {
  slug: string;
  name: string;
  type: EmployerType;
  model: string;
  care: string;
  hq: string | null;
  states: string[];
  open_jobs: number;
  open_by_kind: Array<{
    kind: Kind;
    label: string;
    open_jobs: number;
    pay: PayStats | null;
  }>;
  pay: PayStats | null;
  pay_text: string | null;
  newest: Job[];
  best_paid: Job[];
  /** The employer's page on CareJobs.Now. */
  url: string;
  /** Every open job of the employer on CareJobs.Now. */
  jobs_url: string | null;
  /** The employer's own careers site. */
  careers_url: string | null;
}

/** One tool as `tools/list` describes it. */
export interface ToolInfo {
  name: string;
  title?: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}
