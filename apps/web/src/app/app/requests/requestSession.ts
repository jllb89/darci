export type RequestSessionParticipant = {
  participantRole: string | null;
  status: string | null;
  arrivedAt?: string | null;
};

export type RequestSessionMeeting = {
  status: string | null;
  participants: RequestSessionParticipant[];
} | null | undefined;

const checkedInParticipantStatuses = new Set(["checked_in", "completed"]);

export const getRequestSessionParticipant = (
  meeting: RequestSessionMeeting,
  participantRole: "member" | "notary",
) => {
  return meeting?.participants.find((participant) => participant.participantRole === participantRole) ?? null;
};

export const hasRequestSessionParticipantCheckedIn = (
  meeting: RequestSessionMeeting,
  participantRole: "member" | "notary",
) => {
  const participant = getRequestSessionParticipant(meeting, participantRole);
  if (!participant) {
    return false;
  }

  return checkedInParticipantStatuses.has(participant.status ?? "") || Boolean(participant.arrivedAt);
};

export const shouldShowMemberSessionCheckIn = (meeting: RequestSessionMeeting) => {
  return meeting?.status === "in_progress" && !hasRequestSessionParticipantCheckedIn(meeting, "member");
};

export const canRecordMemberSessionCheckIn = (meeting: RequestSessionMeeting) => {
  return meeting?.status === "in_progress";
};