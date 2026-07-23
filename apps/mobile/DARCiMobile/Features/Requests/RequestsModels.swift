import Foundation

enum SigningRequestDirection: String, Codable, Sendable {
    case incoming
    case outgoing
}

enum SigningRequestActionKind: String, Codable, Sendable {
    case openSigning = "open_signing"
    case claimAndSign = "claim_and_sign"
    case none
}

struct SigningRequestsResponse: Decodable, Equatable, Sendable {
    let incoming: [SigningRequestCard]?
    let outgoing: [SigningRequestCard]?
}

struct SigningRequestCard: Decodable, Identifiable, Equatable, Sendable {
    let id: String
    let inviteId: String
    let direction: SigningRequestDirection
    let documentId: String
    let documentLabel: String
    let documentTypeLabel: String
    let signerName: String?
    let signerEmail: String?
    let signerPhone: String?
    let senderName: String?
    let senderEmail: String?
    let roleLabel: String
    let status: String
    let sentAt: String?
    let updatedAt: String
    let expiresAt: String?
    let completedAt: String?
    let firstOpenedAt: String?
    let firstClickedAt: String?
    let resendCount: Int
    let actionKind: SigningRequestActionKind?
    let actionHref: String?
    let actionLabel: String
    let detail: String
}

struct RequestFilters: Equatable, Sendable {
    var query = ""
    var statuses: Set<String> = []
    var roles: Set<String> = []
    var activities: Set<RequestsActivityFilter> = []

    var isActive: Bool {
        query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
            || statuses.isEmpty == false
            || roles.isEmpty == false
            || activities.isEmpty == false
    }
}

enum RequestsLane: String, CaseIterable, Identifiable, Sendable {
    case inbox
    case outbox

    var id: String { rawValue }

    var title: String {
        switch self {
        case .inbox:
            "Inbox"
        case .outbox:
            "Outbox"
        }
    }

    var subtitle: String {
        switch self {
        case .inbox:
            "Documents where another party is waiting on your signature."
        case .outbox:
            "Documents waiting on signers you invited."
        }
    }
}

enum RequestsActivityFilter: String, CaseIterable, Identifiable, Sendable {
    case needsSignature = "needs_signature"
    case waiting
    case opened
    case clicked
    case completed

    var id: String { rawValue }

    var title: String {
        switch self {
        case .needsSignature:
            "Needs my signature"
        case .waiting:
            "Waiting on signer"
        case .opened:
            "Opened"
        case .clicked:
            "Clicked"
        case .completed:
            "Completed"
        }
    }
}

enum RequestSendState: Equatable, Sendable {
    case sending
    case sent
    case error
}

struct RequestsEmptyRequest: Encodable, Equatable, Sendable {}

struct InviteOpenResponse: Decodable, Equatable, Sendable {
    let signingHref: String?
    let message: String?
}

struct InviteResendResponse: Decodable, Equatable, Sendable {
    let existing: Bool?
}
