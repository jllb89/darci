import { describe, expect, it } from "vitest";

import {
  buildRealtimeBroadcastTargetSignature,
  buildRealtimeEqualsFilter,
  buildRealtimeTargetSignature,
  normalizeRealtimeBroadcastTargets,
  normalizeRealtimeTargets,
} from "./requestRealtime";

describe("request realtime helpers", () => {
  it("builds Supabase equality filters", () => {
    expect(buildRealtimeEqualsFilter("request_id", "req-1")).toBe("request_id=eq.req-1");
    expect(buildRealtimeEqualsFilter(" request_id ", " req-1 ")).toBe("request_id=eq.req-1");
    expect(buildRealtimeEqualsFilter("request_id", null)).toBeNull();
  });

  it("normalizes and deduplicates realtime targets", () => {
    expect(
      normalizeRealtimeTargets([
        { table: " meetings ", filter: " request_id=eq.req-1 " },
        { table: "meetings", filter: "request_id=eq.req-1" },
        { table: "" },
        { table: "meeting_checkins", filter: null },
      ]),
    ).toEqual([
      { table: "meetings", filter: "request_id=eq.req-1" },
      { table: "meeting_checkins", filter: null },
    ]);
  });

  it("builds a stable target signature", () => {
    expect(
      buildRealtimeTargetSignature([
        { table: "meetings", filter: "request_id=eq.req-1" },
        { table: "meeting_checkins", filter: null },
      ]),
    ).toBe('[{"table":"meetings","filter":"request_id=eq.req-1"},{"table":"meeting_checkins","filter":null}]');
  });

  it("normalizes broadcast targets", () => {
    expect(
      normalizeRealtimeBroadcastTargets([
        { event: " request_changed ", private: true },
        { event: "request_changed", private: true },
        { event: "" },
        { event: "queue_changed" },
      ]),
    ).toEqual([
      { event: "request_changed", private: true },
      { event: "queue_changed", private: false },
    ]);
  });

  it("builds a stable broadcast target signature", () => {
    expect(
      buildRealtimeBroadcastTargetSignature([
        { event: "request_changed", private: true },
        { event: "queue_changed", private: false },
      ]),
    ).toBe('[{"event":"request_changed","private":true},{"event":"queue_changed","private":false}]');
  });
});