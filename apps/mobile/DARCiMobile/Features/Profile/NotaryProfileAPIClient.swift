import Foundation

protocol NotaryProfileAPIProviding: Sendable {
    func listNotaryRequests(limit: Int, offset: Int, accessToken: String) async throws -> NotaryQueueResponse
    func getNotaryRequestContext(requestId: String, accessToken: String) async throws -> NotaryRequestContextResponse
    func submitReviewDecision(requestId: String, request: NotaryReviewDecisionRequest, accessToken: String) async throws -> NotaryReviewDecisionResponse
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

    func submitReviewDecision(requestId: String, request: NotaryReviewDecisionRequest, accessToken: String) async throws -> NotaryReviewDecisionResponse {
        try await authClient.post(
            path: "/notary/requests/\(Self.encodedPathComponent(requestId))/review-decision",
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

struct MockNotaryProfileAPIClient: NotaryProfileAPIProviding, Sendable {
    var response = NotaryQueueResponse.empty

    func listNotaryRequests(limit: Int, offset: Int, accessToken: String) async throws -> NotaryQueueResponse {
        response
    }

    func getNotaryRequestContext(requestId: String, accessToken: String) async throws -> NotaryRequestContextResponse {
        NotaryRequestContextResponse(context: nil)
    }

    func submitReviewDecision(requestId: String, request: NotaryReviewDecisionRequest, accessToken: String) async throws -> NotaryReviewDecisionResponse {
        NotaryReviewDecisionResponse(message: nil)
    }
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
    static let currentVersion = 1

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