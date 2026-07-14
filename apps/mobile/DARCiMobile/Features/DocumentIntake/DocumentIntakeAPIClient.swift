import Foundation

protocol DocumentIntakeAPIProviding: Sendable {
    func listMemberFormJurisdictions(modeKey: String, accessToken: String) async throws -> MemberFormJurisdictionsResponse
    func getMemberForm(jurisdiction: String, modeKey: String, accessToken: String) async throws -> MemberFormResponse
    func bootstrapDocumentIntake(_ request: DocumentIntakeBootstrapRequest, accessToken: String) async throws -> DocumentIntakeBootstrapResponse
    func getDocumentIntakeDraft(documentId: String, accessToken: String) async throws -> DocumentIntakeDraftResponse
    func saveDocumentIntakeDraft(documentId: String, request: DocumentIntakeDraftUpsertRequest, accessToken: String) async throws -> DocumentIntakeDraftResponse
    func submitDocumentIntakeDraft(documentId: String, request: DocumentIntakeSubmitRequest, accessToken: String) async throws -> DocumentIntakeSubmitResponse
    func createDocumentUpload(_ request: DocumentUploadCreateRequest, accessToken: String) async throws -> DocumentUploadCreateResponse
    func uploadDocument(data: Data, mimeType: String, to signedUrl: URL) async throws
    func finalizeDocumentUpload(documentId: String, request: DocumentUploadFinalizeRequest, accessToken: String) async throws -> DocumentUploadFinalizeResponse
    func autocompleteAddress(jurisdiction: String, request: AddressAutocompleteRequest, accessToken: String) async throws -> AddressAutocompleteResponse
    func resolveAddressDetails(jurisdiction: String, request: AddressDetailsRequest, accessToken: String) async throws -> AddressDetailsResponse
}

struct DocumentIntakeAPIClient: DocumentIntakeAPIProviding, Sendable {
    private let authClient: AuthAPIClient
    private let urlSession: URLSession

    init(authClient: AuthAPIClient = AuthAPIClient(), urlSession: URLSession = .shared) {
        self.authClient = authClient
        self.urlSession = urlSession
    }

    func listMemberFormJurisdictions(modeKey: String, accessToken: String) async throws -> MemberFormJurisdictionsResponse {
        try await authClient.get(
            path: "/rules/member-form",
            queryItems: [URLQueryItem(name: "mode", value: modeKey)],
            accessToken: accessToken
        )
    }

    func getMemberForm(jurisdiction: String, modeKey: String, accessToken: String) async throws -> MemberFormResponse {
        try await authClient.get(
            path: "/rules/member-form/\(jurisdiction)",
            queryItems: [URLQueryItem(name: "mode", value: modeKey)],
            accessToken: accessToken
        )
    }

    func bootstrapDocumentIntake(_ request: DocumentIntakeBootstrapRequest, accessToken: String) async throws -> DocumentIntakeBootstrapResponse {
        try await authClient.post(path: "/documents/intake/bootstrap", body: request, accessToken: accessToken)
    }

    func getDocumentIntakeDraft(documentId: String, accessToken: String) async throws -> DocumentIntakeDraftResponse {
        try await authClient.get(path: "/documents/\(documentId)/intake-draft", accessToken: accessToken)
    }

    func saveDocumentIntakeDraft(documentId: String, request: DocumentIntakeDraftUpsertRequest, accessToken: String) async throws -> DocumentIntakeDraftResponse {
        try await authClient.put(path: "/documents/\(documentId)/intake-draft", body: request, accessToken: accessToken)
    }

    func submitDocumentIntakeDraft(documentId: String, request: DocumentIntakeSubmitRequest, accessToken: String) async throws -> DocumentIntakeSubmitResponse {
        try await authClient.post(path: "/documents/\(documentId)/intake-submit", body: request, accessToken: accessToken)
    }

    func createDocumentUpload(_ request: DocumentUploadCreateRequest, accessToken: String) async throws -> DocumentUploadCreateResponse {
        try await authClient.post(path: "/documents", body: request, accessToken: accessToken)
    }

