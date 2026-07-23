import Foundation

protocol NotaryProfileAPIProviding: Sendable {
    func listNotaryRequests(limit: Int, accessToken: String) async throws -> NotaryQueueResponse
}

struct NotaryProfileAPIClient: NotaryProfileAPIProviding, Sendable {
    private let authClient: AuthAPIClient

    init(authClient: AuthAPIClient = AuthAPIClient()) {
        self.authClient = authClient
    }

    func listNotaryRequests(limit: Int = 80, accessToken: String) async throws -> NotaryQueueResponse {
        try await authClient.get(
            path: "/notary/requests",
            queryItems: [URLQueryItem(name: "limit", value: String(limit))],
            accessToken: accessToken
        )
    }
}

struct MockNotaryProfileAPIClient: NotaryProfileAPIProviding, Sendable {
    var response = NotaryQueueResponse.empty

    func listNotaryRequests(limit: Int, accessToken: String) async throws -> NotaryQueueResponse {
        response
    }
}

extension NotaryQueueResponse {
    static let empty = NotaryQueueResponse(
        requests: [],
        meetings: [],
        counts: NotaryQueueCounts(pending: 0, scheduled: 0, readyForInPerson: 0, completed: 0, total: 0)
    )
}