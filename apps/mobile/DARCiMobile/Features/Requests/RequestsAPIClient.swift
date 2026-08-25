import Foundation

protocol RequestsAPIProviding: Sendable {
    func listSigningRequests(limit: Int, accessToken: String) async throws -> SigningRequestsResponse
    func openInvite(inviteId: String, accessToken: String) async throws -> InviteOpenResponse
    func claimInviteToken(_ token: String, accessToken: String) async throws -> InviteClaimResponse
    func resendInvite(inviteId: String, accessToken: String) async throws -> InviteResendResponse
    func getMemberInPersonSession(requestId: String, accessToken: String) async throws -> MemberInPersonSessionResponse
    func recordMemberCheckIn(requestId: String, request: MemberMeetingCheckInRequest, accessToken: String) async throws -> NotarySessionActionResponse
}

struct RequestsAPIClient: RequestsAPIProviding, Sendable {
    private let authClient: AuthAPIClient

    init(authClient: AuthAPIClient = AuthAPIClient()) {
        self.authClient = authClient
    }

    func listSigningRequests(limit: Int = 60, accessToken: String) async throws -> SigningRequestsResponse {
        try await authClient.get(
            path: "/requests/signing",
            queryItems: [URLQueryItem(name: "limit", value: String(limit))],
            accessToken: accessToken
        )
    }

    func openInvite(inviteId: String, accessToken: String) async throws -> InviteOpenResponse {
        try await authClient.post(
            path: "/invites/\(inviteId)/open",
            body: RequestsEmptyRequest(),
            accessToken: accessToken
        )
    }

    func claimInviteToken(_ token: String, accessToken: String) async throws -> InviteClaimResponse {
        try await authClient.post(
            path: "/invites/public/\(Self.encodedPathComponent(token))/claim",
            body: RequestsEmptyRequest(),
            accessToken: accessToken
        )
    }

    func resendInvite(inviteId: String, accessToken: String) async throws -> InviteResendResponse {
        try await authClient.post(
            path: "/invites/\(inviteId)/resend",
            body: RequestsEmptyRequest(),
            accessToken: accessToken
        )
    }

    func getMemberInPersonSession(requestId: String, accessToken: String) async throws -> MemberInPersonSessionResponse {
        try await authClient.get(
            path: "/requests/\(Self.encodedPathComponent(requestId))",
            accessToken: accessToken
        )
    }

    func recordMemberCheckIn(requestId: String, request: MemberMeetingCheckInRequest, accessToken: String) async throws -> NotarySessionActionResponse {
        try await authClient.post(
            path: "/notary/requests/\(Self.encodedPathComponent(requestId))/meeting/check-in",
            body: request,
            accessToken: accessToken
        )
    }

    private static func encodedPathComponent(_ value: String) -> String {
        var allowedCharacters = CharacterSet.urlPathAllowed
        allowedCharacters.remove(charactersIn: "/")
        return value.addingPercentEncoding(withAllowedCharacters: allowedCharacters) ?? value
    }
}

struct MockRequestsAPIClient: RequestsAPIProviding, Sendable {
    var response = SigningRequestsResponse.mock

    func listSigningRequests(limit: Int, accessToken: String) async throws -> SigningRequestsResponse {
        response
    }

    func openInvite(inviteId: String, accessToken: String) async throws -> InviteOpenResponse {
        InviteOpenResponse(signingHref: "/app/sign?documentId=mock-document", message: nil)
    }

    func claimInviteToken(_ token: String, accessToken: String) async throws -> InviteClaimResponse {
        InviteClaimResponse(invite: InviteClaimDocument(documentId: "mock-document"))
    }

    func resendInvite(inviteId: String, accessToken: String) async throws -> InviteResendResponse {
        InviteResendResponse(existing: false)
    }

    func getMemberInPersonSession(requestId: String, accessToken: String) async throws -> MemberInPersonSessionResponse {
        .mock
    }

