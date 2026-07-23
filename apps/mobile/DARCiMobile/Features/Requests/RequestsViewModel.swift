import Foundation

@MainActor
final class RequestsViewModel: ObservableObject {
    @Published private(set) var incomingRequests: [SigningRequestCard] = []
    @Published private(set) var outgoingRequests: [SigningRequestCard] = []
    @Published private(set) var isLoading = false
    @Published private(set) var errorMessage: String?
    @Published var filters = RequestFilters()
    @Published private(set) var resendStates: [String: RequestSendState] = [:]
    @Published private(set) var openingInviteIds: Set<String> = []

    private let apiClient: RequestsAPIProviding
    private let limit = 60

    init(apiClient: RequestsAPIProviding = RequestsAPIClient()) {
        self.apiClient = apiClient
    }

    var allRequests: [SigningRequestCard] {
        incomingRequests + outgoingRequests
    }

    var filteredIncomingRequests: [SigningRequestCard] {
        incomingRequests.filter { matchesFilters($0) }
    }

    var filteredOutgoingRequests: [SigningRequestCard] {
        outgoingRequests.filter { matchesFilters($0) }
    }

    var statusFilterOptions: [String] {
        unique(allRequests.map { normalizedFilterValue($0.status) })
            .filter { $0.isEmpty == false }
            .sorted()
    }

    var roleFilterOptions: [String] {
        unique(allRequests.map { normalizedFilterValue($0.roleLabel) })
            .filter { $0.isEmpty == false }
            .sorted()
    }

    func requests(for lane: RequestsLane) -> [SigningRequestCard] {
        switch lane {
        case .inbox:
            filteredIncomingRequests
        case .outbox:
            filteredOutgoingRequests
        }
    }

    func load(session: AuthSession?) async {
        guard let accessToken = session?.accessToken, accessToken.isEmpty == false else {
            incomingRequests = []
            outgoingRequests = []
            errorMessage = "Sign in again to view requests."
            return
        }

        isLoading = true
        errorMessage = nil

        do {
            let response = try await apiClient.listSigningRequests(limit: limit, accessToken: accessToken)
            incomingRequests = response.incoming ?? []
            outgoingRequests = response.outgoing ?? []
        } catch {
            errorMessage = displayMessage(for: error, fallback: "Failed to load requests.")
        }

        isLoading = false
    }

    func clearFilters() {
        filters = RequestFilters()
    }

    func searchResults(for query: String, lane: RequestsLane) -> [SigningRequestCard] {
        let normalizedQuery = normalizedSearchText(query)
        guard normalizedQuery.isEmpty == false else { return [] }

        let source: [SigningRequestCard]
        switch lane {
        case .inbox:
            source = incomingRequests
        case .outbox:
            source = outgoingRequests
        }

        return source.filter { request in
            requestSearchFields(request).contains { field in
                normalizedSearchText(field).contains(normalizedQuery)
            }
        }
    }

    func canOpen(_ request: SigningRequestCard) -> Bool {
        request.direction == .incoming
            && request.documentId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
            && ["declined", "revoked"].contains(normalizedFilterValue(request.status)) == false
    }

    func openIncomingRequest(_ request: SigningRequestCard, session: AuthSession?) async -> Bool {
        guard canOpen(request) else { return false }
        guard let accessToken = session?.accessToken, accessToken.isEmpty == false else {
            errorMessage = "Sign in again to open this document."
            return false
        }

        openingInviteIds.insert(request.inviteId)
        defer { openingInviteIds.remove(request.inviteId) }

        let shouldClaimInvite = request.actionHref == nil && request.actionKind == .claimAndSign
        if shouldClaimInvite && request.inviteId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false {
            do {
                _ = try await apiClient.openInvite(inviteId: request.inviteId, accessToken: accessToken)
            } catch {
                errorMessage = displayMessage(for: error, fallback: "Document could not be opened.")
                return false
            }
        }

        return true
    }

    func canSendReminder(for request: SigningRequestCard) -> Bool {
        request.direction == .outgoing
            && request.signerEmail?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
            && ["completed", "declined", "revoked"].contains(normalizedFilterValue(request.status)) == false
    }

