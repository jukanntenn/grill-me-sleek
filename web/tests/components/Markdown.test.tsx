import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Markdown } from "../../src/components/Markdown";

describe("Markdown", () => {
  it("renders GFM tables", () => {
    const md = "| a | b |\n|---|---|\n| 1 | 2 |";
    const { container } = render(<Markdown>{md}</Markdown>);
    const table = container.querySelector("table");
    expect(table).not.toBeNull();
    expect(table?.querySelectorAll("td")).toHaveLength(2);
  });

  it("renders inline code and bold without losing content", () => {
    render(<Markdown>{"use `sqlx` **offline** mode"}</Markdown>);
    expect(screen.getByText("sqlx")).toBeInTheDocument();
    expect(screen.getByText("offline").tagName).toBe("STRONG");
  });

  it("escapes raw HTML — script content renders as text, never as markup", () => {
    const { container } = render(<Markdown>{"hi <script>alert(1)</script> <b>bold</b>"}</Markdown>);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    // The tag text is still visible (escaped), content is not lost.
    expect(container.textContent).toContain("<script>alert(1)</script>");
  });

  it("renders blockquotes and lists", () => {
    const { container } = render(<Markdown>{"> note\n\n- one\n- two"}</Markdown>);
    expect(container.querySelector("blockquote")).not.toBeNull();
    expect(container.querySelectorAll("li")).toHaveLength(2);
  });

  it("external links open in a new tab with rel hardening", () => {
    const { container } = render(<Markdown>{"[docs](https://example.com)"}</Markdown>);
    const a = container.querySelector("a");
    expect(a?.getAttribute("href")).toBe("https://example.com");
    expect(a?.getAttribute("target")).toBe("_blank");
    expect(a?.getAttribute("rel")).toContain("noreferrer");
  });
});
