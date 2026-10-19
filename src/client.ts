import type {
  Employer,
  EmployerList,
  GetJobsByStateOptions,
  GetPayOptions,
  JobMarket,
  Kind,
  ListEmployersOptions,
  PayByEmployer,
  PayByEmployerAndKind,
  PayByKind,
  PayOverview,
  PayResult,
  SearchJobsOptions,
  SearchJobsResult,
  StateDetail,
  StateKindDetail,
  StateResult,
  StatesOverview,
  ToolInfo,
  WithText,
} from "./types.js";
import { VERSION } from "./version.js";

export const DEFAULT_BASE_URL = "https://carejobs.now";
export const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Where an error came from:
 * - `tool`: the server ran the tool and answered `isError` (bad kind, unknown employer, ...).
 * - `rpc`: a JSON-RPC error (unknown tool, malformed request).
 * - `http`: a non-2xx HTTP status.
 * - `network`: the request never completed (DNS, connection reset, ...).
 * - `timeout`: no answer within `timeoutMs`.
 * - `protocol`: the answer was not the shape the MCP protocol promises.
 */
export type CareJobsErrorCode = "tool" | "rpc" | "http" | "network" | "timeout" | "protocol";

export interface CareJobsErrorInit {
  code: CareJobsErrorCode;
  /** HTTP status, for `http` errors. */
  status?: number;
  /** The tool that was called. */
  tool?: string;
  /** The JSON-RPC error code, for `rpc` errors. */
  rpcCode?: number;
  cause?: unknown;
}

export class CareJobsError extends Error {
  readonly code: CareJobsErrorCode;
  readonly status: number | undefined;
  readonly tool: string | undefined;
  readonly rpcCode: number | undefined;

  constructor(message: string, init: CareJobsErrorInit) {
    super(message, init.cause === undefined ? undefined : { cause: init.cause });
    this.name = "CareJobsError";
    this.code = init.code;
    this.status = init.status;
    this.tool = init.tool;
    this.rpcCode = init.rpcCode;
  }
}

export interface CareJobsOptions {
  /** Default "https://carejobs.now". The MCP endpoint is `${baseUrl}/api/mcp`. */
  baseUrl?: string;
  /** Give up on a request after this many milliseconds. Default 30000. */
  timeoutMs?: number;
  /** Sent as the User-Agent header. Default "carejobs-js/<version>". */
  userAgent?: string;
  /** A fetch implementation to use instead of the global one. */
  fetch?: typeof fetch;
}

interface JsonRpcResponse {
  jsonrpc?: string;
  id?: number | string | null;
  result?: unknown;
  error?: { code?: number; message?: string };
}

interface ToolCallResult {
  content?: Array<{ type?: string; text?: string }>;
  structuredContent?: unknown;
  isError?: boolean;
}

function dropUndefined(args: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/** Read the JSON-RPC message out of a plain JSON body or a text/event-stream body. */
function parseBody(body: string, contentType: string, id: number): JsonRpcResponse {
  if (contentType.includes("text/event-stream")) {
    let fallback: JsonRpcResponse | undefined;
    for (const event of body.split(/\r?\n\r?\n/)) {
      const data = event
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /, ""))
        .join("\n");
      if (!data) continue;
      let message: JsonRpcResponse;
      try {
        message = JSON.parse(data) as JsonRpcResponse;
      } catch {
        continue;
      }
      if (message.id === id) return message;
      if (message.result !== undefined || message.error !== undefined) fallback ??= message;
    }
    if (fallback) return fallback;
    throw new CareJobsError("The event stream held no JSON-RPC answer", { code: "protocol" });
  }
  try {
    return JSON.parse(body) as JsonRpcResponse;
  } catch (cause) {
    throw new CareJobsError("The server did not answer with JSON", { code: "protocol", cause });
  }
}

/** Client for the CareJobs.Now healthcare jobs API (a remote MCP server, no key needed). */
export class CareJobs {
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly userAgent: string;
  private readonly fetchImpl: typeof fetch;
  private nextId = 1;

  constructor(options: CareJobsOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.userAgent = options.userAgent ?? `carejobs-js/${VERSION}`;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    if (typeof this.fetchImpl !== "function") {
      throw new CareJobsError("No global fetch: use Node 18 or newer, or pass options.fetch", {
        code: "network",
      });
    }
  }

  /** Search open healthcare jobs. Every filter is optional. */
  searchJobs(options: SearchJobsOptions = {}): Promise<WithText<SearchJobsResult>> {
    const { minHourlyUsd, ...rest } = options;
    return this.callTool<SearchJobsResult>(
      "search_healthcare_jobs",
      dropUndefined({ ...rest, min_hourly_usd: minHourlyUsd }),
    );
  }

