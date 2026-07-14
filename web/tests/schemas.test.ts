import { describe, it, expect } from "vitest";
import {
  buildRoundSchema,
  singleAnswerSchema,
  multiAnswerSchema,
  textAnswerSchema,
} from "../src/lib/schemas";

describe("singleAnswerSchema", () => {
  it("rejects empty selection when required", () => {
    const schema = singleAnswerSchema("default", true);
    const result = schema.safeParse({ selected: "", custom_text: "" });
    expect(result.success).toBe(false);
  });

  it("accepts a selection when required", () => {
    const schema = singleAnswerSchema("default", true);
    const result = schema.safeParse({ selected: "option-a", custom_text: "" });
    expect(result.success).toBe(true);
  });

  it("accepts empty selection when not required", () => {
    const schema = singleAnswerSchema("yesno", false);
    const result = schema.safeParse({ selected: "", custom_text: "" });
    expect(result.success).toBe(true);
  });

  it("accepts yesno values yes/no", () => {
    const schema = singleAnswerSchema("yesno", true);
    expect(schema.safeParse({ selected: "yes" }).success).toBe(true);
    expect(schema.safeParse({ selected: "no" }).success).toBe(true);
  });

  it("accepts rating numeric string", () => {
    const schema = singleAnswerSchema("rating", true);
    expect(schema.safeParse({ selected: "3" }).success).toBe(true);
    expect(schema.safeParse({ selected: "" }).success).toBe(false);
  });
});

describe("multiAnswerSchema", () => {
  it("rejects empty array when required", () => {
    const schema = multiAnswerSchema(true);
    const result = schema.safeParse({ selected: [], custom_text: "" });
    expect(result.success).toBe(false);
  });

  it("accepts empty array when not required", () => {
    const schema = multiAnswerSchema(false);
    const result = schema.safeParse({ selected: [], custom_text: "" });
    expect(result.success).toBe(true);
  });

  it("accepts non-empty array when required", () => {
    const schema = multiAnswerSchema(true);
    const result = schema.safeParse({ selected: ["a", "b"] });
    expect(result.success).toBe(true);
  });
});

describe("textAnswerSchema", () => {
  it("rejects empty when required", () => {
    const schema = textAnswerSchema(true);
    expect(schema.safeParse({ selected: "" }).success).toBe(false);
    expect(schema.safeParse({ selected: "   " }).success).toBe(false);
  });

  it("accepts empty when not required", () => {
    const schema = textAnswerSchema(false);
    expect(schema.safeParse({ selected: "" }).success).toBe(true);
  });

  it("enforces max_length", () => {
    const schema = textAnswerSchema(false, 5);
    expect(schema.safeParse({ selected: "abcde" }).success).toBe(true);
    expect(schema.safeParse({ selected: "abcdef" }).success).toBe(false);
  });

  it("enforces max_length even when required", () => {
    const schema = textAnswerSchema(true, 3);
    expect(schema.safeParse({ selected: "ab" }).success).toBe(true);
    expect(schema.safeParse({ selected: "abcd" }).success).toBe(false);
  });
});

describe("buildRoundSchema", () => {
  const questions = [
    { id: "q1", type: "single", variant: "default", required: true },
    { id: "q2", type: "multi", required: true },
    { id: "q3", type: "text", required: false, max_length: 100 },
  ];

  it("validates a complete valid form", () => {
    const schema = buildRoundSchema(questions);
    const result = schema.safeParse({
      q1: { selected: "a", custom_text: "" },
      q2: { selected: ["x"], custom_text: "" },
      q3: { selected: "hello" },
    });
    expect(result.success).toBe(true);
  });

  it("fails when required single is empty", () => {
    const schema = buildRoundSchema(questions);
    const result = schema.safeParse({
      q1: { selected: "", custom_text: "" },
      q2: { selected: ["x"], custom_text: "" },
      q3: { selected: "" },
    });
    expect(result.success).toBe(false);
  });

  it("fails when required multi is empty", () => {
    const schema = buildRoundSchema(questions);
    const result = schema.safeParse({
      q1: { selected: "a", custom_text: "" },
      q2: { selected: [], custom_text: "" },
      q3: { selected: "" },
    });
    expect(result.success).toBe(false);
  });

  it("validates additional_notes when configured", () => {
    const schema = buildRoundSchema(questions, { required: true, max_length: 50 });
    const valid = schema.safeParse({
      q1: { selected: "a" },
      q2: { selected: ["x"] },
      q3: { selected: "" },
      additional_notes: "a note",
    });
    expect(valid.success).toBe(true);

    const empty = schema.safeParse({
      q1: { selected: "a" },
      q2: { selected: ["x"] },
      q3: { selected: "" },
      additional_notes: "  ",
    });
    expect(empty.success).toBe(false);
  });
});
