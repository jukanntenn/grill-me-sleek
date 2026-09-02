import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import { ToolCallId } from "@deepseek-ai/dsh-llm";
import AgentRegistry from "@deepseek-ai/dsh-agent";
import type { Agent } from "@deepseek-ai/dsh-agent";
import SystemPrompt from "@deepseek-ai/dsh-system-prompt";
import ToolRuntime from "@deepseek-ai/dsh-tools";
import SkillRegistry from "@deepseek-ai/dsh-skill";
import UserQuestionService from "@deepseek-ai/dsh-user-questions";
import type { AskUserQuestionRequest } from "@deepseek-ai/dsh-user-questions";
import { TimeoutReason } from "@deepseek-ai/dsh-timeout";
import * as tool from "../src/index.ts";
import * as mapping from "../src/mapping.ts";
import { askRound } from "../src/race.ts";
import { GrillingHubClient } from "../src/hub.ts";
import type { GrillingQuestion } from "../src/types.ts";

const ROUND_TIMEOUT_MS = 4 * 3_600_000;
const testSignal = new AbortController().signal;

const QUESTIONS: GrillingQuestion[] = [
  {
    id: "grill_auth_provider",
    header: "Auth",
    question: "Which auth provider should guard the API?",
    options: [
      { label: "oauth2", description: "Delegated, more moving parts." },
      { label: "sessions" },
    ],
    recommended: 0,
    explanation: "the industry default",
  },
  {
    id: "grill_deadline",
    header: "Timing",
    question: "Any deadline?",
    placeholder: "e.g. next week",
    maxLength: 200,
  },
];

function callArgs(branch = "auth approach", questions: GrillingQuestion[] = QUESTIONS): unknown {
  return { branch, questions };
}

/** Poll until the condition holds; convergence calls are fire-and-forget. */
async function until(condition: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !condition(); i++)
    await new Promise((resolve) => setTimeout(resolve, 5));
  if (!condition()) throw new Error("condition never held");
}

/** One scripted Hub reply; a `hold` promise defers the response (aborted sockets just drop). */
interface Script {
  method: string;
  match: RegExp;
  status: number;
  json?: unknown;
  hold?: Promise<void>;
}

interface RecordedRequest {
  method: string;
  path: string;
  body: unknown;
}

/** A loopback grill-me-sleek Hub speaking the scripted REST contract. */
class StubHub {
  readonly requests: RecordedRequest[] = [];
  #scripts: Script[] = [];
  readonly #server: Server;
  #baseUrl = "";
  readonly #listening: Promise<void>;

  constructor() {
    const server = createServer((req, res) => {
      void this.#handle(req, res);
    });
    server.unref();
    this.#listening = new Promise((resolve) => {
      server.once("listening", () => resolve());
    });
    this.#server = server.listen(0, "127.0.0.1");
  }

  /** Resolve once the loopback listener is bound; the Hub's base URL. */
  async ready(): Promise<string> {
    await this.#listening;
    this.#baseUrl = `http://127.0.0.1:${(this.#server.address() as AddressInfo).port}`;
    return this.#baseUrl;
  }

  get baseUrl(): string {
    return this.#baseUrl;
  }

  script(entries: Script[]): void {
    this.#scripts = [...this.#scripts, ...entries];
  }

  async close(): Promise<void> {
    this.#server.closeAllConnections();
    await new Promise<void>((resolve) => {
      this.#server.close(() => resolve());
    });
  }

  recorded(method: string, pathPattern: RegExp): RecordedRequest[] {
    return this.requests.filter((req) => req.method === method && pathPattern.test(req.path));
  }

  async #handle(
    req: import("node:http").IncomingMessage,
    res: import("node:http").ServerResponse,
  ): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body =
      chunks.length === 0
        ? undefined
        : (JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown);
    const path = (req.url ?? "").split("?")[0]!;
    this.requests.push({ method: req.method ?? "", path, body });
    const index = this.#scripts.findIndex(
      (s) => s.method === (req.method ?? "") && s.match.test(path),
    );
    if (index === -1) {
      res.statusCode = 404;
      res.end(JSON.stringify({ message: `no script for ${req.method} ${path}`, status: 404 }));
      return;
    }
    const [script] = this.#scripts.splice(index, 1);
    if (script === undefined) {
      res.statusCode = 404;
      res.end(JSON.stringify({ message: "script vanished", status: 404 }));
      return;
    }
    if (script.hold !== undefined) await script.hold.catch(() => {});
    res.statusCode = script.status;
    res.setHeader("content-type", "application/json");
    res.end(script.json === undefined ? "" : JSON.stringify(script.json));
  }
}

const hubs: StubHub[] = [];

afterEach(async () => {
  await Promise.all(hubs.splice(0).map((hub) => hub.close()));
});

