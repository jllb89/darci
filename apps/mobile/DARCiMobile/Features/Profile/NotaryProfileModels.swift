import Foundation

enum NotaryQueueTab: String, CaseIterable, Identifiable, Sendable {
    case review
    case inReview
    case ready
    case completed

    var id: String { rawValue }

    var title: String {
        switch self {
        case .review:
            "NEW REQUESTS"
        case .inReview:
            "IN-REVIEW"
        case .ready:
            "READY FOR IN-PERSON"
        case .completed:
            "COMPLETED"
        }
    }

    var emptyMessage: String {
        switch self {
        case .review:
            "No new notary requests."
        case .inReview:
            "No requests currently in review."
        case .ready:
            "No requests are ready for in-person session."
        case .completed:
            "No completed requests yet."
        }
    }
}

struct NotaryQueueResponse: Codable, Equatable, Sendable {
    let realtimeQueueUserId: String?
    let requests: [NotaryQueueRequestSummary]
    let meetings: [NotaryMeetingSummary]
    let counts: NotaryQueueCounts

    func replacingRequests(_ requests: [NotaryQueueRequestSummary]) -> NotaryQueueResponse {
        NotaryQueueResponse(
            realtimeQueueUserId: realtimeQueueUserId,
            requests: requests,
            meetings: meetings,
            counts: counts
        )
    }
}

struct NotaryRequestContextResponse: Decodable, Equatable, Sendable {
    let context: NotaryRequestReviewContext?
}

struct NotaryIdnResolveRequest: Encodable, Equatable, Sendable {
    let idn: String
}

struct NotaryIdnResolveResponse: Decodable, Equatable, Sendable {
    let requestId: String
    let context: NotaryRequestReviewContext?
}

struct NotaryRequestReviewContext: Decodable, Equatable, Sendable {
    let request: NotaryRequestSummary
    let document: NotaryRequestReviewDocument
    let owner: NotaryIdentitySummary?
    let notary: NotaryIdentitySummary?
    let workflow: NotaryWorkflowSummary?
    let latestCodeDelivery: NotaryCodeDeliverySummary?
    let meeting: NotarySessionMeeting?
    let evidence: NotarySessionEvidence?
    let finalization: NotarySessionFinalization?
    let capabilities: NotaryContextCapabilities?
    let warnings: [NotaryContextWarning]?
    let nextAction: String?
}

struct NotaryRequestReviewDocument: Decodable, Equatable, Sendable {
    let id: String
    let idn: String?
    let status: String?
    let documentType: String?
    let documentTypeLabel: String?
    let jurisdiction: String?
    let createdAt: String?
    let reviewDocuments: [NotaryReviewDocumentFile]
}

struct NotaryReviewDocumentFile: Decodable, Identifiable, Equatable, Sendable {
    let id: String
    let versionId: String
    let label: String
    let fileName: String?
    let mimeType: String?
    let sizeBytes: Int?
    let isFinal: Bool
    let downloadUrl: String?
    let createdAt: String
}

struct NotaryContextCapabilities: Decodable, Equatable, Sendable {
    let canReviewRequest: Bool?
    let canManageMeeting: Bool?
    let canRecordEvidence: Bool?
    let canFinalizeDocument: Bool?
    let canOpenVerification: Bool?
}

struct NotaryContextWarning: Decodable, Equatable, Sendable {
    let code: String
    let severity: String
    let message: String
}

struct NotarySessionMeeting: Decodable, Equatable, Sendable {
    let meetingId: String
    let requestId: String
    let workflowId: String?
    let scheduledAt: String?
    let timezone: String?
    let location: String?
    let status: String?
    let samePlaceRequired: Bool
    let samePlaceStatus: String?
    let proposedSlots: [String]
    let participants: [NotarySessionParticipant]
}

struct NotarySessionParticipant: Decodable, Equatable, Sendable {
    let id: String
    let userId: String?
    let participantRole: String
    let status: String
    let presenceRequired: Bool
    let participantLabel: String?
    let arrivedAt: String?
    let departedAt: String?
}

