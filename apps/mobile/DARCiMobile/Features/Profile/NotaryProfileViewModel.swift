import Foundation

@MainActor
final class NotaryProfileViewModel: ObservableObject {
    @Published private(set) var requests: [NotaryQueueRequestSummary] = []
    @Published private(set) var isLoading = false
    @Published private(set) var errorMessage: String?

    private let apiClient: NotaryProfileAPIProviding
    private let cacheStore: NotaryProfileCacheStoring
    private let pageSize = 20
    private let legacyLimit = 80
    private let maximumLoadedRequests = 80
    private var prefetchTask: Task<Void, Never>?

    init(
        apiClient: NotaryProfileAPIProviding = NotaryProfileAPIClient(),
        cacheStore: NotaryProfileCacheStoring = NotaryProfileCacheStore()
    ) {
        self.apiClient = apiClient
        self.cacheStore = cacheStore
    }

    func load(session: AuthSession?) async {
        guard let session, session.accessToken.isEmpty == false else {
            requests = []
            errorMessage = "Sign in again to view notary requests."
            return
        }

        prefetchTask?.cancel()

        let cacheKey = NotaryProfileCacheKey(userId: session.user.id, role: session.user.role, limit: pageSize)
        let legacyCacheKey = NotaryProfileCacheKey(userId: session.user.id, role: session.user.role, limit: legacyLimit)
        let cachedEntry: NotaryProfileCacheEntry?
        if let currentCacheEntry = await cacheStore.read(cacheKey: cacheKey) {
            cachedEntry = currentCacheEntry
        } else {
            cachedEntry = await cacheStore.read(cacheKey: legacyCacheKey)
        }
        if let cachedEntry {
            requests = cachedEntry.response.requests
            errorMessage = nil
        }

        isLoading = true
        defer { isLoading = false }

        do {
            let response = try await apiClient.listNotaryRequests(
                limit: pageSize,
                offset: 0,
                accessToken: session.accessToken
            )
            let refreshedRequests = mergedRequests(primary: response.requests, fallback: requests)
            requests = refreshedRequests
            await cacheStore.write(response.replacingRequests(refreshedRequests), cacheKey: cacheKey)
            errorMessage = nil
            startPrefetch(after: response, cacheKey: cacheKey, accessToken: session.accessToken)
        } catch {
            if requests.isEmpty {
                errorMessage = displayMessage(for: error, fallback: "Unable to load notary requests.")
            }
        }
    }

    func requests(for tab: NotaryQueueTab) -> [NotaryQueueRequestSummary] {
        requests.filter { request in
            switch tab {
            case .review:
                return ["pending", "submitted", "code_delivered"].contains(resolveQueueStatus(request))
            case .inReview:
                return resolveQueueStatus(request) == "in_review"
            case .ready:
                return resolveQueueStatus(request) == "approved" || isOpenMeetingRequest(request)
            case .completed:
                return resolveQueueStatus(request) == "completed" || request.document.summary?.finalization?.isAnchored == true || request.finalization.isAnchored == true
            }
        }
        .sorted(by: isMoreRecent)
    }

    func resolveQueueStatus(_ request: NotaryQueueRequestSummary) -> String {
        normalizedValue(request.request.queueStatus ?? request.workflow?.latestStatus ?? request.workflow?.status ?? request.request.status)
    }

    private func isOpenMeetingRequest(_ request: NotaryQueueRequestSummary) -> Bool {
        guard let status = request.meeting?.status.map(normalizedValue), status.isEmpty == false else {
            return false
        }

        return ["completed", "cancelled", "canceled", "no_show"].contains(status) == false
    }

    private func startPrefetch(
        after initialResponse: NotaryQueueResponse,
        cacheKey: NotaryProfileCacheKey,
        accessToken: String
    ) {
        let total = min(initialResponse.counts.total ?? initialResponse.requests.count, maximumLoadedRequests)
        guard initialResponse.requests.count == pageSize, total > pageSize else { return }

        prefetchTask = Task { [weak self] in
            await self?.prefetchRemainingRequests(
                after: initialResponse,
                total: total,
                cacheKey: cacheKey,
                accessToken: accessToken
            )
        }
    }

    private func prefetchRemainingRequests(
        after initialResponse: NotaryQueueResponse,
        total: Int,
        cacheKey: NotaryProfileCacheKey,
        accessToken: String
    ) async {
        var prefetchedRequests = initialResponse.requests
        var latestResponse = initialResponse

        for offset in stride(from: pageSize, to: total, by: pageSize) {
            guard Task.isCancelled == false else { return }

            do {
                let response = try await apiClient.listNotaryRequests(
                    limit: min(pageSize, total - offset),
                    offset: offset,
                    accessToken: accessToken
                )
                latestResponse = response
                prefetchedRequests = mergedRequests(primary: prefetchedRequests + response.requests, fallback: [])
                requests = mergedRequests(primary: prefetchedRequests, fallback: requests)
                await cacheStore.write(latestResponse.replacingRequests(requests), cacheKey: cacheKey)

                if response.requests.count < min(pageSize, total - offset) {
                    break
                }
            } catch {
                return
            }
        }

        guard Task.isCancelled == false else { return }
        requests = Array(prefetchedRequests.prefix(maximumLoadedRequests))
        await cacheStore.write(latestResponse.replacingRequests(requests), cacheKey: cacheKey)
    }

    private func mergedRequests(
        primary: [NotaryQueueRequestSummary],
        fallback: [NotaryQueueRequestSummary]
    ) -> [NotaryQueueRequestSummary] {
        var seen = Set<String>()
        var result: [NotaryQueueRequestSummary] = []

        for request in primary + fallback where seen.insert(request.id).inserted {
            result.append(request)
        }

        return Array(result.sorted(by: isMoreRecent).prefix(maximumLoadedRequests))
    }

    private func isMoreRecent(_ left: NotaryQueueRequestSummary, than right: NotaryQueueRequestSummary) -> Bool {
        sortTimestamp(for: left) > sortTimestamp(for: right)
    }

    private func sortTimestamp(for request: NotaryQueueRequestSummary) -> TimeInterval {
        let candidates = [
            request.request.submittedAt,
            request.workflow?.latestStatusAt,
            request.meeting?.scheduledAt,
            request.finalization.latestStatusAt,
            request.finalization.anchoredAt,
            request.document.createdAt
        ]

        for value in candidates {
            guard let value, let date = date(from: value) else {
                continue
            }

            return date.timeIntervalSince1970
        }

        return 0
    }

    private func date(from value: String) -> Date? {
        if let date = fractionalFormatter.date(from: value) {
            return date
        }

        return internetFormatter.date(from: value)
    }

    private let fractionalFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private let internetFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    private func normalizedValue(_ value: String?) -> String {
        value?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
    }
}

@MainActor
private func displayMessage(for error: Error, fallback: String) -> String {
    if let apiError = error as? AuthAPIError {
        switch apiError {
        case .wrongCode(let message),
            .unauthorized(let message),
            .validation(let message),
            .rateLimited(let message),
            .server(_, let message),
            .unexpectedStatus(_, let message):
            return message ?? fallback
        case .emptyResponse, .invalidResponse, .invalidURL:
            return fallback
        }
    }

    return fallback
}