    func uploadDocument(data: Data, mimeType: String, to signedUrl: URL) async throws {
        var request = URLRequest(url: signedUrl)
        request.httpMethod = "PUT"
        request.setValue(mimeType, forHTTPHeaderField: "Content-Type")

        let (_, response) = try await urlSession.upload(for: request, from: data)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw AuthAPIError.invalidResponse
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            throw AuthAPIError.unexpectedStatus(statusCode: httpResponse.statusCode, message: "Failed to upload the PDF.")
        }
    }

    func finalizeDocumentUpload(documentId: String, request: DocumentUploadFinalizeRequest, accessToken: String) async throws -> DocumentUploadFinalizeResponse {
        try await authClient.post(path: "/documents/\(documentId)/upload-finalize", body: request, accessToken: accessToken)
    }

    func autocompleteAddress(jurisdiction: String, request: AddressAutocompleteRequest, accessToken: String) async throws -> AddressAutocompleteResponse {
        try await authClient.post(
            path: "/rules/member-form/\(jurisdiction)/address-autocomplete",
            body: request,
            accessToken: accessToken
        )
    }

    func resolveAddressDetails(jurisdiction: String, request: AddressDetailsRequest, accessToken: String) async throws -> AddressDetailsResponse {
        try await authClient.post(
            path: "/rules/member-form/\(jurisdiction)/address-details",
            body: request,
            accessToken: accessToken
        )
    }
}

struct MockDocumentIntakeAPIClient: DocumentIntakeAPIProviding, Sendable {
    var jurisdictions = [IntakeJurisdictionOption(code: "CA", label: "California")]

    func listMemberFormJurisdictions(modeKey: String, accessToken: String) async throws -> MemberFormJurisdictionsResponse {
        MemberFormJurisdictionsResponse(mode: nil, jurisdictions: jurisdictions, message: nil)
    }

    func getMemberForm(jurisdiction: String, modeKey: String, accessToken: String) async throws -> MemberFormResponse {
        MemberFormResponse(memberForm: modeKey == "trust_bundle" ? .previewTrustBundle(jurisdiction: jurisdiction) : .previewPOA(jurisdiction: jurisdiction), message: nil)
    }

    func bootstrapDocumentIntake(_ request: DocumentIntakeBootstrapRequest, accessToken: String) async throws -> DocumentIntakeBootstrapResponse {
        DocumentIntakeBootstrapResponse(
            created: true,
            document: DocumentSummary(id: "document-1"),
            draft: DocumentIntakeDraft(
                documentId: "document-1",
                ownerId: "user-1",
                productFlowMode: request.productFlowMode,
                jurisdiction: request.jurisdiction,
                currentStep: "general_information",
                rulesSnapshotVersion: request.rulesSnapshotVersion,
                answers: [:],
                canonicalAnswers: nil,
                revision: 0,
                createdAt: nil,
                updatedAt: nil
            ),
            message: nil
        )
    }

    func getDocumentIntakeDraft(documentId: String, accessToken: String) async throws -> DocumentIntakeDraftResponse {
        DocumentIntakeDraftResponse(draft: nil, message: nil, currentRevision: nil, intakeStatus: nil)
    }

    func saveDocumentIntakeDraft(documentId: String, request: DocumentIntakeDraftUpsertRequest, accessToken: String) async throws -> DocumentIntakeDraftResponse {
        DocumentIntakeDraftResponse(
            draft: DocumentIntakeDraft(
                documentId: documentId,
                ownerId: "user-1",
                productFlowMode: request.answers.keys.contains("trust_name") ? "trust_bundle" : "poa_only",
                jurisdiction: "CA",
                currentStep: request.currentStep,
                rulesSnapshotVersion: request.rulesSnapshotVersion,
                answers: request.answers,
                canonicalAnswers: nil,
                revision: (request.expectedRevision ?? 0) + 1,
                createdAt: nil,
                updatedAt: nil
            ),
            message: nil,
            currentRevision: nil,
            intakeStatus: nil
        )
    }