async function setup(config: Partial<tool.Config> = {}): Promise<Context> {
  const ctx = new Context();
  await ctx.plugin(AgentRegistry);
  await ctx.plugin(SystemPrompt);
  await ctx.plugin(ToolRuntime);
  await ctx.plugin(UserQuestionService);
  await ctx.plugin(tool, config as tool.Config);
  return ctx;
}

/** A root Agent stand-in; the race keys its Hub linkage on `agent.session`. */
function agentWithSession(ctx: Context, id: string): Agent {
  const agent = { id, session: { id } } as unknown as Agent;
  ctx.agents.enter(agent, undefined);
  return agent;
}

let callCounter = 0;
function callGrill(
  ctx: Context,
  args: unknown,
  over: { agent?: Agent | undefined; signal?: AbortSignal } = {},
) {
  const agent = "agent" in over ? over.agent : agentWithSession(ctx, `agent-${callCounter}`);
  return ctx.tools.execute({
    signal: over.signal ?? testSignal,
    callId: ToolCallId(`grill-${++callCounter}`),
    name: "grill_user",
    arguments: args,
    ...(agent !== undefined ? { agent } : {}),
  });
}

function text(result: { content: { type: string; text?: string }[] }): string {
  return result.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}

function answerer(
  ctx: Context,
  ask: (request: AskUserQuestionRequest) => Promise<unknown>,
): AskUserQuestionRequest[] {
  const seen: AskUserQuestionRequest[] = [];
  ctx.on("user-questions/request", async (request) => {
    seen.push(request);
    return (await ask(request)) as never;
  });
  return seen;
}

/** An answerer that stays silent until its signal aborts, like a real UI card. */
function silentUntilAborted(request: AskUserQuestionRequest): Promise<never> {
  return new Promise((_resolve, reject) => {
    request.signal?.addEventListener("abort", () => reject(new Error("card withdrawn")), {
      once: true,
    });
  });
}

const created = (round = 1): Script => ({
  method: "POST",
  match: /^\/v1\/sessions$/,
  status: 201,
  json: {
    session_id: "hub-sess",
    url: `https://hub.example.com/#hub-sess`,
    status: "active",
    current_round: round,
    created_at: "t",
    expires_at: "t",
  },
});
const pushed = (round: number): Script => ({
  method: "POST",
  match: /^\/v1\/sessions\/[^/]+\/rounds$/,
  status: 201,
  json: { round, name: null, grilling: {} },
});
const poll = (json: unknown, status = 200): Script => ({
  method: "GET",
  match: /^\/v1\/sessions\/[^/]+\/rounds\/\d+\/response$/,
  status,
  json,
});
const hangingPoll: Script = {
  method: "GET",
  match: /^\/v1\/sessions\/[^/]+\/rounds\/\d+\/response$/,
  status: 202,
  json: { status: "pending" },
  hold: new Promise(() => {}),
};
const submit = (status: number, json?: unknown): Script => ({
  method: "POST",
  match: /^\/v1\/sessions\/[^/]+\/rounds\/\d+\/response$/,
  status,
  json,
});
const cancelled: Script = {
  method: "PATCH",
  match: /^\/v1\/sessions\/[^/]+$/,
  status: 200,
  json: { session_id: "hub-sess", status: "cancelled", current_round: 0 },
};

const storedWinner = {
  round: 1,
  answers: { grill_auth_provider: { selected: "sessions" } },
  submitted_at: "t",
  revision: 1,
};

