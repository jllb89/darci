import Foundation

enum JSONValue: Codable, Equatable, Sendable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()

        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Int.self) {
            self = .number(Double(value))
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else if let value = try? container.decode([String: JSONValue].self) {
            self = .object(value)
        } else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported JSON value")
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()

        switch self {
        case .string(let value):
            try container.encode(value)
        case .number(let value):
            try container.encode(value)
        case .bool(let value):
            try container.encode(value)
        case .object(let value):
            try container.encode(value)
        case .array(let value):
            try container.encode(value)
        case .null:
            try container.encodeNil()
        }
    }

    var stringValue: String? {
        guard case .string(let value) = self else {
            return nil
        }

        return value
    }

    var stringArrayValue: [String]? {
        guard case .array(let values) = self else {
            return nil
        }

        return values.compactMap(\.stringValue)
    }

    var objectValue: [String: JSONValue]? {
        guard case .object(let value) = self else {
            return nil
        }

        return value
    }
}

struct IntakeJurisdictionOption: Decodable, Identifiable, Equatable, Sendable {
    let code: String
    let label: String

    var id: String { code }
}

struct ProductFlowModeFamily: Decodable, Equatable, Sendable {
    let family: String
    let defaultDocumentType: String?
    let isRequired: Bool?
    let sortOrder: Int?
}

struct ProductFlowModeDefinition: Decodable, Equatable, Sendable {
    let modeKey: String
    let displayName: String
    let description: String?
    let isActive: Bool
    let isDefault: Bool?
    let sortOrder: Int
    let families: [ProductFlowModeFamily]?
}

struct MemberFormJurisdictionsResponse: Decodable, Equatable, Sendable {
    let mode: ProductFlowModeDefinition?
    let jurisdictions: [IntakeJurisdictionOption]?
    let message: String?
}

struct MemberFormResponse: Decodable, Equatable, Sendable {
    let memberForm: MemberFormRulesContract?
    let message: String?
}

struct MemberFormRulesContract: Decodable, Equatable, Sendable {
    let jurisdiction: String
    let families: [String]
    let documentTypes: [String]
    let productFlowMode: ProductFlowModeDefinition?
    let aggregatedForm: MemberFacingFormContract
}

struct MemberFacingFormContract: Decodable, Equatable, Sendable {
    let jurisdiction: String
    let families: [String]
    let documentTypes: [String]
    let sections: [MemberFacingSection]

    enum CodingKeys: String, CodingKey {
        case jurisdiction
        case families
        case documentTypes = "document_types"
        case sections
    }
}

struct MemberFacingSection: Decodable, Identifiable, Equatable, Sendable {
    let key: String
    let title: String
    let fields: [MemberFacingField]

    var id: String { key }
}

struct MemberFacingField: Decodable, Identifiable, Equatable, Sendable {
    let canonicalKey: String
    let label: String
    let semanticType: String
    let dataType: String
    let required: Bool
    let repeatable: Bool
    let helpText: String?
    let validation: [String: JSONValue]?

    var id: String { canonicalKey }

    enum CodingKeys: String, CodingKey {
        case canonicalKey = "canonical_key"
        case label
        case semanticType = "semantic_type"
        case dataType = "data_type"
        case required
        case repeatable
        case helpText = "help_text"
        case validation
    }

    var allowedOptions: [IntakeOption] {
        let values = validation?["allowed_values"]?.stringArrayValue ?? []
        let labels = validation?["allowed_value_labels"]?.objectValue ?? [:]

        return values.map { value in
            IntakeOption(
                id: value,
                label: labels[value]?.stringValue ?? Self.defaultLabel(for: value)
            )
        }
    }

    private static func defaultLabel(for value: String) -> String {
        value
            .split(separator: "_")
            .map { segment in
                segment.prefix(1).uppercased() + segment.dropFirst()
            }
            .joined(separator: " ")
    }
}

struct IntakeOption: Identifiable, Equatable, Sendable {
    let id: String
    let label: String
}

struct DocumentSummary: Decodable, Equatable, Sendable {
    let id: String
}

struct DocumentVersionSummary: Decodable, Equatable, Sendable {
    let id: String
    let version: Int?
    let storagePath: String?
    let fileName: String?
    let mimeType: String?
    let sizeBytes: Int?
    let isFinal: Bool?
    let createdAt: String?
}

