import Foundation

protocol DocumentIntakeAPIProviding: Sendable {
    func listMemberFormJurisdictions(modeKey: String, accessToken: String) async throws -> MemberFormJurisdictionsResponse
    func getMemberForm(jurisdiction: String, modeKey: String, accessToken: String) async throws -> MemberFormResponse
    func bootstrapDocumentIntake(_ request: DocumentIntakeBootstrapRequest, accessToken: String) async throws -> DocumentIntakeBootstrapResponse
    func getDocumentIntakeDraft(documentId: String, accessToken: String) async throws -> DocumentIntakeDraftResponse
    func saveDocumentIntakeDraft(documentId: String, request: DocumentIntakeDraftUpsertRequest, accessToken: String) async throws -> DocumentIntakeDraftResponse
    func submitDocumentIntakeDraft(documentId: String, request: DocumentIntakeSubmitRequest, accessToken: String) async throws -> DocumentIntakeSubmitResponse
    func resaveDocumentIntakeDraft(documentId: String, accessToken: String) async throws -> DocumentIntakeDraftResponse
    func createDocumentUpload(_ request: DocumentUploadCreateRequest, accessToken: String) async throws -> DocumentUploadCreateResponse
    func uploadDocument(data: Data, mimeType: String, to signedUrl: URL) async throws
    func finalizeDocumentUpload(documentId: String, request: DocumentUploadFinalizeRequest, accessToken: String) async throws -> DocumentUploadFinalizeResponse
    func getDocumentReview(documentId: String, accessToken: String) async throws -> DocumentReviewResponse
    func createDocumentGenerationRuns(documentId: String, request: DocumentGenerationRunsRequest, accessToken: String) async throws -> DocumentGenerationRunsResponse
    func approveDocumentReview(documentId: String, request: DocumentReviewApprovalRequest, accessToken: String) async throws -> DocumentReviewApprovalResponse
    func getDocumentSigning(documentId: String, accessToken: String) async throws -> DocumentSigningResponse
    func listSavedSignatures(documentId: String, accessToken: String) async throws -> SavedDocumentSignaturesResponse
    func deleteSavedSignature(documentId: String, signatureId: String, accessToken: String) async throws -> DocumentAPIMessageResponse
    func captureSignature(documentId: String, request: DocumentSignatureCaptureRequest, accessToken: String) async throws -> DocumentSignatureCaptureResponse
    func requestSignatureUpload(documentId: String, request: DocumentSignatureUploadRequest, accessToken: String) async throws -> DocumentSignatureUploadResponse
    func uploadSignatureAsset(data: Data, mimeType: String, to signedUrl: URL) async throws
    func finalizeSignatureUpload(documentId: String, request: DocumentSignatureFinalizeRequest, accessToken: String) async throws -> DocumentSignatureCaptureResponse
    func confirmDocumentSigning(documentId: String, request: DocumentSignConfirmRequest, accessToken: String) async throws -> DocumentAPIMessageResponse
    func listAvailableNotaries(documentId: String, accessToken: String) async throws -> AvailableNotariesResponse
    func submitNotarization(documentId: String, request: SubmitNotarizationRequest, accessToken: String) async throws -> SubmitNotarizationResponse
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