struct NotarySessionEvidence: Decodable, Equatable, Sendable {
    let checkins: [NotarySessionCheckin]
    let geolocationSamples: [NotaryGeolocationSample]
    let identityVerifications: [NotaryIdentityVerification]
    let proximityEvaluations: [NotaryProximityEvaluation]
    let artifacts: [NotarySessionArtifact]
}

struct NotarySessionCheckin: Decodable, Equatable, Sendable {
    let id: String
    let meetingId: String
    let meetingParticipantId: String
    let participantRole: String
    let checkinKind: String
    let status: String
    let recordedAt: String
    let notes: String?
    let geolocation: NotaryGeolocationSample?
}

struct NotaryGeolocationSample: Decodable, Equatable, Sendable {
    let id: String
    let meetingParticipantId: String?
    let capturedByUserId: String?
    let latitude: Double
    let longitude: Double
    let accuracyMeters: Double?
    let altitudeMeters: Double?
    let sampleKind: String
    let captureStage: String
    let capturedAt: String
    let expiresAt: String?
}

struct NotaryIdentityVerification: Decodable, Equatable, Sendable {
    let id: String
    let status: String
    let subjectName: String?
}

struct NotaryProximityEvaluation: Decodable, Equatable, Sendable {
    let id: String
    let meetingId: String
    let evaluationKind: String
    let status: String
    let thresholdMeters: Double
    let observedDistanceMeters: Double?
    let evaluatedAt: String
    let notes: String?
    let memberSample: NotaryGeolocationSample?
    let notarySample: NotaryGeolocationSample?
}

struct NotarySessionArtifact: Decodable, Equatable, Sendable {
    let id: String
    let artifactKind: String
    let status: String
    let capturedAt: String?
    let metadata: NotarySessionArtifactMetadata?
}

struct NotarySessionArtifactMetadata: Decodable, Equatable, Sendable {
    let captureSource: String?
    let venue: NotaryVenue?
}

struct NotaryVenue: Codable, Equatable, Sendable {
    let state: String
    let county: String
    let city: String?
    let addressLine1: String?
    let locationLabel: String?
    let completedAt: String?
}

struct NotarySessionFinalization: Decodable, Equatable, Sendable {
    let latestStatus: String?
    let latestStatusAt: String?
    let isAnchored: Bool
    let isVerificationChecked: Bool
    let isWatermarked: Bool
    let isHashRecorded: Bool
    let verificationStatus: String?
    let anchoredAt: String?
    let lastCheckedAt: String?
    let publicVerifyPath: String?
    let hash: String?
    let ledgerTxId: String?
    let anchorAttempt: NotaryLedgerAnchorAttempt?
    let history: [NotaryFinalizationHistoryEvent]
}

struct NotaryLedgerAnchorAttempt: Decodable, Equatable, Sendable {
    let id: String
    let status: String
    let attemptNumber: Int
    let requestedAt: String
    let completedAt: String?
    let failedAt: String?
    let errorMessage: String?
}

struct NotaryFinalizationHistoryEvent: Decodable, Equatable, Sendable {
    let id: String
    let status: String
    let changeSource: String
    let changeReason: String?
    let createdAt: String
}

struct NotaryReviewDecisionRequest: Encodable, Equatable, Sendable {
    let decision: String
    let summary: String?
    let decisionNotes: String?
}

struct NotaryReviewDecisionResponse: Decodable, Equatable, Sendable {
    let message: String?
}

struct NotaryIdentityDocumentSchemaResponse: Decodable, Equatable, Sendable {
    let documentTypes: [NotaryIdentityDocumentTypeOption]
    let selectedType: NotaryIdentityDocumentTypeSchema
}

struct NotaryIdentityDocumentTypeOption: Decodable, Identifiable, Equatable, Sendable {
    let value: String
    let label: String
    let sortOrder: Int

    var id: String { value }
}

struct NotaryIdentityDocumentTypeSchema: Decodable, Equatable, Sendable {
    let value: String
    let label: String
    let sortOrder: Int
    let fields: [NotaryIdentityDocumentField]
}

