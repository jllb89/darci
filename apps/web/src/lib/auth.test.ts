import { describe, expect, it } from "vitest";

import { hasCompleteStoredUserProfile, type StoredUser } from "./auth";

const buildStoredUser = (overrides: Partial<StoredUser> = {}): StoredUser => ({
  id: "user-1",
  email: "member@example.com",
  phone: "+15555550123",
  role: "member",
  status: "active",
  firstName: "Member",
  lastName: "User",
  ...overrides,
});

describe("hasCompleteStoredUserProfile", () => {
  it("requires a phone number before treating the profile as complete", () => {
    expect(hasCompleteStoredUserProfile(buildStoredUser({ phone: null }))).toBe(false);
    expect(hasCompleteStoredUserProfile(buildStoredUser({ phone: "" }))).toBe(false);
    expect(hasCompleteStoredUserProfile(buildStoredUser())).toBe(true);
  });
});