    func recordMemberCheckIn(requestId: String, request: MemberMeetingCheckInRequest, accessToken: String) async throws -> NotarySessionActionResponse {
        NotarySessionActionResponse(status: "recorded", advancedStep: nil, nextAction: nil, message: nil)
    }
}

extension MemberInPersonSessionResponse {
    static let mock = MemberInPersonSessionResponse(
        request: MemberSessionRequest(
            id: "mock-session-request",
            documentId: "mock-session-document",
            workflowId: "mock-session-workflow",
            status: "in_review",
            meetingStatus: "in_progress"
        ),
        document: MemberSessionDocument(
            id: "mock-session-document",
            idn: "AB12CD34EF56",
            status: "pending_notary",
            documentType: "trust_bundle",
            jurisdiction: "US-CA",
            reviewDocuments: [],
            summary: MemberSessionDocumentSummary(
                verification: NotaryDocumentVerificationSummary(status: "pending", idn: "AB12CD34EF56", verifyPath: nil),
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
                )
            )
        ),
        workflow: MemberSessionWorkflow(latestStatus: "in_person_session_started", assignedNotaryUserId: "notary-1"),
        owner: MemberSessionIdentity(displayName: "Member", fullName: "Member", email: "member@example.com", phone: "+15555550100"),
        notary: MemberSessionIdentity(displayName: "illuminotary", fullName: "illuminotary", email: "notary@example.com", phone: "+15555550101"),
        meeting: MemberSessionMeeting(
            meetingId: "meeting-1",
            requestId: "mock-session-request",
            status: "in_progress",
            samePlaceRequired: true,
            samePlaceStatus: "pending",
            participants: [],
            checkins: [],
            identityVerifications: [],
            proximityEvaluations: [],
            artifacts: []
        ),
        warnings: [],
        nextAction: "member_check_in"
    )
}

extension SigningRequestsResponse {
    static let empty = SigningRequestsResponse(incoming: [], outgoing: [])

    static let mock = SigningRequestsResponse(
        incoming: [
            SigningRequestCard(
                id: "incoming-1",
                inviteId: "invite-incoming-1",
                direction: .incoming,
                documentId: "7de7424d",
                documentLabel: "POA - US/CA",
                documentTypeLabel: "POA",
                signerName: "John Doe",
                signerEmail: "john@example.com",
                signerPhone: nil,
                senderName: "John Doe",
                senderEmail: "john@example.com",
                roleLabel: "Trustee",
                status: "completed",
                sentAt: "2026-05-04T12:00:00.000Z",
                updatedAt: "2026-05-04T12:00:00.000Z",
                expiresAt: nil,
                completedAt: "2026-05-04T13:00:00.000Z",
                firstOpenedAt: nil,
                firstClickedAt: nil,
                resendCount: 0,
                actionKind: .openSigning,
                actionHref: "/app/sign?documentId=7de7424d",
                actionLabel: "Open document",
                detail: "John Doe requested your trustee signature."
            )
        ],
        outgoing: [
            SigningRequestCard(
                id: "outgoing-1",
                inviteId: "invite-outgoing-1",
                direction: .outgoing,
                documentId: "7de7424d",
                documentLabel: "POA - US/CA",
                documentTypeLabel: "POA",
                signerName: "Jordan Carrillo",
                signerEmail: "jordan@example.com",
                signerPhone: nil,
                senderName: nil,
                senderEmail: nil,
                roleLabel: "Trustee",
                status: "sent",
                sentAt: "2026-05-04T12:00:00.000Z",
                updatedAt: "2026-05-04T12:00:00.000Z",
                expiresAt: nil,
                completedAt: nil,
                firstOpenedAt: nil,
                firstClickedAt: nil,
                resendCount: 0,
                actionKind: SigningRequestActionKind.none,
                actionHref: nil,
                actionLabel: "Send reminder",
                detail: "Waiting on Jordan Carrillo to complete the trustee signature."
            )
        ]
    )
}
