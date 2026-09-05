import { describe, expect, it } from "vitest";
import { formatGroupedHeader } from "../src/lib/grouped-header-format.js";

describe("formatGroupedHeader", () => {
  it("wraps bare provider names in brackets", () => {
    expect(formatGroupedHeader("Copilot")).toBe("[Copilot]");
  });

  it("splits provider names from parenthetical plans", () => {
    expect(formatGroupedHeader("Copilot (business)")).toBe("[Copilot] (business)");
  });

  it("keeps already-bracketed headers untouched", () => {
    expect(formatGroupedHeader("[OpenAI] (Pro)*")).toBe("[OpenAI] (Pro)*");
  });

  it("brackets only the name when a trailing marker follows the plan", () => {
    expect(formatGroupedHeader("OpenAI (Pro)*")).toBe("[OpenAI] (Pro)*");
  });

  it("normalizes empty groups to empty brackets", () => {
    expect(formatGroupedHeader("   ")).toBe("[]");
  });
});
