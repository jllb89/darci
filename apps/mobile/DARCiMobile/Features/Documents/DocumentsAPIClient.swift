import Foundation

protocol DocumentsAPIProviding: Sendable {
    func listDocuments(page: Int, pageSize: Int, accessToken: String) async throws -> DocumentsListResponse
}

struct DocumentsAPIClient: DocumentsAPIProviding, Sendable {
    private let authClient: AuthAPIClient

    init(authClient: AuthAPIClient = AuthAPIClient()) {
        self.authClient = authClient
    }

    func listDocuments(page: Int = 1, pageSize: Int = 100, accessToken: String) async throws -> DocumentsListResponse {
        try await authClient.get(
            path: "/documents",
            queryItems: [
                URLQueryItem(name: "page", value: String(page)),
                URLQueryItem(name: "pageSize", value: String(pageSize))
            ],
            accessToken: accessToken
        )
    }
}

struct MockDocumentsAPIClient: DocumentsAPIProviding, Sendable {
    var response = DocumentsListResponse.empty

    func listDocuments(page: Int, pageSize: Int, accessToken: String) async throws -> DocumentsListResponse {
        response
    }
}

extension DocumentsListResponse {
    static let empty =
        DocumentsListResponse(
            documents: [],
            pagination: DocumentsPagination(page: 1, pageSize: 100, total: 0, pageCount: 1, hasPreviousPage: false, hasNextPage: false),
            facets: DocumentsFilterFacets(documentTypes: [], statuses: [], jurisdictions: []),
            message: nil
        )
}

protocol DocumentsCacheStoring: Sendable {
    func read(cacheKey: DocumentsCacheKey) async -> DocumentsCacheEntry?
    func write(_ response: DocumentsListResponse, cacheKey: DocumentsCacheKey) async
}

struct DocumentsCacheKey: Equatable, Sendable {
    let userId: String
    let role: String?
    let page: Int
    let pageSize: Int

    var fileName: String {
        let raw = "\(userId)-\(role ?? "member")-page-\(page)-pageSize-\(pageSize)"
        let safe = raw.replacingOccurrences(of: #"[^A-Za-z0-9._-]+"#, with: "-", options: .regularExpression)
        return "\(safe).json"
    }
}

struct DocumentsCacheEntry: Codable, Equatable, Sendable {
    static let currentVersion = 1

    let version: Int
    let cachedAt: Date
    let response: DocumentsListResponse

    init(version: Int = Self.currentVersion, cachedAt: Date = Date(), response: DocumentsListResponse) {
        self.version = version
        self.cachedAt = cachedAt
        self.response = response
    }
}

actor DocumentsCacheStore: DocumentsCacheStoring {
    private let directoryURL: URL
    private let fileManager: FileManager

    init(fileManager: FileManager = .default) {
        self.fileManager = fileManager
        let baseURL = fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
        directoryURL = baseURL.appendingPathComponent("DocumentsListCache", isDirectory: true)
    }

    func read(cacheKey: DocumentsCacheKey) async -> DocumentsCacheEntry? {
        let fileURL = fileURL(for: cacheKey)
        guard let data = try? Data(contentsOf: fileURL) else {
            return nil
        }

        do {
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            let entry = try decoder.decode(DocumentsCacheEntry.self, from: data)
            guard entry.version == DocumentsCacheEntry.currentVersion else {
                try? fileManager.removeItem(at: fileURL)
                return nil
            }

            return entry
        } catch {
            try? fileManager.removeItem(at: fileURL)
            return nil
        }
    }

    func write(_ response: DocumentsListResponse, cacheKey: DocumentsCacheKey) async {
        do {
            try fileManager.createDirectory(at: directoryURL, withIntermediateDirectories: true)
            let entry = DocumentsCacheEntry(response: response)
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            let data = try encoder.encode(entry)
            try data.write(to: fileURL(for: cacheKey), options: [.atomic])
        } catch {
            return
        }
    }

    private func fileURL(for cacheKey: DocumentsCacheKey) -> URL {
        directoryURL.appendingPathComponent(cacheKey.fileName, isDirectory: false)
    }
}