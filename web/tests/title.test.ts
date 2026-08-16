import { describe, it, expect } from "vitest";
import { sessionTitle } from "../src/lib/title";

describe("sessionTitle", () => {
  it("puts the project name first so tabs stay distinguishable when truncated", () => {
    expect(sessionTitle("数据库重构计划")).toBe("数据库重构计划 — grill-me-sleek");
  });

  it("keeps plain ASCII names readable", () => {
    expect(sessionTitle("CI slim-down")).toBe("CI slim-down — grill-me-sleek");
  });
});
