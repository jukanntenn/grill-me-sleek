import { describe, it, expect } from "vitest";
import { parsePendingBody, revisionNotice, type PendingBody } from "../src/pending";

describe("parsePendingBody", () => {
  it("parses a plain pending body without revision", () => {
    expect(parsePendingBody({ status: "pending" })).toEqual({ status: "pending" });
  });

  it("parses a pending body carrying a revision", () => {
    const body = parsePendingBody({
      status: "pending",
      revised: { round: 1, revision: 2 },
    });
    expect(body).toEqual<PendingBody>({
      status: "pending",
      revised: { round: 1, revision: 2 },
    });
  });

  it("rejects non-object bodies", () => {
    expect(parsePendingBody("pending")).toBeNull();
    expect(parsePendingBody(null)).toBeNull();
  });

  it("rejects bodies without a string status", () => {
    expect(parsePendingBody({ revised: { round: 1, revision: 2 } })).toBeNull();
  });

  it("drops a malformed revised field", () => {
    expect(parsePendingBody({ status: "pending", revised: { round: "one" } })).toEqual({
      status: "pending",
    });
  });
});

describe("revisionNotice", () => {
  it("names the round and revision", () => {
    const notice = revisionNotice({ round: 3, revision: 4 });
    expect(notice).toContain("round 3");
    expect(notice).toContain("revision 4");
  });
});
