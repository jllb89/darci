import Foundation

protocol RequestsAPIProviding: Sendable {
    func listSigningRequests(limit: Int, accessToken: String) async throws -> SigningRequestsResponse
    func openInvite(inviteId: String, accessToken: String) async throws -> InviteOpenResponse
    func resendInvite(inviteId: String, accessToken: String) async throws -> InviteResendResponse
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

    func resendInvite(inviteId: String, accessToken: String) async throws -> InviteResendResponse {
        try await authClient.post(
            path: "/invites/\(inviteId)/resend",
            body: RequestsEmptyRequest(),
            accessToken: accessToken
        )
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

    func resendInvite(inviteId: String, accessToken: String) async throws -> InviteResendResponse {
        InviteResendResponse(existing: false)
    }
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
