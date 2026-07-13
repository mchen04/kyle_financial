import { describe, expect, it } from "vitest";
import { visibleTextInputValue } from "./buffered-text-input";

describe("buffered text editing", () => {
  it("keeps the active edit when an authoritative value arrives", () => {
    expect(visibleTextInputValue("Rent", "Rent ")).toBe("Rent ");
  });

  it("uses a newer authoritative value until the user actually edits", () => {
    expect(visibleTextInputValue("Rent", null)).toBe("Rent");
    expect(visibleTextInputValue("Housing", null)).toBe("Housing");
  });
});