    func submitDocumentIntakeDraft(documentId: String, request: DocumentIntakeSubmitRequest, accessToken: String) async throws -> DocumentIntakeSubmitResponse {
        DocumentIntakeSubmitResponse(
            draft: DocumentIntakeDraft(
                documentId: documentId,
                ownerId: "user-1",
                productFlowMode: request.answers.keys.contains("trust_name") ? "trust_bundle" : "poa_only",
                jurisdiction: "CA",
                currentStep: request.currentStep,
                rulesSnapshotVersion: request.rulesSnapshotVersion,
                answers: request.answers,
                canonicalAnswers: request.answers,
                revision: (request.expectedRevision ?? 0) + 1,
                createdAt: nil,
                updatedAt: nil
            ),
            canonicalPayload: request.answers,
            valid: true,
            message: nil,
            errors: nil,
            currentRevision: nil,
            intakeStatus: nil
        )
    }

    func createDocumentUpload(_ request: DocumentUploadCreateRequest, accessToken: String) async throws -> DocumentUploadCreateResponse {
        DocumentUploadCreateResponse(
            document: DocumentSummary(id: "document-upload-1"),
            version: DocumentVersionSummary(id: "version-1", version: 1, storagePath: nil, fileName: request.fileName, mimeType: request.mimeType, sizeBytes: request.fileSize, isFinal: false, createdAt: nil),
            upload: DocumentUploadTarget(bucket: nil, path: nil, signedUrl: "https://upload.example.test/document.pdf", token: nil),
            message: nil
        )
    }

    func uploadDocument(data: Data, mimeType: String, to signedUrl: URL) async throws {}

    func finalizeDocumentUpload(documentId: String, request: DocumentUploadFinalizeRequest, accessToken: String) async throws -> DocumentUploadFinalizeResponse {
        DocumentUploadFinalizeResponse(document: DocumentSummary(id: documentId), message: nil)
    }

    func autocompleteAddress(jurisdiction: String, request: AddressAutocompleteRequest, accessToken: String) async throws -> AddressAutocompleteResponse {
        AddressAutocompleteResponse(
            jurisdiction: jurisdiction,
            country: "US",
            suggestions: [
                AddressAutocompleteSuggestion(
                    placeId: "mock-place-1",
                    description: "101 Harbor View Ln, Austin, TX 78701",
                    mainText: "101 Harbor View Ln",
                    secondaryText: "Austin, TX 78701",
                    types: ["street_address"]
                )
            ],
            message: nil
        )
    }

    func resolveAddressDetails(jurisdiction: String, request: AddressDetailsRequest, accessToken: String) async throws -> AddressDetailsResponse {
        AddressDetailsResponse(
            jurisdiction: jurisdiction,
            country: "US",
            placeId: request.placeId,
            address: AddressDetails(
                formattedAddress: "101 Harbor View Ln, Austin, TX 78701",
                normalizedAddress: "101 Harbor View Ln, Austin, TX 78701"
            ),
            message: nil
        )
    }
}

