import Foundation

protocol NotaryProfileAPIProviding: Sendable {
    func listNotaryRequests(limit: Int, offset: Int, accessToken: String) async throws -> NotaryQueueResponse
    func getNotaryRequestContext(requestId: String, accessToken: String) async throws -> NotaryRequestContextResponse
    func resolveNotaryRequest(idn: String, accessToken: String) async throws -> NotaryIdnResolveResponse
    func submitReviewDecision(requestId: String, request: NotaryReviewDecisionRequest, accessToken: String) async throws -> NotaryReviewDecisionResponse
    func getIdentityDocumentSchema(documentType: String, accessToken: String) async throws -> NotaryIdentityDocumentSchemaResponse
    func startInPersonSession(requestId: String, request: NotarySessionStartRequest, accessToken: String) async throws -> NotarySessionActionResponse
    func recordNotaryCheckIn(requestId: String, request: NotaryMeetingCheckInRequest, accessToken: String) async throws -> NotarySessionActionResponse
    func recordProximityEvaluation(requestId: String, request: NotaryProximityEvaluationRequest, accessToken: String) async throws -> NotarySessionActionResponse
    func recordIdentityVerification(requestId: String, request: NotaryIdentityVerificationRequest, accessToken: String) async throws -> NotarySessionActionResponse
    func reverseGeocodeVenue(requestId: String, request: NotaryReverseGeocodeRequest, accessToken: String) async throws -> NotaryReverseGeocodeResponse
    func recordVenue(requestId: String, request: NotaryVenueCaptureRequest, accessToken: String) async throws -> NotarySessionActionResponse
    func signAcknowledgment(requestId: String, request: NotarySignRequest, accessToken: String) async throws -> NotarySessionActionResponse
    func advanceSession(requestId: String, request: NotarySessionAdvanceRequest, accessToken: String) async throws -> NotarySessionActionResponse
    func submitFinalPackage(requestId: String, request: NotaryFinalPackageSubmitRequest, accessToken: String) async throws -> NotarySessionActionResponse
    func getMyNotaryProfile(accessToken: String) async throws -> MyNotaryProfileResponse
    func updateMyNotaryProfile(_ request: NotaryProfileUpdateRequest, accessToken: String) async throws -> MyNotaryProfileResponse
    func listNotaryProfileJurisdictions(accessToken: String) async throws -> MemberFormJurisdictionsResponse
    func listServiceAreas(jurisdiction: String, accessToken: String) async throws -> NotaryServiceAreasResponse
}

struct NotaryProfileAPIClient: NotaryProfileAPIProviding, Sendable {
    private let authClient: AuthAPIClient

    init(authClient: AuthAPIClient = AuthAPIClient()) {
        self.authClient = authClient
    }

    func listNotaryRequests(limit: Int = 20, offset: Int = 0, accessToken: String) async throws -> NotaryQueueResponse {
        try await authClient.get(
            path: "/notary/requests",
            queryItems: [
                URLQueryItem(name: "limit", value: String(limit)),
                URLQueryItem(name: "offset", value: String(offset))
            ],
            accessToken: accessToken
        )
    }

    func getNotaryRequestContext(requestId: String, accessToken: String) async throws -> NotaryRequestContextResponse {
        try await authClient.get(
            path: "/notary/requests/\(Self.encodedPathComponent(requestId))/context",
            accessToken: accessToken
        )
    }

    func resolveNotaryRequest(idn: String, accessToken: String) async throws -> NotaryIdnResolveResponse {
        try await authClient.post(
            path: "/notary/idn/resolve",
            body: NotaryIdnResolveRequest(idn: idn),
            accessToken: accessToken
        )
    }

    func submitReviewDecision(requestId: String, request: NotaryReviewDecisionRequest, accessToken: String) async throws -> NotaryReviewDecisionResponse {
        try await authClient.post(
            path: "/notary/requests/\(Self.encodedPathComponent(requestId))/review-decision",
            body: request,
            accessToken: accessToken
        )
    }

    func getIdentityDocumentSchema(documentType: String, accessToken: String) async throws -> NotaryIdentityDocumentSchemaResponse {
        try await authClient.get(
            path: "/notary/identity-document-types",
            queryItems: [URLQueryItem(name: "documentType", value: documentType)],
            accessToken: accessToken
        )
    }

