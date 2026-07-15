import { Command } from "commander";
import { jsonrepair } from "jsonrepair";
// Ajv2020 supports draft 2020-12 — the `$schema` of the shared Grilling schema.
import Ajv2020 from "ajv/dist/2020.js";
import { apiClient, readInput } from "./api";
import { randomUUID } from "node:crypto";
// Single source of truth for the Grilling schema: import the same JSON Schema
// file the server validates against (DESIGN.md §1080, decision #14). esbuild
// natively bundles JSON imports, so the schema is compiled into the single-
// file dist with no external file dependency.
import grillingSchema from "../../server/schemas/grilling.json" with { type: "json" };

// Ctrl-C → exit code 2 (per spec)
process.on("SIGINT", () => {
  process.exit(2);
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GrillingQuestion {
  id: string;
  header: string;
  text: string;
  type: "single" | "multi" | "text";
  options?: { label: string; description?: string }[];
  recommended?: number;
  variant?: "default" | "yesno" | "rating";
  rating_max?: number;
  placeholder?: string;
  max_length?: number;
  required?: boolean;
  allow_custom_text?: boolean;
  explanation?: string;
}

interface Grilling {
  name: string;
  description?: string;
  additional_notes?: {
    label?: string;
    placeholder?: string;
    max_length?: number;
    required?: boolean;
  };
  questions: GrillingQuestion[];
}

interface CreateResponse {
  session_id: string;
  url: string;
  status: string;
  current_round: number;
  name?: string;
  description?: string;
  created_at: string;
  expires_at: string;
}

interface RoundResponse {
  round: number;
  name?: string;
  grilling: Grilling;
  response: unknown;
}

interface SessionResponse {
  session_id: string;
  status: string;
  current_round: number;
  name?: string;
  created_at: string;
  expires_at: string;
}

interface RoundSummary {
  round: number;
  name?: string;
  has_response: boolean;
}

interface PollResponse {
  round: number;
  answers: Record<string, { selected: string | string[]; custom_text?: string }>;
  additional_notes?: string;
  submitted_at: string;
}

// ---------------------------------------------------------------------------
// AJV setup — schema is imported from server/schemas (single source of truth).
// ---------------------------------------------------------------------------

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateGrilling = ajv.compile(grillingSchema);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function errExit(message: string, code: number): never {
  process.stderr.write(`error: ${message}\n`);
  process.exit(code);
}

function warnStderr(message: string): void {
  process.stderr.write(`warning: ${message}\n`);
}

/**
 * Parse and repair JSON input. Applies jsonrepair first, then validates
 * against the Grilling schema, then checks for duplicate question IDs.
 */
function parseGrilling(raw: string): Grilling {
  // Strip markdown fences if present
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  // Repair JSON syntax
  let repaired: string;
  try {
    repaired = jsonrepair(cleaned);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    errExit(`json repair failed: ${msg}`, 64);
  }

  // Parse
  let parsed: unknown;
  try {
    parsed = JSON.parse(repaired);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    errExit(`JSON parse error: ${msg}`, 64);
  }

  // Schema validation
  if (!validateGrilling(parsed)) {
    const errors = validateGrilling.errors
      ?.map((e) => `  ${e.instancePath || "/"}: ${e.message}`)
      .join("\n");
    errExit(`schema validation failed:\n${errors}`, 64);
  }

  // Duplicate question ID check
  const ids = new Set<string>();
  const grilling = parsed as unknown as Grilling;
  for (const q of grilling.questions) {
    if (ids.has(q.id)) {
      errExit(`duplicate question id: ${q.id}`, 64);
    }
    ids.add(q.id);
  }

  return grilling;
}

/**
 * Parse --json [fields] option.
 * Returns null if --json not specified, array of field names if specified.
 */
function parseJsonFields(value: string | boolean | undefined): string[] | null {
  if (value === undefined) return null;
  if (value === true) return null; // --json without value = all fields
  if (typeof value === "string" && value.trim() === "") return null;
  if (typeof value === "string") {
    return value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return null;
}

/**
 * Format output: either human-readable (stdout, default) or JSON (--json).
 *
 * DESIGN.md §1883, §2126-2136 — stdout holds the machine-parseable JSON when
 * --json is given; otherwise it holds human-readable text for the agent to
 * relay. stderr carries progress/warnings/errors. When --json is absent the
 * caller passes a `humanReadable` line writer so stdout is not polluted with
 * JSON that an agent would have to parse.
 */
function output(
  result: Record<string, unknown>,
  jsonFields: string[] | null,
  humanReadable?: () => string,
): void {
  if (jsonFields === null) {
    // Human-readable to stdout (default). Falls back to pretty JSON only when
    // no human-readable formatter was supplied (defensive).
    if (humanReadable) {
      process.stdout.write(humanReadable() + "\n");
    } else {
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    }
    return;
  }

  if (jsonFields.length === 0) {
    // --json (all fields)
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    // --json field1,field2 (subset)
    const subset: Record<string, unknown> = {};
    for (const f of jsonFields) {
      if (f in result) {
        subset[f] = result[f];
      } else {
        warnStderr(`unknown field: ${f}`);
      }
    }
    process.stdout.write(JSON.stringify(subset, null, 2) + "\n");
  }
}

/**
 * Extract error info from a ky HTTP error.
 */
async function extractHttpError(e: unknown): Promise<{ status: number; body: string }> {
  if (
    typeof e === "object" &&
    e !== null &&
    "response" in e &&
    e.response instanceof Response
  ) {
    const status = e.response.status;
    const body = await e.response.text().catch(() => "");
    return { status, body };
  }
  const msg = e instanceof Error ? e.message : String(e);
  return { status: 0, body: msg };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

const program = new Command();

program
  .name("grill")
  .description("grilling-sleek CLI — push structured questions to a web page")
  .version("0.2.0-rc.1");

// -- create ---------------------------------------------------------------

program
  .command("create")
  .description("Create a new session with first round of questions")
  .option("-f, --file <path>", "Input file path (default: stdin)")
  .option("-i, --inline <json>", "Inline JSON string")
  .option("-j, --json [fields]", "JSON output (optionally filter fields)")
  .option("-w, --wait <sec>", "Wait for response after creating (seconds)")
  .action(async (opts: { inline?: string; file?: string; json?: string | boolean; wait?: string }) => {
    let raw: string;
    if (opts.inline) {
      raw = opts.inline;
    } else {
      raw = await readInput(opts.file);
    }

    const grilling = parseGrilling(raw);
    const idempotencyKey = randomUUID();

    const client = apiClient("post", false, idempotencyKey);
    try {
      const resp = await client.post("sessions", { json: grilling }).json<CreateResponse>();

      const jsonFields = parseJsonFields(opts.json);
      output(
        resp as unknown as Record<string, unknown>,
        jsonFields,
        () => `Session created.\nURL: ${resp.url}`,
      );

      // If --wait, enter poll loop immediately (= create + poll, DESIGN.md §1894)
      if (opts.wait) {
        process.stderr.write("Waiting for user response...\n");
        await pollLoop(resp.session_id, resp.current_round, Number(opts.wait), jsonFields);
      }
    } catch (e: unknown) {
      const { status, body } = await extractHttpError(e);
      if (status > 0) {
        errExit(`API error ${status}: ${body}`, status === 429 ? 77 : 1);
      }
      errExit(`network error: ${body}`, 1);
    }
  });

// -- poll -----------------------------------------------------------------

program
  .command("poll <session_id>")
  .description("Wait for user response (long-poll loop)")
  .option("-r, --round <n>", "Specific round to poll (default: current)")
  .option("-w, --wait <sec>", "Total wait timeout (default: 600)", "600")
  .option("-j, --json [fields]", "JSON output")
  .action(async (sessionId: string, opts: { round?: string; wait: string; json?: string | boolean }) => {
    let round = opts.round ? Number(opts.round) : undefined;

    // If no round specified, get current_round
    if (round === undefined) {
      try {
        const client = apiClient("get");
        const session = await client.get(`sessions/${sessionId}`).json<SessionResponse>();
        round = session.current_round;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        errExit(`failed to get session: ${msg}`, 1);
      }
    }

    await pollLoop(sessionId, round, Number(opts.wait), parseJsonFields(opts.json));
  });

// -- push -----------------------------------------------------------------

program
  .command("push <session_id>")
  .description("Push the next round of questions")
  .option("-f, --file <path>", "Input file path (default: stdin)")
  .option("-i, --inline <json>", "Inline JSON string")
  .option("-j, --json [fields]", "JSON output")
  .option("-w, --wait <sec>", "Wait for response after pushing")
  .action(async (sessionId: string, opts: { inline?: string; file?: string; json?: string | boolean; wait?: string }) => {
    let raw: string;
    if (opts.inline) {
      raw = opts.inline;
    } else {
      raw = await readInput(opts.file);
    }

    const grilling = parseGrilling(raw);
    const idempotencyKey = randomUUID();

    const client = apiClient("post", false, idempotencyKey);
    try {
      const resp = await client
        .post(`sessions/${sessionId}/rounds`, { json: grilling })
        .json<RoundResponse>();

      const jsonFields = parseJsonFields(opts.json);
      output(
        resp as unknown as Record<string, unknown>,
        jsonFields,
        () => `Round ${resp.round} pushed.`,
      );

      if (opts.wait) {
        process.stderr.write("Waiting for user response...\n");
        await pollLoop(sessionId, resp.round, Number(opts.wait), jsonFields);
      }
    } catch (e: unknown) {
      const { status, body } = await extractHttpError(e);
      if (status > 0) {
        errExit(`API error ${status}: ${body}`, status === 429 ? 77 : 1);
      }
      errExit(`network error: ${body}`, 1);
    }
  });

// -- complete -------------------------------------------------------------

program
  .command("complete <session_id>")
  .description("Complete a session")
  .action(async (sessionId: string) => {
    // Check for unanswered rounds
    try {
      const client = apiClient("get");
      const rounds = await client
        .get(`sessions/${sessionId}/rounds`)
        .json<RoundSummary[]>();
      const unanswered = rounds.filter((r) => !r.has_response);
      if (unanswered.length > 0) {
        const nums = unanswered.map((r) => r.round).join(", ");
        warnStderr(
          `rounds [${nums}] have no response, will be archived as unanswered`,
        );
      }
    } catch {
      // Non-fatal, proceed with complete
    }

    const client = apiClient("patch");
    try {
      const resp = await client
        .patch(`sessions/${sessionId}`, { json: { status: "completed" } })
        .json<Record<string, unknown>>();
      output(
        resp,
        parseJsonFields(undefined),
        () => `Session ${sessionId} completed.`,
      );
    } catch (e: unknown) {
      const { status, body } = await extractHttpError(e);
      if (status > 0) {
        errExit(`API error ${status}: ${body}`, 1);
      }
      errExit(`network error: ${body}`, 1);
    }
  });

// -- cancel ---------------------------------------------------------------

program
  .command("cancel <session_id>")
  .description("Cancel a session")
  .option(
    "--reason <enum>",
    "Cancel reason: user_cancelled | agent_aborted | error",
    "agent_aborted",
  )
  .option("--detail <text>", "Additional detail")
  .action(async (sessionId: string, opts: { reason: string; detail?: string }) => {
    // Validate reason enum locally — DESIGN.md §1975 (CLI pre-flight saves a round-trip).
    const validReasons = ["user_cancelled", "agent_aborted", "error"];
    if (!validReasons.includes(opts.reason)) {
      errExit(
        `invalid --reason '${opts.reason}'; must be one of: ${validReasons.join(", ")}`,
        64,
      );
    }

    const body: Record<string, unknown> = {
      status: "cancelled",
      reason: opts.reason,
      actor: "agent",
    };
    if (opts.detail) body.reason_detail = opts.detail;

    const client = apiClient("patch");
    try {
      const resp = await client
        .patch(`sessions/${sessionId}`, { json: body })
        .json<Record<string, unknown>>();
      output(
        resp,
        parseJsonFields(undefined),
        () => `Session ${sessionId} cancelled (reason: ${opts.reason}).`,
      );
    } catch (e: unknown) {
      const { status, body: errBody } = await extractHttpError(e);
      if (status > 0) {
        errExit(`API error ${status}: ${errBody}`, 1);
      }
      errExit(`network error: ${errBody}`, 1);
    }
  });

// -- status ---------------------------------------------------------------

program
  .command("status <session_id>")
  .description("Get session status")
  .option("-j, --json [fields]", "JSON output")
  .action(async (sessionId: string, opts: { json?: string | boolean }) => {
    const client = apiClient("get");
    try {
      const resp = await client.get(`sessions/${sessionId}`).json<SessionResponse>();
      output(
        resp as unknown as Record<string, unknown>,
        parseJsonFields(opts.json),
        () =>
          `Session ${resp.session_id}\n  status: ${resp.status}\n  current_round: ${resp.current_round}\n  created_at: ${resp.created_at}\n  expires_at: ${resp.expires_at}`,
      );
    } catch (e: unknown) {
      if (
        typeof e === "object" &&
        e !== null &&
        "response" in e &&
        e.response instanceof Response
      ) {
        const status = e.response.status;
        if (status === 410) {
          const body = await e.response.json().catch(() => ({})) as { detail?: string };
          output(
            { status: "gone", detail: body.detail },
            parseJsonFields(opts.json),
            () => `Session ${sessionId} is gone (${body.detail ?? "unknown"}).`,
          );
          process.exit(0);
        }
        const errBody = await e.response.text().catch(() => "");
        errExit(`API error ${status}: ${errBody}`, 1);
      }
      const msg = e instanceof Error ? e.message : String(e);
      errExit(`network error: ${msg}`, 1);
    }
  });

// ---------------------------------------------------------------------------
// Long-poll loop
// ---------------------------------------------------------------------------

/** Sleep helper. */
function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Exponential backoff: 1s, 2s, 4s, 8s, 16s, then capped at 30s.
 *  DESIGN.md §2026, §2420. */
function backoffMs(consecutiveErrors: number): number {
  return Math.min(Math.pow(2, consecutiveErrors - 1), 30) * 1000;
}

async function pollLoop(
  sessionId: string,
  round: number,
  totalWait: number,
  jsonFields: string[] | null = null,
): Promise<void> {
  const deadline = Date.now() + totalWait * 1000;
  const client = apiClient("get", true);
  let consecutiveErrors = 0;

  while (Date.now() < deadline) {
    const remaining = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
    const waitSec = Math.min(55, remaining);

    if (waitSec <= 0) {
      output({ status: "timeout" }, jsonFields);
      process.exit(75);
    }

    try {
      // Fetch the raw response (ky treats 2xx — including 202 — as success, so
      // we must inspect the status ourselves rather than relying on the catch
      // path for non-200). throwHttpErrors:false keeps 4xx/5xx in the same path.
      const resp = await client
        .get(`sessions/${sessionId}/rounds/${round}/response`, {
          searchParams: { wait: waitSec },
          timeout: (waitSec + 10) * 1000, // > server wait + round-trip
          throwHttpErrors: false,
        });

      const status = resp.status;

      if (status === 200) {
        // User submitted — emit the answers JSON and exit 0.
        const body = (await resp.json()) as PollResponse;
        output(body as unknown as Record<string, unknown>, jsonFields);
        process.exit(0);
      }

      if (status === 202) {
        // Pending — loop again (reset error counter).
        consecutiveErrors = 0;
        continue;
      }

      if (status === 410) {
        const body = (await resp.json().catch(() => ({}))) as {
          status?: string;
          reason?: string;
        };
        if (body.status === "cancelled") {
          output({ status: "cancelled", reason: body.reason }, jsonFields);
          process.exit(0); // cancelled is a normal business result
        }
        if (body.status === "expired") {
          output({ status: "expired" }, jsonFields);
          process.exit(76);
        }
        // Unknown 410 body — treat as expired.
        output({ status: "expired" }, jsonFields);
        process.exit(76);
      }

      if (status === 404) {
        output({ status: "not_found" }, jsonFields);
        process.exit(1);
      }

      if (status === 429) {
        // Read Retry-After header (DESIGN.md §2025); fall back to a short fixed
        // backoff if the header is absent (defensive — axum-governor always
        // sends it, but don't assume).
        const retryAfter = resp.headers.get("retry-after");
        const delaySec = retryAfter ? Number(retryAfter) : 5;
        await sleepMs(Number.isNaN(delaySec) || delaySec <= 0 ? 5000 : delaySec * 1000);
        continue;
      }

      // 5xx / other errors — exponential backoff (1/2/4s, cap 30s).
      // DESIGN.md §2026, §2420: no hard "give up" count; the --wait total
      // timeout governs when to stop.
      const errBody = await resp.text().catch(() => "");
      warnStderr(`API error ${status}: ${errBody}`);
      consecutiveErrors++;
      await sleepMs(backoffMs(consecutiveErrors));
      continue;
    } catch (e: unknown) {
      // Network error (connection refused, DNS, timeout) — exponential backoff.
      const msg = e instanceof Error ? e.message : String(e);
      warnStderr(`network error: ${msg}`);
      consecutiveErrors++;
      await sleepMs(backoffMs(consecutiveErrors));
    }
  }

  // Total timeout
  output({ status: "timeout" }, jsonFields);
  process.exit(75);
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

program.parse();