    func resaveDocumentIntakeDraft(documentId: String, accessToken: String) async throws -> DocumentIntakeDraftResponse {
        try await authClient.post(path: "/documents/\(documentId)/intake-draft/resave", body: EmptyDocumentAPIRequest(), accessToken: accessToken)
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

    func getDocumentReview(documentId: String, accessToken: String) async throws -> DocumentReviewResponse {
        try await authClient.get(path: "/documents/\(documentId)/review", accessToken: accessToken)
    }

    func createDocumentGenerationRuns(documentId: String, request: DocumentGenerationRunsRequest, accessToken: String) async throws -> DocumentGenerationRunsResponse {
        try await authClient.post(path: "/documents/\(documentId)/generation-runs", body: request, accessToken: accessToken)
    }

    func approveDocumentReview(documentId: String, request: DocumentReviewApprovalRequest, accessToken: String) async throws -> DocumentReviewApprovalResponse {
        try await authClient.post(path: "/documents/\(documentId)/review-approval", body: request, accessToken: accessToken)
    }

    func getDocumentSigning(documentId: String, accessToken: String) async throws -> DocumentSigningResponse {
        try await authClient.get(path: "/documents/\(documentId)/signing", accessToken: accessToken)
    }

    func listSavedSignatures(documentId: String, accessToken: String) async throws -> SavedDocumentSignaturesResponse {
        try await authClient.get(path: "/documents/\(documentId)/signatures/saved", accessToken: accessToken)
    }

    func deleteSavedSignature(documentId: String, signatureId: String, accessToken: String) async throws -> DocumentAPIMessageResponse {
        var allowedCharacters = CharacterSet.urlPathAllowed
        allowedCharacters.remove(charactersIn: "/")
        let encodedSignatureId = signatureId.addingPercentEncoding(withAllowedCharacters: allowedCharacters) ?? signatureId
        return try await authClient.delete(path: "/documents/\(documentId)/signatures/saved/\(encodedSignatureId)", accessToken: accessToken)
    }

    func captureSignature(documentId: String, request: DocumentSignatureCaptureRequest, accessToken: String) async throws -> DocumentSignatureCaptureResponse {
        try await authClient.post(path: "/documents/\(documentId)/signatures", body: request, accessToken: accessToken)
    }

    func requestSignatureUpload(documentId: String, request: DocumentSignatureUploadRequest, accessToken: String) async throws -> DocumentSignatureUploadResponse {
        try await authClient.post(path: "/documents/\(documentId)/signatures/request", body: request, accessToken: accessToken)
    }

    func uploadSignatureAsset(data: Data, mimeType: String, to signedUrl: URL) async throws {
        var request = URLRequest(url: signedUrl)
        request.httpMethod = "PUT"
        request.setValue(mimeType, forHTTPHeaderField: "Content-Type")

        let (_, response) = try await urlSession.upload(for: request, from: data)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw AuthAPIError.invalidResponse
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            throw AuthAPIError.unexpectedStatus(statusCode: httpResponse.statusCode, message: "Failed to upload signature image.")
        }
    }

    func finalizeSignatureUpload(documentId: String, request: DocumentSignatureFinalizeRequest, accessToken: String) async throws -> DocumentSignatureCaptureResponse {
        try await authClient.post(path: "/documents/\(documentId)/signatures/finalize", body: request, accessToken: accessToken)
    }

    func confirmDocumentSigning(documentId: String, request: DocumentSignConfirmRequest, accessToken: String) async throws -> DocumentAPIMessageResponse {
        try await authClient.post(path: "/documents/\(documentId)/sign", body: request, accessToken: accessToken)
    }

    func listAvailableNotaries(documentId: String, accessToken: String) async throws -> AvailableNotariesResponse {
        try await authClient.get(path: "/documents/\(documentId)/available-notaries", accessToken: accessToken)
    }

