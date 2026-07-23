import Foundation

struct DocumentsListResponse: Codable, Equatable, Sendable {
    let documents: [DocumentsListItem]
    let pagination: DocumentsPagination?
    let facets: DocumentsFilterFacets?
    let message: String?

    func replacingDocuments(_ documents: [DocumentsListItem]) -> DocumentsListResponse {
        DocumentsListResponse(documents: documents, pagination: pagination, facets: facets, message: message)
    }
}

struct DocumentsPagination: Codable, Equatable, Sendable {
    let page: Int
    let pageSize: Int
    let total: Int
    let pageCount: Int
    let hasPreviousPage: Bool
    let hasNextPage: Bool
}

struct DocumentsFilterFacets: Codable, Equatable, Sendable {
    let documentTypes: [String]
    let statuses: [String]
    let jurisdictions: [String]
}

struct DocumentsFilterState: Equatable, Sendable {
    var productKinds: Set<DocumentsProductKind> = []
    var statusLabels: Set<String> = []
    var jurisdictions: Set<String> = []
    var createdFrom: DocumentsCreatedFromFilter?

    var isActive: Bool {
        productKinds.isEmpty == false
            || statusLabels.isEmpty == false
            || jurisdictions.isEmpty == false
            || createdFrom != nil
    }
}

enum DocumentsCreatedFromFilter: String, CaseIterable, Identifiable, Hashable, Sendable {
    case today
    case last7Days
    case last30Days
    case last90Days

    var id: String { rawValue }

    var title: String {
        switch self {
        case .today:
            "Today"
        case .last7Days:
            "Last 7 days"
        case .last30Days:
            "Last 30 days"
        case .last90Days:
            "Last 90 days"
        }
    }
}

struct DocumentsListItem: Codable, Identifiable, Equatable, Sendable {
    let id: String
    let idn: String?
    let status: String?
    let intakeStatus: String?
    let documentType: String?
    let documentTypeLabel: String?
    let principalName: String?
    let jurisdiction: String?
    let productFlowMode: String?
    let selectedFamilies: [String]?
    let createdAt: String
    let summary: DocumentsWorkspaceSummary?
    let signerSummary: DocumentsSignerSummary?
    let nextAction: DocumentsNextAction?
}

struct DocumentsWorkspaceSummary: Codable, Equatable, Sendable {
    let workflow: DocumentsWorkflowSummary?
    let finalization: DocumentsFinalizationSummary?
    let verification: DocumentsVerificationSummary?
}

struct DocumentsWorkflowSummary: Codable, Equatable, Sendable {
    let requestId: String?
    let workflowId: String?
    let requestStatus: String?
    let latestWorkflowStatus: String?
}

struct DocumentsFinalizationSummary: Codable, Equatable, Sendable {
    let latestStatus: String?
    let isAnchored: Bool?
}

struct DocumentsVerificationSummary: Codable, Equatable, Sendable {
    let status: String?
    let idn: String?
    let verifyPath: String?
}

struct DocumentsNextAction: Codable, Equatable, Sendable {
    let code: String
    let label: String
    let description: String
    let targetPath: String
    let priority: String
}

struct DocumentsSignerSummary: Codable, Equatable, Sendable {
    let signers: [DocumentsSigner]
    let signerRoles: [String]
    let pendingSignerRoles: [String]
    let pendingRequiredSignatureCount: Int
}

struct DocumentsSigner: Codable, Identifiable, Equatable, Sendable {
    let signerId: String
    let role: String
    let roleLabel: String
    let name: String?
    let status: String
    let isRequired: Bool

    var id: String { signerId }
}

struct DocumentsCategory: Identifiable, Hashable, Sendable {
    enum Kind: Hashable, Sendable {
        case recents
        case jurisdiction(String)
        case product(DocumentsProductKind)
    }

    let id: String
    let title: String
    let kind: Kind
}

enum DocumentsProductKind: String, Hashable, Sendable {
    case poa
    case trust
    case notarization

    var title: String {
        switch self {
        case .poa:
            "POA's"
        case .trust:
            "Trust Registrations"
        case .notarization:
            "Document notarizations"
        }
    }

    var filterTitle: String {
        switch self {
        case .poa:
            "Power of attorney"
        case .trust:
            "Trust registration"
        case .notarization:
            "Document notarization"
        }
    }
}

struct DocumentsDateGroup: Identifiable, Equatable, Sendable {
    let id: String
    let title: String
    let sortDate: Date
    let documents: [DocumentsListItem]
}