struct DocumentUploadTarget: Decodable, Equatable, Sendable {
    let bucket: String?
    let path: String?
    let signedUrl: String
    let token: String?
}

struct DocumentUploadCreateResponse: Decodable, Equatable, Sendable {
    let document: DocumentSummary?
    let version: DocumentVersionSummary?
    let upload: DocumentUploadTarget?
    let message: String?
}

struct DocumentUploadFinalizeResponse: Decodable, Equatable, Sendable {
    let document: DocumentSummary?
    let message: String?
}

struct DocumentIntakeDraft: Decodable, Equatable, Sendable {
    let documentId: String
    let ownerId: String?
    let productFlowMode: String
    let jurisdiction: String
    let currentStep: String?
    let rulesSnapshotVersion: String
    let answers: [String: JSONValue]
    let canonicalAnswers: [String: JSONValue]?
    let revision: Int
    let createdAt: String?
    let updatedAt: String?
}

struct DocumentIntakeBootstrapResponse: Decodable, Equatable, Sendable {
    let created: Bool?
    let document: DocumentSummary?
    let draft: DocumentIntakeDraft?
    let message: String?
}

struct DocumentIntakeDraftResponse: Decodable, Equatable, Sendable {
    let draft: DocumentIntakeDraft?
    let message: String?
    let currentRevision: Int?
    let intakeStatus: String?
}

struct DocumentIntakeSubmitResponse: Decodable, Equatable, Sendable {
    let draft: DocumentIntakeDraft?
    let canonicalPayload: [String: JSONValue]?
    let valid: Bool?
    let message: String?
    let errors: [DocumentIntakeValidationError]?
    let currentRevision: Int?
    let intakeStatus: String?
}

struct DocumentIntakeValidationError: Decodable, Equatable, Sendable {
    let code: String?
    let field: String?
    let message: String?
}

struct DocumentIntakeBootstrapRequest: Encodable, Equatable, Sendable {
    let productFlowMode: String
    let jurisdiction: String
    let rulesSnapshotVersion: String
    let resumeLatestDraft: Bool
}

struct DocumentIntakeDraftUpsertRequest: Encodable, Equatable, Sendable {
    let currentStep: String
    let rulesSnapshotVersion: String
    let answers: [String: JSONValue]
    let expectedRevision: Int?
}

struct DocumentIntakeSubmitRequest: Encodable, Equatable, Sendable {
    let currentStep: String
    let rulesSnapshotVersion: String
    let answers: [String: JSONValue]
    let expectedRevision: Int?
}

struct DocumentUploadCreateRequest: Encodable, Equatable, Sendable {
    let productFlowMode: String
    let documentType: String
    let jurisdiction: String
    let fileName: String
    let fileSize: Int
    let mimeType: String
    let documentDescription: String
    let notarizationReason: String
    let requesterName: String
    let requesterEmail: String
    let requesterPhone: String
    let requesterPhoneCountryCode: String
}

struct DocumentUploadFinalizeRequest: Encodable, Equatable, Sendable {
    let documentVersionId: String
}

struct AddressAutocompleteRequest: Encodable, Equatable, Sendable {
    let input: String
    let sessionToken: String
}

struct AddressAutocompleteSuggestion: Decodable, Identifiable, Equatable, Sendable {
    let placeId: String
    let description: String
    let mainText: String?
    let secondaryText: String?
    let types: [String]?

    var id: String { placeId }
}

struct AddressAutocompleteResponse: Decodable, Equatable, Sendable {
    let jurisdiction: String?
    let country: String?
    let suggestions: [AddressAutocompleteSuggestion]?
    let message: String?
}

struct AddressDetailsRequest: Encodable, Equatable, Sendable {
    let placeId: String
    let sessionToken: String
}

struct AddressDetails: Decodable, Equatable, Sendable {
    let formattedAddress: String?
    let normalizedAddress: String?
}

struct AddressDetailsResponse: Decodable, Equatable, Sendable {
    let jurisdiction: String?
    let country: String?
    let placeId: String?
    let address: AddressDetails?
    let message: String?
}

struct IntakePersonContact: Codable, Equatable, Sendable {
    var email: String = ""
    var phoneCountryIso2: String = "US"
    var phoneCountryCode: String = "+1"
    var phone: String = ""
}