    func sendReminder(for request: SigningRequestCard, session: AuthSession?) async {
        guard canSendReminder(for: request) else { return }
        guard let accessToken = session?.accessToken, accessToken.isEmpty == false else {
            resendStates[request.inviteId] = .error
            return
        }

        resendStates[request.inviteId] = .sending

        do {
            _ = try await apiClient.resendInvite(inviteId: request.inviteId, accessToken: accessToken)
            resendStates[request.inviteId] = .sent
            await load(session: session)
        } catch {
            resendStates[request.inviteId] = .error
        }
    }

    func matchesFilters(_ request: SigningRequestCard) -> Bool {
        let query = normalizedSearchText(filters.query)
        if query.isEmpty == false {
            let fields = requestSearchFields(request).map(normalizedSearchText)
            let haystack = fields.joined(separator: " ")
            let haystackDigits = digits(in: haystack)
            let queryDigits = digits(in: query)
            let queryTokens = query.split(separator: " ").map(String.init)
            let textMatches = queryTokens.allSatisfy { haystack.contains($0) }
            let digitMatches = queryDigits.isEmpty == false && haystackDigits.contains(queryDigits)

            if textMatches == false && digitMatches == false {
                return false
            }
        }

        if filters.statuses.isEmpty == false && filters.statuses.contains(normalizedFilterValue(request.status)) == false {
            return false
        }

        if filters.roles.isEmpty == false && filters.roles.contains(normalizedFilterValue(request.roleLabel)) == false {
            return false
        }

        if filters.activities.isEmpty == false {
            let hasMatchingActivity = filters.activities.contains { activity in
                matchesActivity(activity, request: request)
            }
            if hasMatchingActivity == false {
                return false
            }
        }

        return true
    }

    func displayStatus(_ value: String) -> String {
        normalizedFilterValue(value)
            .split(separator: "_")
            .map { $0.uppercased() }
            .joined(separator: " ")
    }

    func displayRole(_ value: String) -> String {
        value
            .split(separator: "_")
            .map { $0.prefix(1).uppercased() + $0.dropFirst() }
            .joined(separator: " ")
    }

    private func matchesActivity(_ activity: RequestsActivityFilter, request: SigningRequestCard) -> Bool {
        switch activity {
        case .needsSignature:
            return request.direction == .incoming && canOpen(request) && isOpenRequest(request)
        case .waiting:
            return request.direction == .outgoing && isOpenRequest(request)
        case .opened:
            return request.firstOpenedAt != nil
        case .clicked:
            return request.firstClickedAt != nil
        case .completed:
            return normalizedFilterValue(request.status) == "completed"
        }
    }

    private func isOpenRequest(_ request: SigningRequestCard) -> Bool {
        ["completed", "declined", "revoked"].contains(normalizedFilterValue(request.status)) == false
    }

    private func requestSearchFields(_ request: SigningRequestCard) -> [String] {
        [
            request.documentId,
            request.documentLabel,
            request.documentTypeLabel,
            request.signerName,
            request.signerEmail,
            request.signerPhone,
            request.senderName,
            request.senderEmail,
            request.roleLabel,
            request.status,
            request.detail
        ].compactMap { $0 }
    }

    private func normalizedFilterValue(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private func normalizedSearchText(_ value: String) -> String {
        value.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current)
            .lowercased()
    }

    private func digits(in value: String) -> String {
        value.filter(\.isNumber)
    }

    private func unique(_ values: [String]) -> [String] {
        Array(Set(values))
    }

    private func displayMessage(for error: Error, fallback: String) -> String {
        if case AuthAPIError.validation(let message) = error {
            return message ?? fallback
        }

        if case AuthAPIError.unauthorized(let message) = error {
            return message ?? "Sign in again to continue."
        }

        if case AuthAPIError.server(_, let message) = error {
            return message ?? fallback
        }

        if case AuthAPIError.unexpectedStatus(_, let message) = error {
            return message ?? fallback
        }

        return fallback
    }
}