struct NotaryIdentityDocumentField: Decodable, Identifiable, Equatable, Sendable {
    let fieldKey: String
    let label: String
    let placeholder: String?
    let inputKind: String
    let required: Bool
    let minLength: Int?
    let maxLength: Int?
    let pattern: String?
    let sortOrder: Int

    var id: String { fieldKey }
}

struct NotaryGeolocationPayload: Encodable, Equatable, Sendable {
    let latitude: Double
    let longitude: Double
    let accuracyMeters: Double?
    let altitudeMeters: Double?
    let sampleKind: String
    let captureStage: String?
}

struct NotarySessionStartRequest: Encodable, Equatable, Sendable {
    let participantRole = "notary"
    let recordedAt: String
    let notes: String?
    let geolocation: NotaryGeolocationPayload
}

struct NotaryMeetingCheckInRequest: Encodable, Equatable, Sendable {
    let participantRole = "notary"
    let checkinKind: String
    let recordedAt: String
    let notes: String?
    let geolocation: NotaryGeolocationPayload
}

struct NotaryProximityEvaluationRequest: Encodable, Equatable, Sendable {
    let thresholdMeters: Double
    let evaluatedAt: String
    let notes: String?
}

struct NotaryIdentityVerificationRequest: Encodable, Equatable, Sendable {
    let participantRole = "member"
    let verificationMethod = "in_person_document"
    let status = "verified"
    let verifiedAt: String
    let subjectName: String?
    let documentType: String
    let issuingJurisdiction: String
    let documentExpirationDate: String
    let documentNumberTail: String?
    let maskedIdentifier: String?
}

struct NotaryReverseGeocodeRequest: Encodable, Equatable, Sendable {
    let latitude: Double
    let longitude: Double
}

struct NotaryReverseGeocodeResponse: Decodable, Equatable, Sendable {
    let venue: NotaryVenue?
    let formattedAddress: String?
}

struct NotaryVenuePrefillMetadata: Encodable, Equatable, Sendable {
    let prefillSource: String
    let formattedAddress: String?
    let prefillLat: Double?
    let prefillLng: Double?
}

struct NotaryVenueCaptureRequest: Encodable, Equatable, Sendable {
    let participantRole = "notary"
    let venue: NotaryVenue
    let capturedAt: String
    let notes: String?
    let prefillMetadata: NotaryVenuePrefillMetadata
}

struct NotaryAcknowledgmentConfirmation: Encodable, Equatable, Sendable {
    let signerAppeared: Bool
    let signerAcknowledged: Bool
}

struct NotarySignRequest: Encodable, Equatable, Sendable {
    let acknowledgment: NotaryAcknowledgmentConfirmation
    let sealLabel: String
    let signatureLabel: String
    let notes: String?
}

struct NotarySessionAdvanceRequest: Encodable, Equatable, Sendable {
    let advancedAt: String
    let notes: String?
}

struct NotaryFinalPackageSubmitRequest: Encodable, Equatable, Sendable {
    let notes: String?
}

struct NotarySessionActionResponse: Decodable, Equatable, Sendable {
    let status: String?
    let advancedStep: String?
    let nextAction: String?
    let message: String?
}

struct MyNotaryProfileResponse: Decodable, Equatable, Sendable {
    let profile: EditableNotaryProfile?
}

struct EditableNotaryProfile: Decodable, Equatable, Sendable {
    let id: String?
    let userId: String?
    let jurisdiction: String?
    let serviceAreaKind: String?
    let serviceAreaName: String?
    let commissionNumber: String?
    let commissionExpiresAt: String?
    let sealStoragePath: String?
    let signatureDataUrl: String?
    let sealDataUrl: String?
    let createdAt: String?
    let updatedAt: String?
}

struct NotaryProfileUpdateRequest: Encodable, Equatable, Sendable {
    let jurisdiction: String
    let serviceAreaKind: String
    let serviceAreaName: String
    let commissionNumber: String
    let commissionExpiresAt: String
    let signatureDataUrl: String?
    let sealDataUrl: String?
}