extension MemberFormRulesContract {
    static func previewTrustBundle(jurisdiction: String = "CA") -> MemberFormRulesContract {
        let poa = previewPOA(jurisdiction: jurisdiction).aggregatedForm.sections
        return MemberFormRulesContract(
            jurisdiction: jurisdiction,
            families: ["trust", "poa"],
            documentTypes: ["trust_rrr", "trust_certificate", "poa_document"],
            productFlowMode: nil,
            aggregatedForm: MemberFacingFormContract(
                jurisdiction: jurisdiction,
                families: ["trust", "poa"],
                documentTypes: ["trust_rrr", "trust_certificate", "poa_document"],
                sections: [
                    MemberFacingSection(
                        key: "basic_info",
                        title: "Basic Information",
                        fields: [
                            MemberFacingField(canonicalKey: "trust_name", label: "Trust name", semanticType: "trust_name", dataType: "string", required: true, repeatable: false, helpText: nil, validation: nil),
                            MemberFacingField(canonicalKey: "trust_date", label: "Trust date", semanticType: "trust_date", dataType: "date", required: true, repeatable: false, helpText: nil, validation: nil)
                        ]
                    ),
                    MemberFacingSection(
                        key: "people",
                        title: "People",
                        fields: [
                            MemberFacingField(canonicalKey: "grantors", label: "Trustmakers", semanticType: "person_list", dataType: "array", required: true, repeatable: true, helpText: nil, validation: nil),
                            MemberFacingField(canonicalKey: "trustees", label: "Trustees", semanticType: "person_list", dataType: "array", required: true, repeatable: true, helpText: nil, validation: nil),
                            MemberFacingField(canonicalKey: "successor_trustees", label: "Successor trustees", semanticType: "person_list", dataType: "array", required: false, repeatable: true, helpText: nil, validation: nil),
                            MemberFacingField(canonicalKey: "revocation_holders", label: "Revocation holders", semanticType: "person_list", dataType: "array", required: false, repeatable: true, helpText: nil, validation: nil)
                        ]
                    ),
                    MemberFacingSection(
                        key: "authority",
                        title: "Authority",
                        fields: [
                            MemberFacingField(
                                canonicalKey: "trustee_signature_authority",
                                label: "Trustee signature authority",
                                semanticType: "signature_authority_rule",
                                dataType: "string",
                                required: true,
                                repeatable: false,
                                helpText: nil,
                                validation: [
                                    "allowed_values": .array([.string("all_trustees"), .string("any_one_trustee"), .string("named_signing_trustee"), .string("custom")]),
                                    "allowed_value_labels": .object([
                                        "all_trustees": .string("All trustees must sign"),
                                        "any_one_trustee": .string("Any one trustee may sign"),
                                        "named_signing_trustee": .string("A specific named trustee will sign"),
                                        "custom": .string("Use custom signing instructions")
                                    ])
                                ]
                            ),
                            MemberFacingField(canonicalKey: "trustee_signature_authority_custom_text", label: "Custom signing authority instructions", semanticType: "text", dataType: "string", required: false, repeatable: false, helpText: nil, validation: nil),
                            MemberFacingField(canonicalKey: "tax_id_owner", label: "Primary tax ID owner", semanticType: "tax_id_owner", dataType: "string", required: false, repeatable: false, helpText: nil, validation: nil),
                            MemberFacingField(canonicalKey: "asset_titling_format", label: "Asset titling format", semanticType: "text", dataType: "string", required: false, repeatable: false, helpText: nil, validation: nil),
                            MemberFacingField(
                                canonicalKey: "trustee_powers",
                                label: "Trustee powers",
                                semanticType: "enum_multi",
                                dataType: "array",
                                required: false,
                                repeatable: true,
                                helpText: nil,
                                validation: [
                                    "allowed_values": .array([.string("sell_property"), .string("manage_accounts"), .string("pay_expenses")]),
                                    "allowed_value_labels": .object([
                                        "sell_property": .string("Sell or transfer property"),
                                        "manage_accounts": .string("Manage financial accounts"),
                                        "pay_expenses": .string("Pay trust expenses")
                                    ])
                                ]
                            ),
                            MemberFacingField(canonicalKey: "revocation_holders_custom_text", label: "Revocation custom language", semanticType: "text", dataType: "string", required: false, repeatable: false, helpText: nil, validation: nil)
                        ]
                    ),
                    MemberFacingSection(
                        key: "documents",
                        title: "Documents to Include",
                        fields: [
                            MemberFacingField(canonicalKey: "prior_document_items", label: "Documents to Include", semanticType: "object", dataType: "array", required: false, repeatable: true, helpText: nil, validation: nil)
                        ]
                    )
                ] + poa
            )
        )
    }
}

