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

struct NotaryQueueResponse: Decodable, Equatable, Sendable {
    let requests: [NotaryQueueRequestSummary]
    let meetings: [NotaryMeetingSummary]
    let counts: NotaryQueueCounts
}

struct NotaryQueueCounts: Decodable, Equatable, Sendable {
    let pending: Int?
    let scheduled: Int?
    let readyForInPerson: Int?
    let completed: Int?
    let total: Int?
}

struct NotaryQueueRequestSummary: Decodable, Identifiable, Equatable, Sendable {
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

struct NotaryRequestSummary: Decodable, Equatable, Sendable {
    let id: String
    let documentId: String
    let workflowId: String?
    let status: String?
    let queueStatus: String?
    let submittedAt: String?
}

struct NotaryDocumentSummary: Decodable, Equatable, Sendable {
    let id: String
    let idn: String?
    let status: String?
    let documentType: String?
    let jurisdiction: String?
    let createdAt: String?
    let summary: NotaryDocumentWorkspaceSummary?
}

struct NotaryDocumentWorkspaceSummary: Decodable, Equatable, Sendable {
    let finalization: NotaryDocumentFinalizationSummary?
    let verification: NotaryDocumentVerificationSummary?
}

struct NotaryDocumentFinalizationSummary: Decodable, Equatable, Sendable {
    let latestStatus: String?
    let latestStatusAt: String?
    let isAnchored: Bool?
    let isVerificationChecked: Bool?
    let isWatermarked: Bool?
    let isHashRecorded: Bool?
    let anchoredAt: String?
}

struct NotaryDocumentVerificationSummary: Decodable, Equatable, Sendable {
    let status: String?
    let idn: String?
    let verifyPath: String?
}

struct NotaryIdentitySummary: Decodable, Equatable, Sendable {
    let userId: String
    let supabaseUserId: String?
    let displayName: String?
    let fullName: String?
    let email: String?
    let role: String?
    let status: String?
}

struct NotaryWorkflowSummary: Decodable, Equatable, Sendable {
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

struct NotaryCodeDeliverySummary: Decodable, Equatable, Sendable {
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

struct NotaryMeetingSummary: Decodable, Equatable, Sendable {
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

struct NotaryFinalizationSummary: Decodable, Equatable, Sendable {
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