  /**
   * What healthcare jobs post as hourly pay. The answer depends on the options:
   * none gives every kind of job, `kind` one kind with its best-paying employers,
   * `employer` one employer by kind, both that employer's pay for that kind.
   */
  getPay(options?: { kind?: undefined; employer?: undefined }): Promise<WithText<PayOverview>>;
  getPay(options: { kind: Kind; employer?: undefined }): Promise<WithText<PayByKind>>;
  getPay(options: { kind?: undefined; employer: string }): Promise<WithText<PayByEmployer>>;
  getPay(options: { kind: Kind; employer: string }): Promise<WithText<PayByEmployerAndKind>>;
  getPay(options: GetPayOptions): Promise<WithText<PayResult>>;
  getPay(options: GetPayOptions = {}): Promise<WithText<PayResult>> {
    return this.callTool<PayResult>("get_healthcare_pay", dropUndefined(options));
  }

  /** How many healthcare jobs are open, by kind of job, state and employer. */
  getJobMarket(): Promise<WithText<JobMarket>> {
    return this.callTool<JobMarket>("get_healthcare_job_market", {});
  }

  /**
   * Open jobs by state. No state gives every state, a state gives its jobs by kind,
   * pay, towns, employers and newest jobs, a state and a kind the same for that kind.
   */
  getJobsByState(options?: { state?: undefined; kind?: undefined; limit?: number }): Promise<WithText<StatesOverview>>;
  getJobsByState(options: { state: string; kind?: undefined; limit?: number }): Promise<WithText<StateDetail>>;
  getJobsByState(options: { state: string; kind: Kind; limit?: number }): Promise<WithText<StateKindDetail>>;
  getJobsByState(options: GetJobsByStateOptions): Promise<WithText<StateResult>>;
  getJobsByState(options: GetJobsByStateOptions = {}): Promise<WithText<StateResult>> {
    return this.callTool<StateResult>("get_healthcare_jobs_by_state", dropUndefined(options));
  }

  /** The employers (and AI-training programs and job boards) the site reads, most open jobs first. */
  listEmployers(options: ListEmployersOptions = {}): Promise<WithText<EmployerList>> {
    return this.callTool<EmployerList>("list_healthcare_employers", dropUndefined(options));
  }

  /** One employer by slug (e.g. "kaiser-permanente") or name. */
  getEmployer(slug: string): Promise<WithText<Employer>> {
    return this.callTool<Employer>("get_healthcare_employer", { employer: slug });
  }

  /** The tools the server offers, with their input schemas. */
  async listTools(): Promise<ToolInfo[]> {
    const result = (await this.rpc("tools/list", {})) as { tools?: ToolInfo[] } | undefined;
    if (!result || !Array.isArray(result.tools)) {
      throw new CareJobsError("tools/list answered without a tools array", { code: "protocol" });
    }
    return result.tools;
  }

  /** Call any tool by name. The typed methods above are built on this. */
  async callTool<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<WithText<T>> {
    const raw = (await this.rpc("tools/call", { name, arguments: args }, name)) as ToolCallResult | undefined;
    if (!raw || typeof raw !== "object") {
      throw new CareJobsError(`${name} answered without a result`, { code: "protocol", tool: name });
    }
    const text = (raw.content ?? [])
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text as string)
      .join("\n");
    if (raw.isError) {
      throw new CareJobsError(text || `${name} failed`, { code: "tool", tool: name });
    }
    const data = raw.structuredContent;
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
      throw new CareJobsError(`${name} answered without structured content`, { code: "protocol", tool: name });
    }
    return { ...(data as T), text } as WithText<T>;
  }

  private async rpc(method: string, params: Record<string, unknown>, tool?: string): Promise<unknown> {
    const id = this.nextId++;
    const url = `${this.baseUrl}/api/mcp`;
    let response: Response;
    let body: string;
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "User-Agent": this.userAgent,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      body = await response.text();
    } catch (cause) {
      const name = cause instanceof Error ? cause.name : "";
      if (name === "TimeoutError" || name === "AbortError") {
        throw new CareJobsError(`No answer from ${url} within ${this.timeoutMs} ms`, {
          code: "timeout",
          ...(tool ? { tool } : {}),
          cause,
        });
      }
      const detail = cause instanceof Error ? cause.message : String(cause);
      throw new CareJobsError(`Could not reach ${url}: ${detail}`, {
        code: "network",
        ...(tool ? { tool } : {}),
        cause,
      });
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const message = parseBody(body, contentType, id);
        if (message.error?.message) detail += `: ${message.error.message}`;
      } catch {
        if (body.trim()) detail += `: ${body.trim().slice(0, 200)}`;
      }
      throw new CareJobsError(detail, {
        code: "http",
        status: response.status,
        ...(tool ? { tool } : {}),
      });
    }

    const message = parseBody(body, contentType, id);
    if (message.error) {
      throw new CareJobsError(message.error.message ?? "JSON-RPC error", {
        code: "rpc",
        ...(message.error.code === undefined ? {} : { rpcCode: message.error.code }),
        ...(tool ? { tool } : {}),
      });
    }
    return message.result;
  }
}