    func startInPersonSession(requestId: String, request: NotarySessionStartRequest, accessToken: String) async throws -> NotarySessionActionResponse {
        try await postSessionAction(requestId: requestId, path: "/meeting/start", body: request, accessToken: accessToken)
    }

    func recordNotaryCheckIn(requestId: String, request: NotaryMeetingCheckInRequest, accessToken: String) async throws -> NotarySessionActionResponse {
        try await postSessionAction(requestId: requestId, path: "/meeting/check-in", body: request, accessToken: accessToken)
    }

    func recordProximityEvaluation(requestId: String, request: NotaryProximityEvaluationRequest, accessToken: String) async throws -> NotarySessionActionResponse {
        try await postSessionAction(requestId: requestId, path: "/meeting/proximity-evaluation", body: request, accessToken: accessToken)
    }

    func recordIdentityVerification(requestId: String, request: NotaryIdentityVerificationRequest, accessToken: String) async throws -> NotarySessionActionResponse {
        try await postSessionAction(requestId: requestId, path: "/meeting/identity-verification", body: request, accessToken: accessToken)
    }

    func reverseGeocodeVenue(requestId: String, request: NotaryReverseGeocodeRequest, accessToken: String) async throws -> NotaryReverseGeocodeResponse {
        try await postSessionAction(requestId: requestId, path: "/meeting/reverse-geocode", body: request, accessToken: accessToken)
    }

    func recordVenue(requestId: String, request: NotaryVenueCaptureRequest, accessToken: String) async throws -> NotarySessionActionResponse {
        try await postSessionAction(requestId: requestId, path: "/meeting/venue-capture", body: request, accessToken: accessToken)
    }

    func signAcknowledgment(requestId: String, request: NotarySignRequest, accessToken: String) async throws -> NotarySessionActionResponse {
        try await postSessionAction(requestId: requestId, path: "/sign", body: request, accessToken: accessToken)
    }

    func advanceSession(requestId: String, request: NotarySessionAdvanceRequest, accessToken: String) async throws -> NotarySessionActionResponse {
        try await postSessionAction(requestId: requestId, path: "/session/advance", body: request, accessToken: accessToken)
    }

    func submitFinalPackage(requestId: String, request: NotaryFinalPackageSubmitRequest, accessToken: String) async throws -> NotarySessionActionResponse {
        try await postSessionAction(requestId: requestId, path: "/submit", body: request, accessToken: accessToken)
    }

    func getMyNotaryProfile(accessToken: String) async throws -> MyNotaryProfileResponse {
        try await authClient.get(path: "/users/me/notary-profile", accessToken: accessToken)
    }

    func updateMyNotaryProfile(_ request: NotaryProfileUpdateRequest, accessToken: String) async throws -> MyNotaryProfileResponse {
        try await authClient.patch(path: "/users/me/notary-profile", body: request, accessToken: accessToken)
    }

    func listNotaryProfileJurisdictions(accessToken: String) async throws -> MemberFormJurisdictionsResponse {
        try await authClient.get(
            path: "/rules/member-form",
            queryItems: [URLQueryItem(name: "mode", value: "notarize_document")],
            accessToken: accessToken
        )
    }

    func listServiceAreas(jurisdiction: String, accessToken: String) async throws -> NotaryServiceAreasResponse {
        try await authClient.get(
            path: "/rules/service-areas/\(Self.encodedPathComponent(jurisdiction))",
            accessToken: accessToken
        )
    }

    private func postSessionAction<Response: Decodable, Body: Encodable>(
        requestId: String,
        path: String,
        body: Body,
        accessToken: String
    ) async throws -> Response {
        try await authClient.post(
            path: "/notary/requests/\(Self.encodedPathComponent(requestId))\(path)",
            body: body,
            accessToken: accessToken
        )
    }

    private static func encodedPathComponent(_ value: String) -> String {
        var allowedCharacters = CharacterSet.urlPathAllowed
        allowedCharacters.remove(charactersIn: "/")
        return value.addingPercentEncoding(withAllowedCharacters: allowedCharacters) ?? value
    }
}

struct MockNotaryProfileAPIClient: NotaryProfileAPIProviding, Sendable {
    var response = NotaryQueueResponse.empty

