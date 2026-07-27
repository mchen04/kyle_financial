import { describe, expect, it } from "vitest";
import {
  committedTextInputValue,
  refusesEmptyCommit,
  visibleTextInputValue,
} from "./buffered-text-input";

describe("what a finished edit commits", () => {
  it("says nothing when no edit was open", () => {
    expect(committedTextInputValue(null, "Rent", true)).toBeNull();
  });

  it("says nothing when the edit ends where it began", () => {
    expect(committedTextInputValue("Rent", "Rent", true)).toBeNull();
    expect(committedTextInputValue("Rent ", "Rent", true)).toBeNull();
  });

  it("drops an empty edit only on a field that refuses empty", () => {
    expect(committedTextInputValue("", "Rent", true)).toBeNull();
    expect(committedTextInputValue("   ", "Rent", true)).toBeNull();
    expect(committedTextInputValue("", "120", false)).toBe("");
  });

  it("commits the trimmed edit", () => {
    expect(committedTextInputValue("  Housing ", "Rent", true)).toBe("Housing");
  });
});

describe("which endings a field refuses an empty box on", () => {
  it("refuses on every ending when empty has no representation", () => {
    expect(refusesEmptyCommit(true, "gesture")).toBe(true);
    expect(refusesEmptyCommit(true, "document-end")).toBe(true);
  });

  it("refuses on none when empty is a value the reader can see", () => {
    expect(refusesEmptyCommit(false, "gesture")).toBe(false);
    expect(refusesEmptyCommit(false, "document-end")).toBe(false);
  });

  /**
   * Starting savings. Clearing it and then blurring, pressing Return or
   * navigating away is an act; clearing it and having the document torn down
   * underneath is not, and the balance that would erase has no undo.
   */
  it("refuses only the teardown when empty means an unrecoverable unset", () => {
    expect(refusesEmptyCommit("document-end", "gesture")).toBe(false);
    expect(refusesEmptyCommit("document-end", "document-end")).toBe(true);
  });
});

describe("buffered text editing", () => {
  it("keeps the active edit when an authoritative value arrives", () => {
    expect(visibleTextInputValue("Rent", "Rent ")).toBe("Rent ");
  });

  it("uses a newer authoritative value until the user actually edits", () => {
    expect(visibleTextInputValue("Rent", null)).toBe("Rent");
    expect(visibleTextInputValue("Housing", null)).toBe("Housing");
  });
});
