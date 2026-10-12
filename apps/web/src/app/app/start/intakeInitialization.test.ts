import { describe, expect, it } from "vitest";
import { intakeInitializationKey, mergeIntakeConflictAnswers } from "./intakeInitialization";

const context = {
  ownerId: "member-1",
  mode: "poa_only",
  jurisdiction: "CA",
  resumeDocumentId: "",
  retryAttempt: 0,
};

describe("intake initialization identity", () => {
  it("does not bootstrap a new POA when the same member's token rotates", () => {
    const before = { ...context, accessToken: "expired-token" };
    const after = { ...context, accessToken: "refreshed-token" };
    expect(intakeInitializationKey(after)).toBe(intakeInitializationKey(before));
  });

  it.each([
    { ownerId: "member-2" },
    { mode: "trust_bundle" },
    { jurisdiction: "OH" },
    { resumeDocumentId: "draft-2" },
    { retryAttempt: 1 },
  ])("reloads for an intentional context change: %j", (change) => {
    expect(intakeInitializationKey({ ...context, ...change }))
      .not.toBe(intakeInitializationKey(context));
  });
});

describe("intake conflict recovery", () => {
  it("preserves edits made after the stale save, including special instructions", () => {
    expect(mergeIntakeConflictAnswers(
      { principal_full_legal_name: "Old name", special_instructions_text: "Old instructions", jurisdiction: "CA" },
      { principal_full_legal_name: "Updated name", special_instructions_text: "New instructions" },
    )).toEqual({
      principal_full_legal_name: "Updated name",
      special_instructions_text: "New instructions",
      jurisdiction: "CA",
    });
  });

  it("does not restore a server value that the user intentionally cleared", () => {
    expect(mergeIntakeConflictAnswers(
      { special_instructions_text: "Remove this instruction" },
      { special_instructions_text: "" },
    )).toEqual({ special_instructions_text: "" });
  });
});