    private var usesSessionFixture: Bool {
        ProcessInfo.processInfo.environment["DARCI_MOCK_NOTARY_SESSION"] == "1"
    }

    func listNotaryRequests(limit: Int, offset: Int, accessToken: String) async throws -> NotaryQueueResponse {
        usesSessionFixture ? Self.sessionQueueFixture : response
    }

    func getNotaryRequestContext(requestId: String, accessToken: String) async throws -> NotaryRequestContextResponse {
        usesSessionFixture ? Self.sessionContextFixture : NotaryRequestContextResponse(context: nil)
    }

    func resolveNotaryRequest(idn: String, accessToken: String) async throws -> NotaryIdnResolveResponse {
        NotaryIdnResolveResponse(
            requestId: Self.sessionContextFixture.context?.request.id ?? "mock-session-request",
            context: Self.sessionContextFixture.context
        )
    }

    func submitReviewDecision(requestId: String, request: NotaryReviewDecisionRequest, accessToken: String) async throws -> NotaryReviewDecisionResponse {
        NotaryReviewDecisionResponse(message: nil)
    }

    func getIdentityDocumentSchema(documentType: String, accessToken: String) async throws -> NotaryIdentityDocumentSchemaResponse {
        NotaryIdentityDocumentSchemaResponse(
            documentTypes: [NotaryIdentityDocumentTypeOption(value: "state_identification_card", label: "State identification card", sortOrder: 10)],
            selectedType: NotaryIdentityDocumentTypeSchema(
                value: "state_identification_card",
                label: "State identification card",
                sortOrder: 10,
                fields: []
            )
        )
    }

    func startInPersonSession(requestId: String, request: NotarySessionStartRequest, accessToken: String) async throws -> NotarySessionActionResponse {
        NotarySessionActionResponse(status: "ok", advancedStep: nil, nextAction: nil, message: nil)
    }

    func recordNotaryCheckIn(requestId: String, request: NotaryMeetingCheckInRequest, accessToken: String) async throws -> NotarySessionActionResponse {
        NotarySessionActionResponse(status: "ok", advancedStep: nil, nextAction: nil, message: nil)
    }

    func recordProximityEvaluation(requestId: String, request: NotaryProximityEvaluationRequest, accessToken: String) async throws -> NotarySessionActionResponse {
        NotarySessionActionResponse(status: "ok", advancedStep: "same_place_evaluated", nextAction: nil, message: nil)
    }

    func recordIdentityVerification(requestId: String, request: NotaryIdentityVerificationRequest, accessToken: String) async throws -> NotarySessionActionResponse {
        NotarySessionActionResponse(status: "ok", advancedStep: nil, nextAction: nil, message: nil)
    }

    func reverseGeocodeVenue(requestId: String, request: NotaryReverseGeocodeRequest, accessToken: String) async throws -> NotaryReverseGeocodeResponse {
        NotaryReverseGeocodeResponse(venue: nil, formattedAddress: nil)
    }

    func recordVenue(requestId: String, request: NotaryVenueCaptureRequest, accessToken: String) async throws -> NotarySessionActionResponse {
        NotarySessionActionResponse(status: "ok", advancedStep: nil, nextAction: nil, message: nil)
    }

    func signAcknowledgment(requestId: String, request: NotarySignRequest, accessToken: String) async throws -> NotarySessionActionResponse {
        NotarySessionActionResponse(status: "ok", advancedStep: "acknowledgment_sealed", nextAction: nil, message: nil)
    }

    func advanceSession(requestId: String, request: NotarySessionAdvanceRequest, accessToken: String) async throws -> NotarySessionActionResponse {
        NotarySessionActionResponse(status: "ok", advancedStep: "final_package_submitted", nextAction: nil, message: nil)
    }

    func submitFinalPackage(requestId: String, request: NotaryFinalPackageSubmitRequest, accessToken: String) async throws -> NotarySessionActionResponse {
        NotarySessionActionResponse(status: "ok", advancedStep: "final_package_submitted", nextAction: nil, message: nil)
    }

