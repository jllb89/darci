import Foundation

@MainActor
final class NotaryProfileViewModel: ObservableObject {
    @Published private(set) var requests: [NotaryQueueRequestSummary] = []
    @Published private(set) var isLoading = false
    @Published private(set) var errorMessage: String?

    private let apiClient: NotaryProfileAPIProviding
    private let limit = 80

    init(apiClient: NotaryProfileAPIProviding = NotaryProfileAPIClient()) {
        self.apiClient = apiClient
    }

    func load(session: AuthSession?) async {
        guard let accessToken = session?.accessToken, accessToken.isEmpty == false else {
            requests = []
            errorMessage = "Sign in again to view notary requests."
            return
        }

        isLoading = true
        errorMessage = nil

        do {
            let response = try await apiClient.listNotaryRequests(limit: limit, accessToken: accessToken)
            requests = response.requests
        } catch {
            errorMessage = displayMessage(for: error, fallback: "Unable to load notary requests.")
        }

        isLoading = false
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