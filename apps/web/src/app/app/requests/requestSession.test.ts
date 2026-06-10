import { describe, expect, it } from "vitest";

import {
  canRecordMemberSessionCheckIn,
  hasRequestSessionParticipantCheckedIn,
  shouldShowMemberSessionCheckIn,
  type RequestSessionMeeting,
} from "./requestSession";

const buildMeeting = (memberStatus: string | null): RequestSessionMeeting => ({
  status: "in_progress",
  participants: [
    {
      participantRole: "notary",
      status: "checked_in",
      arrivedAt: "2026-06-09T15:00:00.000Z",
    },
    {
      participantRole: "member",
      status: memberStatus,
      arrivedAt: null,
    },
  ],
});

describe("requestSession", () => {
  it("shows member check-in while the live session is waiting on the member", () => {
    expect(shouldShowMemberSessionCheckIn(buildMeeting("expected"))).toBe(true);
  });

  it("hides member check-in after the member has checked in", () => {
    expect(shouldShowMemberSessionCheckIn(buildMeeting("checked_in"))).toBe(false);
  });

  it("allows a member location refresh while the session remains in progress", () => {
    expect(canRecordMemberSessionCheckIn(buildMeeting("checked_in"))).toBe(true);
  });

  it("treats an arrival timestamp as checked in", () => {
    const meeting = buildMeeting("expected");
    const member = meeting?.participants.find((participant) => participant.participantRole === "member");
    if (member) {
      member.arrivedAt = "2026-06-09T15:03:00.000Z";
    }

    expect(hasRequestSessionParticipantCheckedIn(meeting, "member")).toBe(true);
    expect(shouldShowMemberSessionCheckIn(meeting)).toBe(false);
    expect(canRecordMemberSessionCheckIn(meeting)).toBe(true);
  });
});