    func getMyNotaryProfile(accessToken: String) async throws -> MyNotaryProfileResponse {
        guard usesSessionFixture else {
            return MyNotaryProfileResponse(profile: nil)
        }

        return MyNotaryProfileResponse(
            profile: EditableNotaryProfile(
                id: "mock-profile",
                userId: "mock-user",
                jurisdiction: "US-OH",
                serviceAreaKind: "county",
                serviceAreaName: "Cuyahoga County",
                commissionNumber: "OH-12345",
                commissionExpiresAt: "2028-12-31",
                sealStoragePath: nil,
                signatureDataUrl: "data:image/png;base64,bW9jaw==",
                sealDataUrl: "data:image/png;base64,bW9jaw==",
                createdAt: "2026-07-31T12:00:00Z",
                updatedAt: "2026-07-31T12:00:00Z"
            )
        )
    }

    func updateMyNotaryProfile(_ request: NotaryProfileUpdateRequest, accessToken: String) async throws -> MyNotaryProfileResponse {
        MyNotaryProfileResponse(profile: nil)
    }

    func listNotaryProfileJurisdictions(accessToken: String) async throws -> MemberFormJurisdictionsResponse {
        MemberFormJurisdictionsResponse(mode: nil, jurisdictions: [], message: nil)
    }

    func listServiceAreas(jurisdiction: String, accessToken: String) async throws -> NotaryServiceAreasResponse {
        NotaryServiceAreasResponse(jurisdiction: jurisdiction, abbreviation: nil, options: [], source: nil, message: nil)
    }

    private static let sessionQueueFixture = NotaryQueueResponse(
        requests: [
            NotaryQueueRequestSummary(
                request: NotaryRequestSummary(
                    id: "mock-session-request",
                    documentId: "mock-session-document",
                    workflowId: "mock-session-workflow",
                    status: "approved",
                    queueStatus: "approved",
                    submittedAt: "2026-07-31T12:00:00Z"
                ),
                document: NotaryDocumentSummary(
                    id: "mock-session-document",
                    idn: "OH26MOCKSESSION",
                    status: "pending_notary",
                    documentType: "power_of_attorney",
                    documentTypeLabel: "Power of Attorney",
                    jurisdiction: "US-OH",
                    createdAt: "2026-07-31T11:30:00Z",
                    summary: nil
                ),
                owner: NotaryIdentitySummary(
                    userId: "mock-member",
                    supabaseUserId: "mock-member-auth",
                    displayName: "Morgan Member",
                    fullName: "Morgan Member",
                    email: "member@example.com",
                    role: "member",
                    status: "active"
                ),
                workflow: NotaryWorkflowSummary(
                    id: "mock-session-workflow",
                    status: "approved",
                    latestStatus: "approved",
                    latestStatusAt: "2026-07-31T12:00:00Z",
                    reviewStartedAt: "2026-07-31T11:45:00Z",
                    closedAt: nil,
                    selectedNotaryUserId: "mock-user",
                    assignedNotaryUserId: "mock-user",
                    lastCodeGeneratedAt: nil
                ),
                latestCodeDelivery: nil,
                meeting: nil,
                finalization: NotaryFinalizationSummary(
                    latestStatus: nil,
                    latestStatusAt: nil,
                    isAnchored: false,
                    isVerificationChecked: false,
                    isWatermarked: false,
                    isHashRecorded: false,
                    verificationStatus: nil,
                    anchoredAt: nil,
                    lastCheckedAt: nil,
                    publicVerifyPath: nil
                ),
                nextAction: "start_session"
            )
        ],
        meetings: [],
        counts: NotaryQueueCounts(pending: 0, scheduled: 0, readyForInPerson: 1, completed: 0, total: 1)
    )