struct NotaryServiceAreaOption: Decodable, Identifiable, Equatable, Sendable {
    let label: String
    let value: String

    var id: String { value }
}

struct NotaryServiceAreasResponse: Decodable, Equatable, Sendable {
    let jurisdiction: String?
    let abbreviation: String?
    let options: [NotaryServiceAreaOption]?
    let source: String?
    let message: String?
}

struct NotaryQueueCounts: Codable, Equatable, Sendable {
    let pending: Int?
    let scheduled: Int?
    let readyForInPerson: Int?
    let completed: Int?
    let total: Int?
}

struct NotaryQueueRequestSummary: Codable, Identifiable, Equatable, Sendable {
    let request: NotaryRequestSummary
    let document: NotaryDocumentSummary
    let owner: NotaryIdentitySummary?
    let workflow: NotaryWorkflowSummary?
    let latestCodeDelivery: NotaryCodeDeliverySummary?
    let meeting: NotaryMeetingSummary?
    let finalization: NotaryFinalizationSummary
    let nextAction: String?

    var id: String { request.id }
}

struct NotaryRequestSummary: Codable, Equatable, Sendable {
    let id: String
    let documentId: String
    let workflowId: String?
    let status: String?
    let queueStatus: String?
    let submittedAt: String?
}

struct NotaryDocumentSummary: Codable, Equatable, Sendable {
    let id: String
    let idn: String?
    let status: String?
    let documentType: String?
    let documentTypeLabel: String?
    let jurisdiction: String?
    let createdAt: String?
    let summary: NotaryDocumentWorkspaceSummary?
}

struct NotaryDocumentWorkspaceSummary: Codable, Equatable, Sendable {
    let finalization: NotaryDocumentFinalizationSummary?
    let verification: NotaryDocumentVerificationSummary?
}

struct NotaryDocumentFinalizationSummary: Codable, Equatable, Sendable {
    let latestStatus: String?
    let latestStatusAt: String?
    let isAnchored: Bool?
    let isVerificationChecked: Bool?
    let isWatermarked: Bool?
    let isHashRecorded: Bool?
    let anchoredAt: String?
}

struct NotaryDocumentVerificationSummary: Codable, Equatable, Sendable {
    let status: String?
    let idn: String?
    let verifyPath: String?
}

struct NotaryIdentitySummary: Codable, Equatable, Sendable {
    let userId: String
    let supabaseUserId: String?
    let displayName: String?
    let fullName: String?
    let email: String?
    let phone: String?
    let role: String?
    let status: String?
}

struct NotaryWorkflowSummary: Codable, Equatable, Sendable {
    let id: String?
    let status: String?
    let latestStatus: String?
    let latestStatusAt: String?
    let reviewStartedAt: String?
    let closedAt: String?
    let selectedNotaryUserId: String?
    let assignedNotaryUserId: String?
    let lastCodeGeneratedAt: String?
}

struct NotaryCodeDeliverySummary: Codable, Equatable, Sendable {
    let id: String
    let channel: String?
    let deliveryMethod: String?
    let deliveryReason: String?
    let status: String?
    let expiresAt: String?
    let deliveredAt: String?
    let consumedAt: String?
    let invalidatedAt: String?
    let createdAt: String?
}

struct NotaryMeetingSummary: Codable, Equatable, Sendable {
    let id: String
    let requestId: String
    let documentId: String
    let documentType: String?
    let ownerName: String?
    let scheduledAt: String?
    let timezone: String?
    let location: String?
    let status: String?
}

struct NotaryFinalizationSummary: Codable, Equatable, Sendable {
    let latestStatus: String?
    let latestStatusAt: String?
    let isAnchored: Bool?
    let isVerificationChecked: Bool?
    let isWatermarked: Bool?
    let isHashRecorded: Bool?
    let verificationStatus: String?
    let anchoredAt: String?
    let lastCheckedAt: String?
    let publicVerifyPath: String?
}