extension MemberFormRulesContract {
    static func previewPOA(jurisdiction: String = "CA") -> MemberFormRulesContract {
        MemberFormRulesContract(
            jurisdiction: jurisdiction,
            families: ["poa"],
            documentTypes: ["poa_document"],
            productFlowMode: nil,
            aggregatedForm: MemberFacingFormContract(
                jurisdiction: jurisdiction,
                families: ["poa"],
                documentTypes: ["poa_document"],
                sections: [
                    MemberFacingSection(
                        key: "people",
                        title: "People",
                        fields: [
                            MemberFacingField(canonicalKey: "principal_full_legal_name", label: "Principal full legal name", semanticType: "person_name", dataType: "string", required: true, repeatable: false, helpText: nil, validation: nil),
                            MemberFacingField(canonicalKey: "principal_address", label: "Principal address", semanticType: "person_address", dataType: "string", required: true, repeatable: false, helpText: nil, validation: nil),
                            MemberFacingField(canonicalKey: "principal_contact", label: "Principal contact", semanticType: "person_contact", dataType: "string", required: false, repeatable: false, helpText: nil, validation: nil),
                            MemberFacingField(canonicalKey: "agent_full_legal_name", label: "Agent full legal name", semanticType: "person_name", dataType: "string", required: true, repeatable: false, helpText: nil, validation: nil),
                            MemberFacingField(canonicalKey: "agent_address", label: "Agent address", semanticType: "person_address", dataType: "string", required: true, repeatable: false, helpText: nil, validation: nil),
                            MemberFacingField(canonicalKey: "agent_contact", label: "Agent contact", semanticType: "person_contact", dataType: "string", required: false, repeatable: false, helpText: nil, validation: nil),
                            MemberFacingField(canonicalKey: "successor_agent_list", label: "Successor agents", semanticType: "person_list", dataType: "array", required: false, repeatable: true, helpText: nil, validation: nil)
                        ]
                    ),
                    MemberFacingSection(
                        key: "authority",
                        title: "Authority",
                        fields: [
                            MemberFacingField(
                                canonicalKey: "agent_signature_authority",
                                label: "Multiple-agent signing rule",
                                semanticType: "signature_authority_rule",
                                dataType: "string",
                                required: true,
                                repeatable: false,
                                helpText: nil,
                                validation: [
                                    "allowed_values": .array([.string("all_agents_jointly"), .string("any_agent_separately")]),
                                    "allowed_value_labels": .object([
                                        "all_agents_jointly": .string("All designated agents must act jointly"),
                                        "any_agent_separately": .string("Any designated agent may act separately")
                                    ])
                                ]
                            ),
                            MemberFacingField(
                                canonicalKey: "authority_scope_selection",
                                label: "Authority scope selection",
                                semanticType: "authority_selection",
                                dataType: "array",
                                required: true,
                                repeatable: true,
                                helpText: nil,
                                validation: [
                                    "allowed_values": .array([
                                        .string("real_property"),
                                        .string("tangible_personal_property"),
                                        .string("stocks_and_bonds"),
                                        .string("commodities_and_options"),
                                        .string("banking_and_financial"),
                                        .string("business_operations"),
                                        .string("insurance_and_annuities"),
                                        .string("claims_and_litigation"),
                                        .string("estates_trusts_and_beneficial_interests"),
                                        .string("personal_and_family_maintenance"),
                                        .string("government_benefits"),
                                        .string("retirement_plans"),
                                        .string("taxes")
                                    ]),
                                    "allowed_value_labels": .object([
                                        "real_property": .string("Real property transactions"),
                                        "tangible_personal_property": .string("Tangible personal property"),
                                        "stocks_and_bonds": .string("Stocks and bonds"),
                                        "commodities_and_options": .string("Commodities and options"),
                                        "banking_and_financial": .string("Banking and financial institution transactions"),
                                        "business_operations": .string("Business operating transactions"),
                                        "insurance_and_annuities": .string("Insurance and annuities"),
                                        "claims_and_litigation": .string("Claims and litigation"),
                                        "estates_trusts_and_beneficial_interests": .string("Estates, trusts, and other beneficial interests"),
                                        "personal_and_family_maintenance": .string("Personal and family maintenance"),
                                        "government_benefits": .string("Benefits from social security, medicare, or other government programs"),
                                        "retirement_plans": .string("Retirement plans"),
                                        "taxes": .string("Tax matters")
                                    ])
                                ]
                            )
                        ]
                    )
                ]
            )
        )
    }
}