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
    let requests: [NotaryQueueRequestSummary]
    let meetings: [NotaryMeetingSummary]
    let counts: NotaryQueueCounts

    func replacingRequests(_ requests: [NotaryQueueRequestSummary]) -> NotaryQueueResponse {
        NotaryQueueResponse(requests: requests, meetings: meetings, counts: counts)
    }
}

struct NotaryRequestContextResponse: Decodable, Equatable, Sendable {
    let context: NotaryRequestReviewContext?
}

struct NotaryRequestReviewContext: Decodable, Equatable, Sendable {
    let request: NotaryRequestSummary
    let document: NotaryRequestReviewDocument
    let capabilities: NotaryContextCapabilities?
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

struct NotaryReviewDecisionRequest: Encodable, Equatable, Sendable {
    let decision: String
    let summary: String?
    let decisionNotes: String?
}

struct NotaryReviewDecisionResponse: Decodable, Equatable, Sendable {
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