describe("grill_user tool", () => {
  it("registers a model-facing tool schema with the round deadline and concurrency opt-in", async () => {
    const ctx = await setup();
    const schema = ctx.tools.schemas().find((s) => s.name === "grill_user");
    expect(schema).toMatchObject({
      name: "grill_user",
      parameters: { type: "object", required: ["branch", "questions"] },
    });
    const parameters = schema?.parameters as unknown as {
      properties: Record<
        string,
        { type: string; items?: { properties: Record<string, { type: string }> } }
      >;
    };
    const properties = parameters.properties;
    expect(Object.keys(properties).sort()).toEqual(["branch", "questions"]);
    expect(Object.keys(properties.questions!.items!.properties).sort()).toEqual([
      "explanation",
      "header",
      "id",
      "maxLength",
      "multiSelect",
      "options",
      "placeholder",
      "question",
      "recommended",
      "required",
    ]);

    const definition = ctx.tools.get("grill_user")!;
    expect(definition.timeoutMs).toBe(ROUND_TIMEOUT_MS);
    expect(definition.isConcurrencySafe?.(callArgs() as never)).toBe(true);
    const outputProperties = (
      definition.output.schema as unknown as { properties: Record<string, unknown> }
    ).properties;
    expect(Object.keys(outputProperties).sort()).toEqual(["answers", "hub", "roundId"]);
  });

  it("applies config: the round deadline and question cap are real configurability", async () => {
    const ctx = await setup({ roundTimeoutMs: 90_000, maxQuestionsPerRound: 1 });
    expect(ctx.tools.get("grill_user")!.timeoutMs).toBe(90_000);
    const result = await callGrill(ctx, callArgs());
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("requires 1..1 questions");
  });

  it("asks the waterfall and returns structured answers (hubless)", async () => {
    const ctx = await setup({ baseUrl: "" });
    const seen = answerer(ctx, async () => ({
      answers: [
        { id: "grill_auth_provider", selected: ["oauth2"] },
        { id: "grill_deadline", selected: [], custom: "friday" },
        { id: "grill_additional_notes", selected: [], custom: "ship it" },
      ],
    }));
    const agent = agentWithSession(ctx, "hubless-writer");
    const result = await callGrill(ctx, callArgs(), { agent });

    expect(result.isError).toBe(false);
    if (result.isError) throw new Error("expected grill_user success");
    expect(result.value).toEqual({
      roundId: expect.any(String) as string,
      answers: [
        { id: "grill_auth_provider", selected: ["oauth2"] },
        { id: "grill_deadline", selected: [], custom: "friday" },
        { id: "grill_additional_notes", selected: [], custom: "ship it" },
      ],
    });
    expect(text(result)).toContain('"roundId"');

    expect(seen[0]?.questions).toHaveLength(3);
    expect(seen[0]?.questions[0]).toMatchObject({
      id: "grill_auth_provider",
      header: "Auth",
      detail: "Recommended: oauth2, because the industry default.",
      options: [
        { label: "oauth2", description: "Delegated, more moving parts." },
        { label: "sessions" },
      ],
    });
    expect(seen[0]?.questions[1]).toMatchObject({ id: "grill_deadline" });
    expect(seen[0]?.questions[2]).toMatchObject({ id: "grill_additional_notes" });
    expect(seen[0]?.agent).toBe(agent);
  });

  it("rejects a non-root caller before any round exists", async () => {
    const ctx = await setup();
    answerer(ctx, async () => ({ answers: [] }));
    const root = agentWithSession(ctx, "guard-root");
    const child = { id: "guard-child", session: { id: "guard-child" } } as unknown as Agent;
    ctx.agents.enter(child, root);

    const delegated = await callGrill(ctx, callArgs(), { agent: child });
    expect(delegated.isError).toBe(true);
    expect(text(delegated)).toContain("requires the main agent");

    const bare = await callGrill(ctx, callArgs(), { agent: undefined });
    expect(bare.isError).toBe(true);
    expect(text(bare)).toContain("requires the main agent");
  });

  it("rejects a caller when no agent registry is present", async () => {
    const ctx = new Context();
    await ctx.plugin(SystemPrompt);
    await ctx.plugin(ToolRuntime);
    await ctx.plugin(UserQuestionService);
    await ctx.plugin(tool);
    const agent = { id: "no-registry", session: { id: "no-registry" } } as unknown as Agent;
    const result = await ctx.tools.execute({
      signal: testSignal,
      callId: ToolCallId("grill-no-registry"),
      name: "grill_user",
      arguments: callArgs(),
      agent,
    });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("requires the main agent");
  });

  it("converges the Hub by proxy submission when the downstream link answers first", async () => {
    const hub = new StubHub();
    hubs.push(hub);
    const baseUrl = await hub.ready();
    hub.script([created(1), hangingPoll, submit(201, storedWinner)]);
    const ctx = await setup({ baseUrl });
    const seen = answerer(ctx, async () => {
      await until(() => hub.recorded("GET", /response$/).length > 0);
      return {
        answers: [
          { id: "grill_auth_provider", selected: ["oauth2"] },
          { id: "grill_deadline", selected: [], custom: "friday" },
          { id: "grill_additional_notes", selected: [], custom: "ship it" },
        ],
      };
    });
    const agent = agentWithSession(ctx, "downstream-wins");
    const result = await callGrill(ctx, callArgs(), { agent });

    expect(result.isError).toBe(false);
    if (result.isError) throw new Error("expected grill_user success");
    expect(result.value).toMatchObject({
      hub: { sessionId: "hub-sess", url: "https://hub.example.com/#hub-sess" },
    });
    expect(
      seen[0]?.questions.find((question) => question.id === "grill_auth_provider"),
    ).toMatchObject({
      detail:
        "Recommended: oauth2, because the industry default. " +
        "Also answerable in the browser: https://hub.example.com/#hub-sess",
    });
    expect(
      seen[0]?.questions.find((question) => question.id === "grill_additional_notes"),
    ).not.toHaveProperty("detail");
    expect(hub.recorded("POST", /^\/v1\/sessions$/)[0]?.body).toMatchObject({
      name: "auth approach",
      additional_notes: {},
      questions: [
        { id: "grill_auth_provider", type: "single", recommended: 0 },
        { id: "grill_deadline", type: "text", max_length: 200 },
      ],
    });
    expect(hub.recorded("POST", /response$/)[0]?.body).toEqual({
      answers: {
        grill_auth_provider: { selected: "oauth2" },
        grill_deadline: { selected: "friday" },
      },
      additional_notes: "ship it",
    });
  });

  it("revises the Hub onto the log when the answer page submitted first (409 carries the winner)", async () => {
    const hub = new StubHub();
    hubs.push(hub);
    const baseUrl = await hub.ready();
    hub.script([
      created(1),
      hangingPoll,
      submit(409, {
        message: "round 1 already submitted",
        status: 409,
        round: 1,
        response: storedWinner,
      }),
      submit(200, { ...storedWinner, revision: 2, revised_at: "t2" }),
    ]);
    const ctx = await setup({ baseUrl });
    answerer(ctx, async () => {
      await until(() => hub.recorded("GET", /response$/).length > 0);
      return { answers: [{ id: "grill_auth_provider", selected: ["oauth2"] }] };
    });
    const agent = agentWithSession(ctx, "revise");
    const result = await callGrill(ctx, callArgs(), { agent });

    expect(result.isError).toBe(false);
    const requests = hub.recorded("POST", /response$/);
    expect(requests).toHaveLength(1);
    expect(hub.recorded("PUT", /response$/)).toHaveLength(1);
    expect(hub.recorded("PUT", /response$/)[0]?.body).toEqual(requests[0]?.body);
  });

  it("still answers when Hub convergence fails (best effort, warned)", async () => {
    const hub = new StubHub();
    hubs.push(hub);
    const baseUrl = await hub.ready();
    hub.script([created(1), hangingPoll, submit(500, { message: "boom", status: 500 })]);
    const ctx = await setup({ baseUrl });
    answerer(ctx, async () => {
      await until(() => hub.recorded("GET", /response$/).length > 0);
      return { answers: [{ id: "grill_auth_provider", selected: ["oauth2"] }] };
    });
    const agent = agentWithSession(ctx, "convergence-fails");
    const result = await callGrill(ctx, callArgs(), { agent });

    expect(result.isError).toBe(false);
  });

  it("answers from the Hub link when no answerer exists (NO_PROVIDER masked as absent)", async () => {
    const hub = new StubHub();
    hubs.push(hub);
    const baseUrl = await hub.ready();
    hub.script([
      created(1),
      poll({
        round: 1,
        answers: {
          grill_auth_provider: { selected: "sessions" },
          grill_deadline: { selected: "friday", custom_text: "" },
        },
        additional_notes: "watch costs",
        submitted_at: "t",
        revision: 1,
      }),
    ]);
    const ctx = await setup({ baseUrl });
    const agent = agentWithSession(ctx, "hub-wins");
    const result = await callGrill(ctx, callArgs(), { agent });

    expect(result.isError).toBe(false);
    if (result.isError) throw new Error("expected grill_user success");
    expect(result.value).toEqual({
      roundId: expect.any(String) as string,
      hub: { sessionId: "hub-sess", url: "https://hub.example.com/#hub-sess" },
      answers: [
        { id: "grill_auth_provider", selected: ["sessions"] },
        { id: "grill_deadline", selected: [], custom: "friday" },
        { id: "grill_additional_notes", selected: [], custom: "watch costs" },
      ],
    });
    expect(hub.recorded("POST", /response$/)).toHaveLength(0);
  });

  it("fails the round explicitly when hubless and no answerer exists", async () => {
    const ctx = await setup({ baseUrl: "" });
    const agent = agentWithSession(ctx, "hubless-headless");
    const result = await callGrill(ctx, callArgs(), { agent });

    expect(result.isError).toBe(true);
    expect(result).toMatchObject({
      error: { info: { name: "UserQuestionError", code: "NO_PROVIDER" } },
    });
  });

  it("degrades to downstream-only when the Hub rejects session creation", async () => {
    const hub = new StubHub();
    hubs.push(hub);
    const baseUrl = await hub.ready();
    hub.script([
      {
        method: "POST",
        match: /^\/v1\/sessions$/,
        status: 400,
        json: { message: "grilling validation failed", status: 400 },
      },
    ]);
    const ctx = await setup({ baseUrl });
    answerer(ctx, async () => ({ answers: [{ id: "grill_auth_provider", selected: ["oauth2"] }] }));
    const agent = agentWithSession(ctx, "create-rejected");
    const result = await callGrill(ctx, callArgs(), { agent });

    expect(result.isError).toBe(false);
    if (result.isError) throw new Error("expected grill_user success");
    expect(result.value).not.toHaveProperty("hub");
    expect(hub.recorded("POST", /response$/)).toHaveLength(0);
    expect(hub.recorded("PATCH", /^\/v1\/sessions\//)).toHaveLength(0);
  });

  it("fails the degraded round explicitly when no answerer exists", async () => {
    const hub = new StubHub();
    hubs.push(hub);
    const baseUrl = await hub.ready();
    hub.script([
      {
        method: "POST",
        match: /^\/v1\/sessions$/,
        status: 400,
        json: { message: "grilling validation failed", status: 400 },
      },
    ]);
    const ctx = await setup({ baseUrl });
    const agent = agentWithSession(ctx, "create-rejected-headless");
    const result = await callGrill(ctx, callArgs(), { agent });

    expect(result.isError).toBe(true);
    expect(result).toMatchObject({
      error: { info: { name: "UserQuestionError", code: "NO_PROVIDER" } },
    });
  });

  it("races URL-less when the Hub round opens after the reveal budget, and still converges", async () => {
    const hub = new StubHub();
    hubs.push(hub);
    const baseUrl = await hub.ready();
    const release = Promise.withResolvers<void>();
    hub.script([{ ...created(1), hold: release.promise }, hangingPoll, submit(201, storedWinner)]);
    const ctx = await setup({ baseUrl });
    const seen = answerer(ctx, async () => {
      await until(() => hub.recorded("GET", /response$/).length > 0);
      return { answers: [{ id: "grill_auth_provider", selected: ["oauth2"] }] };
    });
    const agent = agentWithSession(ctx, "late-open");
    const settling = askRound(ctx, {
      agent,
      signal: testSignal,
      questions: QUESTIONS,
      branch: "b",
      hub: new GrillingHubClient({ baseUrl }),
      hubSessions: new WeakMap(),
      urlRevealBudgetMs: 5,
    });
    await until(() => seen.length > 0);
    expect(
      seen[0]?.questions.find((question) => question.id === "grill_auth_provider"),
    ).toMatchObject({ detail: "Recommended: oauth2, because the industry default." });
    expect(
      seen[0]?.questions.find((question) => question.id === "grill_additional_notes"),
    ).not.toHaveProperty("detail");
    release.resolve();
    const result = await settling;

    expect(result).toMatchObject({ outcome: "answered" });
    expect(result).toMatchObject({ hub: { sessionId: "hub-sess" } });
    await until(() => hub.recorded("POST", /response$/).length > 0);
    expect(hub.recorded("POST", /response$/)).toHaveLength(1);
  });

  it("closes the round as expired when the Hub session went terminal mid-poll", async () => {
    const hub = new StubHub();
    hubs.push(hub);
    const baseUrl = await hub.ready();
    hub.script([created(1), poll({ status: "expired" }, 410), cancelled]);
    const ctx = await setup({ baseUrl });
    const agent = agentWithSession(ctx, "hub-expired");
    const result = await callGrill(ctx, callArgs(), { agent });

    expect(result.isError).toBe(true);
    expect(text(result)).toContain("grilling hub 410");
    await until(() => hub.recorded("PATCH", /^\/v1\/sessions\//).length > 0);
    expect(hub.recorded("PATCH", /^\/v1\/sessions\//)[0]?.body).toEqual({
      status: "cancelled",
      reason: "agent_aborted",
      actor: "agent",
    });
  });

  it("closes the round as cancelled on a user abort and cancels the Hub session", async () => {
    const hub = new StubHub();
    hubs.push(hub);
    const baseUrl = await hub.ready();
    hub.script([created(1), hangingPoll, cancelled]);
    const ctx = await setup({ baseUrl });
    answerer(ctx, silentUntilAborted);
    const controller = new AbortController();
    const agent = agentWithSession(ctx, "user-abort");
    const promise = callGrill(ctx, callArgs(), { agent, signal: controller.signal });
    await until(() => hub.recorded("GET", /response$/).length > 0);
    controller.abort();
    const result = await promise;

    expect(result.isError).toBe(true);
    await until(() => hub.recorded("PATCH", /^\/v1\/sessions\//).length > 0);
    expect(hub.recorded("PATCH", /^\/v1\/sessions\//)[0]?.body).toEqual({
      status: "cancelled",
      reason: "agent_aborted",
      actor: "agent",
    });
  });

  it("closes the round as expired when the round deadline fires (TOOL_TIMEOUT reason)", async () => {
    const hub = new StubHub();
    hubs.push(hub);
    const baseUrl = await hub.ready();
    hub.script([created(1), hangingPoll, cancelled]);
    const ctx = await setup({ baseUrl });
    answerer(ctx, silentUntilAborted);
    const controller = new AbortController();
    const agent = agentWithSession(ctx, "deadline");
    const promise = callGrill(ctx, callArgs(), { agent, signal: controller.signal });
    await until(() => hub.recorded("GET", /response$/).length > 0);
    controller.abort(new TimeoutReason("TOOL_TIMEOUT", ROUND_TIMEOUT_MS));
    const result = await promise;

    expect(result.isError).toBe(true);
  });

  it("shares one Hub session across rounds and concurrent calls", async () => {
    const hub = new StubHub();
    hubs.push(hub);
    const baseUrl = await hub.ready();
    const release = Promise.withResolvers<void>();
    hub.script([
      { ...created(1), hold: release.promise },
      pushed(2),
      poll({
        round: 1,
        answers: { grill_deadline: { selected: "soon" } },
        submitted_at: "t",
        revision: 1,
      }),
      poll({
        round: 2,
        answers: { grill_deadline: { selected: "later" } },
        submitted_at: "t",
        revision: 1,
      }),
    ]);
    const ctx = await setup({ baseUrl });
    const agent = agentWithSession(ctx, "multi-round");
    const first = callGrill(ctx, callArgs("first branch"), { agent });
    const second = callGrill(ctx, callArgs("second branch"), { agent });
    await new Promise((resolve) => setImmediate(resolve));
    release.resolve();
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult.isError).toBe(false);
    expect(secondResult.isError).toBe(false);
    expect(hub.recorded("POST", /^\/v1\/sessions$/)).toHaveLength(1);
    expect(hub.recorded("POST", /rounds$/)).toHaveLength(1);
    expect(hub.requests.filter((req) => /rounds\/1\/response/.test(req.path))).toHaveLength(1);
    expect(hub.requests.filter((req) => /rounds\/2\/response/.test(req.path))).toHaveLength(1);
  });

  it("presents the call with the branch as its title", async () => {
    const ctx = await setup();
    const definition = ctx.tools.get("grill_user")!;
    expect(definition.presentCall?.(callArgs() as never)).toEqual({
      card: "generic",
      title: "Grill: auth approach",
      kind: "other",
      rawInput: QUESTIONS,
    });
  });

  it("registers the grilling-sleek skill when a skill registry is present", async () => {
    const ctx = new Context();
    await ctx.plugin(AgentRegistry);
    await ctx.plugin(SystemPrompt);
    await ctx.plugin(ToolRuntime);
    await ctx.plugin(UserQuestionService);
    await ctx.plugin(SkillRegistry, {});
    await ctx.plugin(tool);
    const skills = await ctx.skills.list();
    const summary = skills.find((skill) => skill.name === "grilling-sleek");
    expect(summary).toMatchObject({ name: "grilling-sleek", source: "runtime" });
    expect(summary?.description).toContain("Grill the user relentlessly");
    // The digest is the model's only routing surface: it must name the tool
    // and close the CLI door the repo's own docs keep describing.
    expect(summary?.description).toContain("`grill_user`");
    expect(summary?.description).toContain("@grilling-sleek/cli");
    const registered = await ctx.skills.get("grilling-sleek", {});
    expect(registered).toMatchObject({
      content: expect.stringContaining("One decision-tree branch per `grill_user` call") as string,
    });
    expect(registered?.content).toContain("Never spawn `@grilling-sleek/cli`");
    // The Construction rules are the model's only pre-call view of the
    // execute-time value constraints; dropping them reopens the first-call
    // rejection loop this section exists to close.
    expect(registered?.content).toContain("Construction rules");
    expect(registered?.content).toContain("`grill_additional_notes`");
  });

  it("unregisters the tool and skill when its contributing fiber is disposed (HMR-safety)", async () => {
    const ctx = new Context();
    await ctx.plugin(SystemPrompt);
    await ctx.plugin(ToolRuntime);
    await ctx.plugin(UserQuestionService);
    await ctx.plugin(SkillRegistry, {});
    const fiber = await ctx.plugin(tool);
    expect(ctx.tools.get("grill_user")).toBeDefined();
    expect((await ctx.skills.list()).some((skill) => skill.name === "grilling-sleek")).toBe(true);

    await fiber.dispose();

    expect(ctx.tools.get("grill_user")).toBeUndefined();
    expect((await ctx.skills.list()).some((skill) => skill.name === "grilling-sleek")).toBe(false);
  });

  it("has the namespace-plugin export shape (no stray default)", () => {
    expect("default" in tool).toBe(false);
    expect(tool.name).toBe("tool-grill-user");
    expect(tool.inject).toEqual(["tools", "userQuestions"]);
    expect(typeof tool.apply).toBe("function");
  });

  it("settles a race entered with an already-aborted signal as cancelled", async () => {
    const ctx = await setup();
    const agent = agentWithSession(ctx, "pre-aborted");
    const controller = new AbortController();
    controller.abort();
    const result = await askRound(ctx, {
      agent,
      signal: controller.signal,
      questions: QUESTIONS,
      branch: "b",
      hub: undefined,
      hubSessions: new WeakMap(),
    });
    expect(result).toMatchObject({ outcome: "cancelled" });
  });

  it("classifies a TOOL_TIMEOUT abort as expired", async () => {
    const ctx = await setup();
    const agent = agentWithSession(ctx, "deadline-direct");
    answerer(ctx, silentUntilAborted);
    const controller = new AbortController();
    const result = askRound(ctx, {
      agent,
      signal: controller.signal,
      questions: QUESTIONS,
      branch: "b",
      hub: undefined,
      hubSessions: new WeakMap(),
    });
    await new Promise((resolve) => setImmediate(resolve));
    controller.abort(new TimeoutReason("TOOL_TIMEOUT", ROUND_TIMEOUT_MS));
    await expect(result).resolves.toMatchObject({ outcome: "expired" });
  });
});

describe("toQuestions value constraints", () => {
  const one = (overrides: Partial<GrillingQuestion>): GrillingQuestion => ({
    id: "grill_ok",
    header: "H",
    question: "Q?",
    ...overrides,
  });

  it.each([
    { label: "empty branch", branch: "  ", fragment: /non-empty branch/ },
    {
      label: "empty batch",
      questions: [] as GrillingQuestion[],
      fragment: /1\.\.16 questions \(got 0\)/,
    },
    {
      label: "id without the grill_ prefix",
      questions: [one({ id: "auth" })],
      fragment: /grill_ prefix/,
    },
    {
      label: "id in the wrong case",
      questions: [one({ id: "grill_Auth" })],
      fragment: /grill_ prefix/,
    },
    {
      label: "reserved notes id",
      questions: [one({ id: "grill_additional_notes" })],
      fragment: /reserved/,
    },
    {
      label: "duplicate id",
      questions: [one({}), one({ header: "H2" })],
      fragment: /repeats question id/,
    },
    { label: "blank header", questions: [one({ header: "  " })], fragment: /non-empty header/ },
    { label: "blank text", questions: [one({ question: " " })], fragment: /non-empty text/ },
    {
      label: "single option",
      questions: [one({ options: [{ label: "a" }] })],
      fragment: /at least two options/,
    },
    {
      label: "blank option label",
      questions: [one({ options: [{ label: " " }, { label: "b" }] })],
      fragment: /empty option label/,
    },
    {
      label: "recommended past the options",
      questions: [one({ options: [{ label: "a" }, { label: "b" }], recommended: 2 })],
      fragment: /recommends index/,
    },
    {
      label: "recommended without options",
      questions: [one({ recommended: 0 })],
      fragment: /recommends index/,
    },
    {
      label: "multiSelect without options",
      questions: [one({ multiSelect: true })],
      fragment: /cannot multi-select/,
    },
    {
      label: "non-positive maxLength",
      questions: [one({ maxLength: 0 })],
      fragment: /maxLength must be positive/,
    },
  ])("rejects $label", ({ branch = "b", questions = [] as GrillingQuestion[], fragment }) => {
    expect(() => mapping.toQuestions(branch, questions, 16)).toThrow(fragment);
  });

  it("canonicalizes by trimming branch, header, question, and option labels", () => {
    const { branch, questions } = mapping.toQuestions(
      " auth ",
      [
        {
          id: "grill_ok",
          header: " Auth ",
          question: " Which? ",
          options: [{ label: " a " }, { label: "b" }],
        },
      ],
      16,
    );
    expect(branch).toBe("auth");
    expect(questions[0]).toMatchObject({
      header: "Auth",
      question: "Which?",
      options: [{ label: "a" }, { label: "b" }],
    });
  });
});

describe("mapping projections", () => {
  it("builds ask items with folded recommendations and the notes catch-all", () => {
    const items = mapping.toAskItems(
      [
        {
          id: "grill_a",
          header: "A",
          question: "qa?",
          options: [{ label: "x" }, { label: "y" }],
          recommended: 1,
          explanation: "why",
        },
        {
          id: "grill_b",
          header: "B",
          question: "qb?",
          options: [{ label: "x" }, { label: "y" }],
          recommended: 0,
        },
        {
          id: "grill_c",
          header: "C",
          question: "qc?",
          multiSelect: true,
          options: [{ label: "x" }, { label: "y" }],
        },
      ],
      "https://hub.example.com/#hub-sess",
    );
    expect(items).toEqual([
      {
        id: "grill_a",
        header: "A",
        question: "qa?",
        options: [{ label: "x" }, { label: "y" }],
        detail:
          "Recommended: y, because why. " +
          "Also answerable in the browser: https://hub.example.com/#hub-sess",
      },
      {
        id: "grill_b",
        header: "B",
        question: "qb?",
        options: [{ label: "x" }, { label: "y" }],
        detail: "Recommended: x.",
      },
      {
        id: "grill_c",
        header: "C",
        question: "qc?",
        options: [{ label: "x" }, { label: "y" }],
        multiSelect: true,
      },
      {
        id: "grill_additional_notes",
        header: "Notes",
        question: "Anything else the agent should know before proceeding?",
      },
    ]);
  });

  it("puts the answer-page line on a recommendation-less first question alone", () => {
    const items = mapping.toAskItems(
      [{ id: "grill_free", header: "F", question: "qf?" }],
      "https://hub.example.com/#hub-sess",
    );
    expect(items[0]).toMatchObject({
      id: "grill_free",
      detail: "Also answerable in the browser: https://hub.example.com/#hub-sess",
    });
  });

  it("rejects an out-of-range recommendation reached without toQuestions", () => {
    expect(() =>
      mapping.toAskItems([
        { id: "grill_a", header: "A", question: "qa?", options: [{ label: "x" }], recommended: 3 },
      ]),
    ).toThrow(/recommends out of range/);
  });

  it("maps questions onto the Hub wire form by option presence and multiSelect", () => {
    expect(
      mapping.toHubGrilling("b", [
        { id: "grill_a", header: "A", question: "qa?", options: [{ label: "x" }, { label: "y" }] },
        {
          id: "grill_m",
          header: "M",
          question: "qm?",
          options: [{ label: "x" }, { label: "y" }],
          multiSelect: true,
          required: false,
          maxLength: 10,
          placeholder: "p",
        },
        { id: "grill_t", header: "T", question: "qt?", explanation: "e" },
      ]),
    ).toEqual({
      name: "b",
      additional_notes: {},
      questions: [
        {
          id: "grill_a",
          header: "A",
          text: "qa?",
          type: "single",
          options: [{ label: "x" }, { label: "y" }],
        },
        {
          id: "grill_m",
          header: "M",
          text: "qm?",
          type: "multi",
          options: [{ label: "x" }, { label: "y" }],
          required: false,
          max_length: 10,
          placeholder: "p",
        },
        { id: "grill_t", header: "T", text: "qt?", type: "text", explanation: "e" },
      ],
    });
  });

  it("normalizes stored Hub responses into link-neutral answers", () => {
    const questions: GrillingQuestion[] = [
      {
        id: "grill_single",
        header: "S",
        question: "s?",
        options: [{ label: "x" }, { label: "y" }],
      },
      {
        id: "grill_multi",
        header: "M",
        question: "m?",
        options: [{ label: "x" }, { label: "y" }],
        multiSelect: true,
      },
      { id: "grill_text", header: "T", question: "t?" },
      { id: "grill_text_blank", header: "B", question: "b?" },
      { id: "grill_absent", header: "A", question: "a?" },
    ];
    expect(
      mapping.hubResponseToAnswers(questions, {
        round: 1,
        answers: {
          grill_single: { selected: "x" },
          grill_multi: { selected: ["x", "y"] },
          grill_text: { selected: "typed", custom_text: "" },
          grill_text_blank: { selected: "" },
        },
        submitted_at: "t",
      }),
    ).toEqual([
      { id: "grill_single", selected: ["x"] },
      { id: "grill_multi", selected: ["x", "y"] },
      { id: "grill_text", selected: [], custom: "typed" },
      { id: "grill_text_blank", selected: [] },
    ]);
    expect(
      mapping.hubResponseToAnswers(questions.slice(0, 1), {
        round: 1,
        answers: { grill_single: { selected: "", custom_text: "note" } },
        additional_notes: "",
        submitted_at: "t",
      }),
    ).toEqual([{ id: "grill_single", selected: [], custom: "note" }]);
  });

  it("builds Hub submissions per question shape and lifts the notes catch-all", () => {
    expect(
      mapping.answersToResponseInput(
        [
          {
            id: "grill_a",
            header: "A",
            question: "qa?",
            options: [{ label: "x" }, { label: "y" }],
          },
          {
            id: "grill_m",
            header: "M",
            question: "qm?",
            options: [{ label: "x" }, { label: "y" }],
            multiSelect: true,
          },
          { id: "grill_t", header: "T", question: "qt?" },
        ],
        [
          { id: "grill_a", selected: ["x"], custom: "alt" },
          { id: "grill_m", selected: ["x", "y"] },
          { id: "grill_t", selected: [], custom: "typed" },
          { id: "grill_additional_notes", selected: [], custom: "extra" },
        ],
      ),
    ).toEqual({
      answers: {
        grill_a: { selected: "x", custom_text: "alt" },
        grill_m: { selected: ["x", "y"] },
        grill_t: { selected: "typed" },
      },
      additional_notes: "extra",
    });
    expect(
      mapping.answersToResponseInput(
        [
          {
            id: "grill_a",
            header: "A",
            question: "qa?",
            options: [{ label: "x" }, { label: "y" }],
          },
          {
            id: "grill_m",
            header: "M",
            question: "qm?",
            options: [{ label: "x" }, { label: "y" }],
            multiSelect: true,
          },
        ],
        [{ id: "grill_a", selected: [], custom: "" }],
      ),
    ).toEqual({ answers: { grill_a: { selected: "" }, grill_m: { selected: [] } } });
    expect(
      mapping.answersToResponseInput(
        [{ id: "grill_t", header: "T", question: "qt?" }],
        [{ id: "grill_additional_notes", selected: [], custom: "" }],
      ),
    ).toEqual({ answers: { grill_t: { selected: "" } } });
  });
});
