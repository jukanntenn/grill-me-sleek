import { describe, it, expect, afterEach } from "vitest";
import { reviseResponse, fetchSession, fetchRounds } from "../src/lib/api";

const originalFetch = globalThis.fetch;

function stubFetch(status: number, body: unknown) {
  globalThis.fetch = (() =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
      headers: new Headers(),
    })) as unknown as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("reviseResponse (PUT)", () => {
  it("maps 200 to ok", async () => {
    stubFetch(200, { round: 1, revision: 2 });
    const result = await reviseResponse("s", 1, { q1: { selected: "B" } });
    expect(result).toEqual({ ok: true });
  });

  it("maps 409 to not-answered (round has no response yet)", async () => {
    stubFetch(409, { message: "round 1 has no response yet" });
    const result = await reviseResponse("s", 1, { q1: { selected: "B" } });
    expect(result).toEqual({ ok: false, kind: "not-answered" });
  });

  it("maps 410 to gone with detail", async () => {
    stubFetch(410, { status: "gone", detail: "completed" });
    const result = await reviseResponse("s", 1, { q1: { selected: "B" } });
    expect(result).toEqual({ ok: false, kind: "gone", detail: "completed" });
  });

  it("maps 400 to bad-request with message", async () => {
    stubFetch(400, { message: "validation failed" });
    const result = await reviseResponse("s", 1, { q1: { selected: "B" } });
    expect(result).toEqual({ ok: false, kind: "bad-request", message: "validation failed" });
  });

  it("maps network failure to network-error", async () => {
    globalThis.fetch = (() => Promise.reject(new Error("offline"))) as unknown as typeof fetch;
    const result = await reviseResponse("s", 1, { q1: { selected: "B" } });
    expect(result).toEqual({ ok: false, kind: "network-error" });
  });
});

describe("fetchSession", () => {
  it("returns the session payload on 200", async () => {
    stubFetch(200, { session_id: "s", status: "active", current_round: 2, name: "Plan X" });
    const result = await fetchSession("s");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.session.name).toBe("Plan X");
  });

  it("returns gone on 410", async () => {
    stubFetch(410, { status: "gone", detail: "expired" });
    const result = await fetchSession("s");
    expect(result).toEqual({ ok: false, kind: "gone" });
  });
});

describe("fetchRounds", () => {
  it("returns summaries with revision counters", async () => {
    stubFetch(200, [{ round: 1, name: "A", has_response: true, revision: 2 }]);
    const list = await fetchRounds("s");
    expect(list?.[0].revision).toBe(2);
  });

  it("returns null on failure (graceful degradation for the stepper)", async () => {
    stubFetch(500, {});
    expect(await fetchRounds("s")).toBeNull();
  });
});