    private static let sessionContextFixture = NotaryRequestContextResponse(
        context: NotaryRequestReviewContext(
            request: sessionQueueFixture.requests[0].request,
            document: NotaryRequestReviewDocument(
                id: "mock-session-document",
                idn: "OH26MOCKSESSION",
                status: "pending_notary",
                documentType: "power_of_attorney",
                documentTypeLabel: "Power of Attorney",
                jurisdiction: "US-OH",
                createdAt: "2026-07-31T11:30:00Z",
                reviewDocuments: [
                    NotaryReviewDocumentFile(
                        id: "mock-session-pdf",
                        versionId: "mock-session-version",
                        label: "Power of Attorney",
                        fileName: "power-of-attorney.pdf",
                        mimeType: "application/pdf",
                        sizeBytes: 2048,
                        isFinal: false,
                        downloadUrl: nil,
                        createdAt: "2026-07-31T11:30:00Z"
                    )
                ]
            ),
            owner: sessionQueueFixture.requests[0].owner,
            notary: NotaryIdentitySummary(
                userId: "mock-user",
                supabaseUserId: "mock-notary-auth",
                displayName: "Nora Notary",
                fullName: "Nora Notary",
                email: "notary@example.com",
                role: "notary",
                status: "active"
            ),
            workflow: sessionQueueFixture.requests[0].workflow,
            latestCodeDelivery: nil,
            meeting: nil,
            evidence: NotarySessionEvidence(
                checkins: [],
                geolocationSamples: [],
                identityVerifications: [],
                proximityEvaluations: [],
                artifacts: []
            ),
            finalization: NotarySessionFinalization(
                latestStatus: nil,
                latestStatusAt: nil,
                isAnchored: false,
                isVerificationChecked: false,
                isWatermarked: false,
                isHashRecorded: false,
                verificationStatus: nil,
                anchoredAt: nil,
                lastCheckedAt: nil,
                publicVerifyPath: nil,
                hash: nil,
                ledgerTxId: nil,
                anchorAttempt: nil,
                history: []
            ),
            capabilities: NotaryContextCapabilities(
                canReviewRequest: false,
                canManageMeeting: true,
                canRecordEvidence: false,
                canFinalizeDocument: false,
                canOpenVerification: false
            ),
            warnings: [],
            nextAction: "start_session"
        )
    )
}

protocol NotaryProfileCacheStoring: Sendable {
    func read(cacheKey: NotaryProfileCacheKey) async -> NotaryProfileCacheEntry?
    func write(_ response: NotaryQueueResponse, cacheKey: NotaryProfileCacheKey) async
}

struct NotaryProfileCacheKey: Equatable, Sendable {
    let userId: String
    let role: String?
    let limit: Int

    var fileName: String {
        let raw = "\(userId)-\(role ?? "notary")-limit-\(limit)"
        let safe = raw.replacingOccurrences(of: #"[^A-Za-z0-9._-]+"#, with: "-", options: .regularExpression)
        return "\(safe).json"
    }
}

struct NotaryProfileCacheEntry: Codable, Equatable, Sendable {
    static let currentVersion = 2

    let version: Int
    let cachedAt: Date
    let response: NotaryQueueResponse

    init(version: Int = Self.currentVersion, cachedAt: Date = Date(), response: NotaryQueueResponse) {
        self.version = version
        self.cachedAt = cachedAt
        self.response = response
    }
}

actor NotaryProfileCacheStore: NotaryProfileCacheStoring {
    private let directoryURL: URL
    private let fileManager: FileManager

    init(fileManager: FileManager = .default) {
        self.fileManager = fileManager
        let baseURL = fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
        directoryURL = baseURL.appendingPathComponent("NotaryProfileQueueCache", isDirectory: true)
    }

    func read(cacheKey: NotaryProfileCacheKey) async -> NotaryProfileCacheEntry? {
        let fileURL = directoryURL.appendingPathComponent(cacheKey.fileName)
        guard let data = try? Data(contentsOf: fileURL) else { return nil }

        do {
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            let entry = try decoder.decode(NotaryProfileCacheEntry.self, from: data)
            guard entry.version == NotaryProfileCacheEntry.currentVersion else {
                try? fileManager.removeItem(at: fileURL)
                return nil
            }
            return entry
        } catch {
            try? fileManager.removeItem(at: fileURL)
            return nil
        }
    }

    func write(_ response: NotaryQueueResponse, cacheKey: NotaryProfileCacheKey) async {
        do {
            try fileManager.createDirectory(at: directoryURL, withIntermediateDirectories: true)
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            let data = try encoder.encode(NotaryProfileCacheEntry(response: response))
            try data.write(to: directoryURL.appendingPathComponent(cacheKey.fileName), options: .atomic)
        } catch {
            return
        }
    }
}

extension NotaryQueueResponse {
    static let empty = NotaryQueueResponse(
        requests: [],
        meetings: [],
        counts: NotaryQueueCounts(pending: 0, scheduled: 0, readyForInPerson: 0, completed: 0, total: 0)
    )
}