import Foundation

struct MemberInPersonSessionResponse: Decodable, Equatable, Sendable {
    let request: MemberSessionRequest
    let document: MemberSessionDocument
    let workflow: MemberSessionWorkflow?
    let owner: MemberSessionIdentity?
    let notary: MemberSessionIdentity?
    let meeting: MemberSessionMeeting?
    let warnings: [NotaryContextWarning]
    let nextAction: String?
}

struct MemberSessionRequest: Decodable, Equatable, Sendable {
    let id: String
    let documentId: String
    let workflowId: String?
    let status: String?
    let meetingStatus: String?
}

struct MemberSessionDocument: Decodable, Equatable, Sendable {
    let id: String
    let idn: String?
    let status: String?
    let documentType: String?
    let jurisdiction: String?
    let reviewDocuments: [NotaryReviewDocumentFile]
    let summary: MemberSessionDocumentSummary
}

struct MemberSessionDocumentSummary: Decodable, Equatable, Sendable {
    let verification: NotaryDocumentVerificationSummary
    let finalization: NotarySessionFinalization
}

struct MemberSessionWorkflow: Decodable, Equatable, Sendable {
    let latestStatus: String?
    let assignedNotaryUserId: String?
}

struct MemberSessionIdentity: Decodable, Equatable, Sendable {
    let displayName: String?
}

struct MemberSessionMeeting: Decodable, Equatable, Sendable {
    let meetingId: String
    let requestId: String
    let status: String?
    let samePlaceRequired: Bool
    let samePlaceStatus: String?
    let participants: [NotarySessionParticipant]
    let identityVerifications: [MemberSessionIdentityVerification]
    let proximityEvaluations: [NotaryProximityEvaluation]
    let artifacts: [NotarySessionArtifact]
}

struct MemberSessionIdentityVerification: Decodable, Equatable, Sendable {
    let id: String
    let participantRole: String
    let status: String
    let verifiedAt: String?
}

struct MemberMeetingCheckInRequest: Encodable, Equatable, Sendable {
    let participantRole = "member"
    let checkinKind = "arrival"
    let recordedAt: String
    let notes: String?
    let geolocation: NotaryGeolocationPayload
}