struct IntakePersonDetails: Equatable, Sendable {
    var fullLegalName = ""
    var addressLine1 = ""
    var addressLine2 = ""
    var contact = IntakePersonContact()

    var address: String {
        [addressLine1, addressLine2]
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { $0.isEmpty == false }
            .joined(separator: "\n")
    }
}

struct IntakePersonListItem: Codable, Equatable, Sendable {
    var fullName: String
    var email: String
    var address: String
    var phoneCountryIso2: String
    var phoneCountryCode: String
    var phone: String
    var isSigningTrustee: Bool

    init(
        fullName: String = "",
        email: String = "",
        address: String = "",
        phoneCountryIso2: String = "US",
        phoneCountryCode: String = "+1",
        phone: String = "",
        isSigningTrustee: Bool = false
    ) {
        self.fullName = fullName
        self.email = email
        self.address = address
        self.phoneCountryIso2 = phoneCountryIso2
        self.phoneCountryCode = phoneCountryCode
        self.phone = phone
        self.isSigningTrustee = isSigningTrustee
    }

    private enum CodingKeys: String, CodingKey {
        case fullName
        case email
        case address
        case phoneCountryIso2
        case phoneCountryCode
        case phone
        case isSigningTrustee
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        fullName = try container.decodeIfPresent(String.self, forKey: .fullName) ?? ""
        email = try container.decodeIfPresent(String.self, forKey: .email) ?? ""
        address = try container.decodeIfPresent(String.self, forKey: .address) ?? ""
        phoneCountryIso2 = try container.decodeIfPresent(String.self, forKey: .phoneCountryIso2) ?? "US"
        phoneCountryCode = try container.decodeIfPresent(String.self, forKey: .phoneCountryCode) ?? "+1"
        phone = try container.decodeIfPresent(String.self, forKey: .phone) ?? ""
        isSigningTrustee = try container.decodeIfPresent(Bool.self, forKey: .isSigningTrustee) ?? false
    }
}

struct IntakePriorDocumentItem: Codable, Equatable, Sendable {
    var chronologyOrder: Int
    var documentType: String = ""
    var documentLabel: String = ""
    var documentDate: String = ""
    var attachmentReference: String = ""
}

enum POAIntakeStep: String, CaseIterable, Identifiable, Sendable {
    case productInfo
    case trustBasicInformation
    case trustPeople
    case trustAuthority
    case trustDocuments
    case principal
    case agent
    case authority
    case notarization

    var id: String { rawValue }

    var progressIndex: Int {
        switch self {
        case .productInfo:
            1
        case .trustBasicInformation:
            1
        case .trustPeople:
            2
        case .trustAuthority:
            3
        case .trustDocuments:
            4
        case .principal:
            2
        case .agent:
            3
        case .authority:
            4
        case .notarization:
            1
        }
    }

    var topLabel: String? {
        switch self {
        case .productInfo:
            nil
        case .trustBasicInformation:
            "Trust basics"
        case .trustPeople:
            "People"
        case .trustAuthority:
            "Authority"
        case .trustDocuments:
            "Documents to include"
        case .principal:
            "Principal's information"
        case .agent:
            "Agent's information"
        case .authority:
            "Authority"
        case .notarization:
            "Document notarization"
        }
    }

    var persistedStepKey: String {
        switch self {
        case .productInfo:
            "general_information"
        case .trustBasicInformation, .trustPeople, .trustAuthority, .trustDocuments:
            "trust_requirements"
        case .principal, .agent, .authority:
            "poa_requirements"
        case .notarization:
            "general_information"
        }
    }

    var next: POAIntakeStep? {
        switch self {
        case .productInfo:
            .principal
        case .trustBasicInformation:
            .trustPeople
        case .trustPeople:
            .trustAuthority
        case .trustAuthority:
            .trustDocuments
        case .trustDocuments:
            .principal
        case .principal:
            .agent
        case .agent:
            .authority
        case .authority:
            nil
        case .notarization:
            nil
        }
    }

    var previous: POAIntakeStep? {
        switch self {
        case .productInfo:
            nil
        case .trustBasicInformation:
            nil
        case .trustPeople:
            .trustBasicInformation
        case .trustAuthority:
            .trustPeople
        case .trustDocuments:
            .trustAuthority
        case .principal:
            .productInfo
        case .agent:
            .principal
        case .authority:
            .agent
        case .notarization:
            nil
        }
    }
}