    func submitNotarization(documentId: String, request: SubmitNotarizationRequest, accessToken: String) async throws -> SubmitNotarizationResponse {
        try await authClient.post(path: "/documents/\(documentId)/submit-notarization", body: request, accessToken: accessToken)
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
    var resumedDraft: DocumentIntakeDraft? = nil

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
        DocumentIntakeDraftResponse(draft: resumedDraft, message: nil, currentRevision: nil, intakeStatus: nil)
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

    func resaveDocumentIntakeDraft(documentId: String, accessToken: String) async throws -> DocumentIntakeDraftResponse {
        DocumentIntakeDraftResponse(
            draft: DocumentIntakeDraft(
                documentId: documentId,
                ownerId: "user-1",
                productFlowMode: "poa_only",
                jurisdiction: "CA",
                currentStep: "poa_requirements",
                rulesSnapshotVersion: "member_form_rules_contract_v1",
                answers: [:],
                canonicalAnswers: nil,
                revision: 2,
                createdAt: nil,
                updatedAt: "2026-06-05T12:00:00.000Z"
            ),
            message: nil,
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

    func getDocumentReview(documentId: String, accessToken: String) async throws -> DocumentReviewResponse {
        DocumentReviewResponse(
            document: DocumentReviewDocumentSummary(
                id: documentId,
                idn: nil,
                status: "pending_review",
                documentType: "poa_document",
                jurisdiction: "US-CA",
                createdAt: "2026-06-05T12:00:00.000Z",
                productFlowMode: "poa_only"
            ),
            review: DocumentReviewState(
                state: "ready",
                requiresGeneration: false,
                missingOutputKeys: [],
                allVisibleOutputsReady: true,
                canApprove: true,
                reviewApproval: nil,
                outputs: [
                    DocumentReviewOutput(
                        outputKey: "poa_document",
                        outputLabel: "Power of Attorney",
                        versionId: "version-1",
                        generationRunId: "run-1",
                        version: 1,
                        fileName: "power-of-attorney.pdf",
                        mimeType: "application/pdf",
                        sizeBytes: 1024,
                        createdAt: "2026-06-05T12:05:00.000Z",
                        downloadUrl: "https://download.example.test/power-of-attorney.pdf",
                        isFinal: false
                    )
                ],
                pendingOutputs: []
            ),
            message: nil
        )
    }

    func createDocumentGenerationRuns(documentId: String, request: DocumentGenerationRunsRequest, accessToken: String) async throws -> DocumentGenerationRunsResponse {
        DocumentGenerationRunsResponse(
            runs: request.outputKeys.map { key in
                DocumentGenerationRunSummary(id: "run-\(key)", outputKey: key, documentKey: key, status: "queued", blockedCount: 0, errorMessage: nil)
            },
            message: nil
        )
    }

    func approveDocumentReview(documentId: String, request: DocumentReviewApprovalRequest, accessToken: String) async throws -> DocumentReviewApprovalResponse {
        DocumentReviewApprovalResponse(
            document: nil,
            reviewApproval: DocumentReviewApproval(
                approvedAt: "2026-06-05T12:10:00.000Z",
                reviewSource: "mobile",
                latestVersionId: "version-1",
                latestRenderedRunId: "run-1",
                approvedOutputKeys: ["poa_document"],
                approvedVersionIds: ["version-1"]
            ),
            message: nil
        )
    }

    func getDocumentSigning(documentId: String, accessToken: String) async throws -> DocumentSigningResponse {
        DocumentSigningResponse(
            document: DocumentReviewDocumentSummary(
                id: documentId,
                idn: nil,
                status: "pending_signature",
                documentType: "poa_document",
                jurisdiction: "US-CA",
                createdAt: "2026-06-05T12:00:00.000Z",
                productFlowMode: "poa_only"
            ),
            signing: DocumentSigningState(
                state: "ready",
                reviewApproval: DocumentReviewApproval(
                    approvedAt: "2026-06-05T12:10:00.000Z",
                    reviewSource: "mobile",
                    latestVersionId: "version-1",
                    latestRenderedRunId: "run-1",
                    approvedOutputKeys: ["poa_document"],
                    approvedVersionIds: ["version-1"]
                ),
                signingExecution: nil,
                approvedOutputKeys: ["poa_document"],
                outputs: [
                    DocumentReviewOutput(
                        outputKey: "poa_document",
                        outputLabel: "Power of Attorney",
                        versionId: "version-1",
                        generationRunId: "run-1",
                        version: 1,
                        fileName: "power-of-attorney.pdf",
                        mimeType: "application/pdf",
                        sizeBytes: 1024,
                        createdAt: "2026-06-05T12:05:00.000Z",
                        downloadUrl: "https://download.example.test/power-of-attorney.pdf",
                        isFinal: false
                    )
                ],
                pendingOutputs: [],
                missingOutputKeys: [],
                requiresGeneration: false,
                allOutputsReady: true,
                signatures: [
                    DocumentSigningSignature(
                        outputSignerId: "output-signer-1",
                        generationRunId: "run-1",
                        outputKey: "poa_document",
                        outputLabel: "Power of Attorney",
                        documentKey: "poa_document",
                        partyName: "Ada Lovelace",
                        partyRole: "principal",
                        signingGroup: nil,
                        isRequired: true,
                        status: "pending",
                        captureMethod: nil,
                        typedValue: nil,
                        typedKind: nil,
                        signatureId: nil,
                        storagePath: nil,
                        assetDownloadUrl: nil,
                        mimeType: nil,
                        sizeBytes: nil,
                        capturedAt: nil,
                        groupMinimumRequired: nil,
                        groupSatisfied: false
                    )
                ],
                groups: [],
                completion: DocumentSigningCompletion(
                    requiredSignatureCount: 1,
                    capturedRequiredSignatureCount: 0,
                    allRequiredSignaturesComplete: false,
                    canConfirm: false
                ),
                viewerAccess: DocumentSigningViewerAccess(kind: "owner", inviteId: nil, documentOutputSignerId: nil, documentPartyId: nil)
            ),
            message: nil
        )
    }

    func listSavedSignatures(documentId: String, accessToken: String) async throws -> SavedDocumentSignaturesResponse {
        SavedDocumentSignaturesResponse(savedSignatures: [], message: nil)
    }

    func deleteSavedSignature(documentId: String, signatureId: String, accessToken: String) async throws -> DocumentAPIMessageResponse {
        DocumentAPIMessageResponse(message: nil)
    }

    func captureSignature(documentId: String, request: DocumentSignatureCaptureRequest, accessToken: String) async throws -> DocumentSignatureCaptureResponse {
        DocumentSignatureCaptureResponse(
            signature: DocumentSignatureSummary(id: "signature-1", documentId: documentId, generationRunId: request.generationRunId, outputSignerId: request.outputSignerId, storagePath: nil, status: "captured"),
            remainingSignerInvites: nil,
            message: nil
        )
    }

    func requestSignatureUpload(documentId: String, request: DocumentSignatureUploadRequest, accessToken: String) async throws -> DocumentSignatureUploadResponse {
        DocumentSignatureUploadResponse(
            signature: DocumentSignatureSummary(id: "signature-upload-1", documentId: documentId, generationRunId: request.generationRunId, outputSignerId: request.outputSignerId, storagePath: nil, status: "pending_upload"),
            upload: DocumentUploadTarget(bucket: nil, path: nil, signedUrl: "https://upload.example.test/signature.png", token: nil),
            message: nil
        )
    }

    func uploadSignatureAsset(data: Data, mimeType: String, to signedUrl: URL) async throws {}

    func finalizeSignatureUpload(documentId: String, request: DocumentSignatureFinalizeRequest, accessToken: String) async throws -> DocumentSignatureCaptureResponse {
        DocumentSignatureCaptureResponse(
            signature: DocumentSignatureSummary(id: request.signatureId, documentId: documentId, generationRunId: request.generationRunId, outputSignerId: request.outputSignerId, storagePath: nil, status: "captured"),
            remainingSignerInvites: nil,
            message: nil
        )
    }

    func confirmDocumentSigning(documentId: String, request: DocumentSignConfirmRequest, accessToken: String) async throws -> DocumentAPIMessageResponse {
        DocumentAPIMessageResponse(message: nil)
    }

    func listAvailableNotaries(documentId: String, accessToken: String) async throws -> AvailableNotariesResponse {
        AvailableNotariesResponse(
            document: AvailableNotariesDocument(id: documentId, status: "pending_notary", jurisdiction: "US-CA", normalizedJurisdiction: "US-CA", productFlowMode: "poa_only"),
            notarization: AvailableNotarizationState(activeRequestId: nil, activeRequestStatus: nil, assignedNotaryUserId: nil, submittedAt: nil),
            notaries: [
                AvailableNotary(userId: "notary-1", displayName: "Adam Eberts", jurisdiction: "US-CA", serviceAreaKind: "county", serviceAreaName: "Sonoma County", commissionExpiresAt: "2027-01-01T00:00:00.000Z")
            ],
            message: nil
        )
    }

    func submitNotarization(documentId: String, request: SubmitNotarizationRequest, accessToken: String) async throws -> SubmitNotarizationResponse {
        SubmitNotarizationResponse(
            request: SubmittedNotarizationRequest(id: "request-1", documentId: documentId, workflowId: "workflow-1", status: "submitted", submittedAt: "2026-06-05T12:30:00.000Z"),
            document: SubmittedNotarizationDocument(id: documentId, status: "pending_notary"),
            code: SubmittedNotarizationCode(id: "code-1", code: "NTR-12345678", status: "active", expiresAt: "2026-06-05T13:00:00.000Z"),
            workflow: SubmittedNotarizationWorkflow(id: "workflow-1", status: "code_delivered", workflowKind: nil, selectedNotaryUserId: request.selectedNotaryUserId, assignedNotaryUserId: nil, currentLegacyRequestId: "request-1"),
            message: nil
        )
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
                            ),
                            MemberFacingField(
                                canonicalKey: "special_instructions_text",
                                label: "Special instructions",
                                semanticType: "text",
                                dataType: "string",
                                required: false,
                                repeatable: false,
                                helpText: "Keep this concise and directive. These instructions are copied into the final document package.",
                                validation: nil
                            )
                        ]
                    )
                ]
            )
        )
    }
}
