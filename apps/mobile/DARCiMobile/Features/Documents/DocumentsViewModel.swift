import Foundation

@MainActor
final class DocumentsViewModel: ObservableObject {
    @Published private(set) var documents: [DocumentsListItem] = []
    @Published private(set) var facets: DocumentsFilterFacets?
    @Published private(set) var isLoading = false
    @Published private(set) var errorMessage: String?
    @Published var filters = DocumentsFilterState()

    private let apiClient: DocumentsAPIProviding
    private let cacheStore: DocumentsCacheStoring
    private let firstPage = 1
    private let pageSize = 20
    private let legacyCachePageSize = 100
    private let maximumLoadedDocuments = 100
    private var prefetchTask: Task<Void, Never>?

    init(apiClient: DocumentsAPIProviding = DocumentsAPIClient(), cacheStore: DocumentsCacheStoring = DocumentsCacheStore()) {
        self.apiClient = apiClient
        self.cacheStore = cacheStore
    }

    var sortedDocuments: [DocumentsListItem] {
        filteredDocuments.sorted { lhs, rhs in
            DocumentsDateFormatting.date(from: lhs.createdAt) > DocumentsDateFormatting.date(from: rhs.createdAt)
        }
    }

    var documentTypeFilterOptions: [DocumentsProductKind] {
        [.poa, .trust, .notarization]
    }

    var statusFilterOptions: [String] {
        let preferredOrder = [
            "DRAFT CREATED",
            "DOCUMENT CREATED",
            "AWAITING REVIEW",
            "AWAITING SIGNATURES",
            "PENDING NOTARY SELECTION",
            "AWAITING NOTARY REVIEW",
            "AWAITING IN-PERSON SESSION",
            "IN-PERSON SESSION",
            "DOCUMENT COMPLETED"
        ]
        let labels = unique(documents.map { DocumentsDisplay.phase(for: $0).label })

        return labels.sorted { lhs, rhs in
            let lhsIndex = preferredOrder.firstIndex(of: lhs) ?? Int.max
            let rhsIndex = preferredOrder.firstIndex(of: rhs) ?? Int.max
            return lhsIndex == rhsIndex ? lhs < rhs : lhsIndex < rhsIndex
        }
    }

    var jurisdictionFilterOptions: [String] {
        let defaultJurisdictions = ["US/CA", "US/OH"]
        let facetJurisdictions = (facets?.jurisdictions ?? [])
            .map(DocumentsDisplay.normalizedJurisdiction)
            .filter { $0.isEmpty == false }
        let documentJurisdictions = documents
            .map { DocumentsDisplay.normalizedJurisdiction($0.jurisdiction) }
            .filter { $0.isEmpty == false }

        return unique(defaultJurisdictions + facetJurisdictions + documentJurisdictions)
    }

    var hasFilteredResults: Bool {
        sortedDocuments.isEmpty == false
    }

    func searchResults(for query: String) -> [DocumentsSearchResult] {
        let trimmedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmedQuery.isEmpty == false else { return [] }

        let normalizedQuery = normalizedSearchText(trimmedQuery)
        return sortedDocuments.compactMap { document in
            searchResult(for: document, normalizedQuery: normalizedQuery, displayQuery: trimmedQuery)
        }
    }

    func load(
        session: AuthSession?,
        refreshSession: (() async -> AuthSession?)? = nil
    ) async {
        guard let session, session.accessToken.isEmpty == false else {
            errorMessage = "Sign in again to load documents."
            return
        }

        prefetchTask?.cancel()

        let cacheKey = DocumentsCacheKey(userId: session.user.id, role: session.user.role, page: firstPage, pageSize: pageSize)
        let legacyCacheKey = DocumentsCacheKey(userId: session.user.id, role: session.user.role, page: firstPage, pageSize: legacyCachePageSize)
        let cachedEntry: DocumentsCacheEntry?
        if let currentCacheEntry = await cacheStore.read(cacheKey: cacheKey) {
            cachedEntry = currentCacheEntry
        } else {
            cachedEntry = await cacheStore.read(cacheKey: legacyCacheKey)
        }
        if let cached = cachedEntry {
            documents = cached.response.documents
            facets = cached.response.facets
            errorMessage = nil
        }

        isLoading = true
        defer { isLoading = false }

        do {
            try await loadFirstPage(session: session, cacheKey: cacheKey)
        } catch {
            if case AuthAPIError.unauthorized = error,
               let refreshedSession = await refreshSession?(),
               refreshedSession.accessToken.isEmpty == false {
                do {
                    try await loadFirstPage(session: refreshedSession, cacheKey: cacheKey)
                    return
                } catch {
                    if documents.isEmpty {
                        errorMessage = displayMessage(for: error, fallback: "Failed to load documents.")
                    }
                    return
                }
            }

            if documents.isEmpty {
                errorMessage = displayMessage(for: error, fallback: "Failed to load documents.")
            }
        }
    }

    func documents(for category: DocumentsCategory) -> [DocumentsListItem] {
        switch category.kind {
        case .recents:
            return Array(sortedDocuments.prefix(5))
        case .jurisdiction(let jurisdiction):
            return sortedDocuments.filter { DocumentsDisplay.normalizedJurisdiction($0.jurisdiction) == jurisdiction }
        case .product(let kind):
            return sortedDocuments.filter { DocumentsDisplay.productKind(for: $0) == kind }
        }
    }

    func overviewCategories() -> [DocumentsCategory] {
        var categories: [DocumentsCategory] = [
            DocumentsCategory(id: "recents", title: "Recents", kind: .recents)
        ]

        let defaultJurisdictions = ["US/CA", "US/OH"]
        let facetJurisdictions = (facets?.jurisdictions ?? [])
            .map(DocumentsDisplay.normalizedJurisdiction)
            .filter { $0.isEmpty == false }
        let documentJurisdictions = sortedDocuments
            .map { DocumentsDisplay.normalizedJurisdiction($0.jurisdiction) }
            .filter { $0.isEmpty == false }
        let jurisdictionTitles = unique(defaultJurisdictions + facetJurisdictions + documentJurisdictions)

        categories.append(contentsOf: jurisdictionTitles.map { jurisdiction in
            DocumentsCategory(id: "jurisdiction-\(jurisdiction)", title: jurisdiction, kind: .jurisdiction(jurisdiction))
        })

        categories.append(contentsOf: [DocumentsProductKind.trust, .poa, .notarization].map { kind in
            DocumentsCategory(id: "product-\(kind.rawValue)", title: kind.title, kind: .product(kind))
        })

        return categories
    }

    func dateGroups(for category: DocumentsCategory) -> [DocumentsDateGroup] {
        let grouped = Dictionary(grouping: documents(for: category)) { document in
            DocumentsDateFormatting.dayKey(from: document.createdAt)
        }

        return grouped.map { key, documents in
            let sortDate = documents
                .map { DocumentsDateFormatting.date(from: $0.createdAt) }
                .max() ?? .distantPast

            return DocumentsDateGroup(
                id: key,
                title: DocumentsDateFormatting.displayDate(from: sortDate),
                sortDate: sortDate,
                documents: documents.sorted { lhs, rhs in
                    DocumentsDateFormatting.date(from: lhs.createdAt) > DocumentsDateFormatting.date(from: rhs.createdAt)
                }
            )
        }
        .sorted { $0.sortDate > $1.sortDate }
    }

    func clearFilters() {
        filters = DocumentsFilterState()
    }

    private var filteredDocuments: [DocumentsListItem] {
        documents.filter(matchesFilters)
    }

    private func matchesFilters(_ document: DocumentsListItem) -> Bool {
        if filters.productKinds.isEmpty == false {
            guard let productKind = DocumentsDisplay.productKind(for: document), filters.productKinds.contains(productKind) else {
                return false
            }
        }

        if filters.statusLabels.isEmpty == false, filters.statusLabels.contains(DocumentsDisplay.phase(for: document).label) == false {
            return false
        }

        if filters.jurisdictions.isEmpty == false, filters.jurisdictions.contains(DocumentsDisplay.normalizedJurisdiction(document.jurisdiction)) == false {
            return false
        }

        if let createdFrom = filters.createdFrom {
            let createdDate = DocumentsDateFormatting.date(from: document.createdAt)
            guard createdDate >= DocumentsDateFormatting.cutoffDate(for: createdFrom) else {
                return false
            }
        }

        return true
    }

    private func unique(_ values: [String]) -> [String] {
        var seen = Set<String>()
        var result: [String] = []

        for value in values {
            if seen.insert(value).inserted {
                result.append(value)
            }
        }

        return result
    }

    private func displayMessage(for error: Error, fallback: String) -> String {
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

    private func loadFirstPage(session: AuthSession, cacheKey: DocumentsCacheKey) async throws {
        let response = try await apiClient.listDocuments(page: firstPage, pageSize: pageSize, accessToken: session.accessToken)
        let refreshedDocuments = mergedDocuments(primary: response.documents, fallback: documents)
        let refreshedResponse = response.replacingDocuments(refreshedDocuments)
        documents = refreshedDocuments
        facets = response.facets
        await cacheStore.write(refreshedResponse, cacheKey: cacheKey)
        errorMessage = nil
        startPrefetch(after: response, cacheKey: cacheKey, accessToken: session.accessToken)
    }

    private func startPrefetch(after initialResponse: DocumentsListResponse, cacheKey: DocumentsCacheKey, accessToken: String) {
        guard let pagination = initialResponse.pagination else { return }

        let maximumPrefetchPage = min(
            pagination.pageCount,
            Int(ceil(Double(maximumLoadedDocuments) / Double(pageSize)))
        )
        guard pagination.hasNextPage, maximumPrefetchPage > firstPage else { return }

        prefetchTask = Task { [weak self] in
            await self?.prefetchRemainingDocuments(
                after: initialResponse,
                through: maximumPrefetchPage,
                cacheKey: cacheKey,
                accessToken: accessToken
            )
        }
    }

    private func prefetchRemainingDocuments(
        after initialResponse: DocumentsListResponse,
        through maximumPrefetchPage: Int,
        cacheKey: DocumentsCacheKey,
        accessToken: String
    ) async {
        var prefetchedDocuments = initialResponse.documents
        var latestResponse = initialResponse

        for page in (firstPage + 1)...maximumPrefetchPage {
            guard Task.isCancelled == false else { return }

            do {
                let response = try await apiClient.listDocuments(page: page, pageSize: pageSize, accessToken: accessToken)
                latestResponse = response
                prefetchedDocuments = mergedDocuments(primary: prefetchedDocuments + response.documents, fallback: [])
                documents = mergedDocuments(primary: prefetchedDocuments, fallback: documents)
                facets = response.facets
                await cacheStore.write(latestResponse.replacingDocuments(documents), cacheKey: cacheKey)
            } catch {
                return
            }
        }

        guard Task.isCancelled == false else { return }
        documents = Array(prefetchedDocuments.prefix(maximumLoadedDocuments))
        facets = latestResponse.facets
        await cacheStore.write(latestResponse.replacingDocuments(documents), cacheKey: cacheKey)
    }

    private func mergedDocuments(primary: [DocumentsListItem], fallback: [DocumentsListItem]) -> [DocumentsListItem] {
        var seen = Set<String>()
        var result: [DocumentsListItem] = []

        for document in primary + fallback where seen.insert(document.id).inserted {
            result.append(document)
        }

        return Array(result.prefix(maximumLoadedDocuments))
    }

    private func searchResult(for document: DocumentsListItem, normalizedQuery: String, displayQuery: String) -> DocumentsSearchResult? {
        let candidates = searchCandidates(for: document)
        guard let match = candidates.first(where: { normalizedSearchText($0.value).contains(normalizedQuery) }) else {
            return nil
        }

        return DocumentsSearchResult(
            document: document,
            query: displayQuery,
            fieldLabel: match.label,
            matchedValue: match.value
        )
    }

    private func searchCandidates(for document: DocumentsListItem) -> [(label: String, value: String)] {
        var candidates: [(label: String, value: String)] = []

        if let principalName = DocumentsDisplay.principalName(for: document), principalName.isEmpty == false {
            candidates.append(("Principal", principalName))
        }

        if let idn = document.idn, idn.isEmpty == false {
            candidates.append(("IDN", idn))
        }

        candidates.append(("Document", "DOC-\(document.id.prefix(8).uppercased())"))
        candidates.append(("Type", DocumentsDisplay.productLabel(for: document)))

        let jurisdiction = DocumentsDisplay.normalizedJurisdiction(document.jurisdiction)
        if jurisdiction.isEmpty == false {
            candidates.append(("Jurisdiction", jurisdiction))
        }

        for signer in document.signerSummary?.signers ?? [] {
            let signerName = signer.name?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if signerName.isEmpty == false {
                candidates.append((signer.roleLabel, signerName))
            }
        }

        return candidates
    }

    private func normalizedSearchText(_ value: String) -> String {
        value.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current)
            .lowercased()
    }
}

struct DocumentsSearchResult: Identifiable, Equatable, Sendable {
    let document: DocumentsListItem
    let query: String
    let fieldLabel: String
    let matchedValue: String

    var id: String { "\(document.id)-\(fieldLabel)-\(matchedValue)" }
}

enum DocumentsDisplay {
    static func phase(for document: DocumentsListItem) -> DocumentsPhaseDisplay {
        let status = document.status?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
        let intakeStatus = document.intakeStatus?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
        let actionCode = document.nextAction?.code.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""

        if actionCode == "complete_intake" || intakeStatus == "draft" || status == "draft" || status.contains("intake") {
            return DocumentsPhaseDisplay(label: "DRAFT CREATED", completedSegmentCount: 1)
        }

        if ["pending_notary", "notary_review", "pending_notary_review"].contains(status) {
            let workflow = document.summary?.workflow
            let requestID = workflow?.requestId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let workflowID = workflow?.workflowId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let label = requestID.isEmpty && workflowID.isEmpty ? "PENDING NOTARY SELECTION" : "AWAITING NOTARY REVIEW"
            return DocumentsPhaseDisplay(label: label, completedSegmentCount: 3)
        }

        switch status {
        case "pending_signature":
            if canContinueWithoutSignature(for: document) {
                return DocumentsPhaseDisplay(label: "PENDING NOTARY SELECTION", completedSegmentCount: 3)
            }

            return DocumentsPhaseDisplay(label: "AWAITING SIGNATURES", completedSegmentCount: 2)
        case let value where value.contains("awaiting_in_person") || value.contains("pending_in_person"):
            return DocumentsPhaseDisplay(label: "AWAITING IN-PERSON SESSION", completedSegmentCount: 4)
        case let value where value.contains("in_person"):
            return DocumentsPhaseDisplay(label: "IN-PERSON SESSION", completedSegmentCount: 1)
        case "completed", "finalized", "complete":
            return DocumentsPhaseDisplay(label: "DOCUMENT COMPLETED", completedSegmentCount: 5)
        case "pending_review", "review_ready":
            return DocumentsPhaseDisplay(label: "AWAITING REVIEW", completedSegmentCount: 1)
        default:
            return DocumentsPhaseDisplay(label: "DOCUMENT CREATED", completedSegmentCount: 1)
        }
    }

    static func normalizedJurisdiction(_ value: String?) -> String {
        let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard trimmed.isEmpty == false else { return "" }

        return trimmed
            .uppercased()
            .replacingOccurrences(of: "US-", with: "US/")
            .replacingOccurrences(of: "_", with: "/")
    }

    static func productKind(for document: DocumentsListItem) -> DocumentsProductKind? {
        let selectedFamilies = (document.selectedFamilies ?? []).map { $0.lowercased() }
        let combined = [document.documentTypeLabel, document.documentType, document.productFlowMode]
            .compactMap { $0?.lowercased() }
            .joined(separator: " ")

        if selectedFamilies.contains("trust") || combined.contains("trust") {
            return .trust
        }

        if selectedFamilies.contains("poa") || combined.contains("poa") || combined.contains("power") {
            return .poa
        }

        if selectedFamilies.contains("idn") || combined.contains("notar") || combined.contains("uploaded") || combined.contains("idn") {
            return .notarization
        }

        return nil
    }

    static func canContinueWithoutSignature(for document: DocumentsListItem) -> Bool {
        let status = document.status?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
        guard status == "pending_signature" else { return false }

        let productFlowMode = document.productFlowMode?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
        let documentType = document.documentType?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
        let documentTypeLabel = document.documentTypeLabel?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""

        return productFlowMode == "notarize_document"
            || documentType == "notarize_document"
            || documentType == "uploaded_document"
            || documentTypeLabel == "document notarization"
    }

    static func productLabel(for document: DocumentsListItem) -> String {
        if let kind = productKind(for: document) {
            switch kind {
            case .poa:
                return "POA"
            case .trust:
                return "TRUST"
            case .notarization:
                return "DOCUMENT"
            }
        }

        let label = document.documentTypeLabel?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if label.isEmpty == false {
            return label.uppercased()
        }

        return "DOCUMENT"
    }

    static func principalName(for document: DocumentsListItem) -> String? {
        let directName = document.principalName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if directName.isEmpty == false && isGenericPersonLabel(directName) == false {
            return directName
        }

        return document.signerSummary?.signers.first { signer in
            let role = signer.role.lowercased()
            let name = signer.name?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return ["principal", "grantor", "trustmaker", "trustee"].contains(role) && name.isEmpty == false && isGenericPersonLabel(name) == false
        }?.name
    }

    private static func isGenericPersonLabel(_ value: String) -> Bool {
        let normalized = value
            .lowercased()
            .replacingOccurrences(of: #"[^a-z0-9]+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)

        return ["", "principal", "grantor", "trustmaker", "trustee", "signer"].contains(normalized)
    }
}

struct DocumentsPhaseDisplay: Equatable, Sendable {
    let label: String
    let completedSegmentCount: Int
}

enum DocumentsDateFormatting {
    static func date(from value: String) -> Date {
        if let date = fractionalFormatter().date(from: value) {
            return date
        }

        if let date = internetFormatter().date(from: value) {
            return date
        }

        return .distantPast
    }

    static func dayKey(from value: String) -> String {
        let date = date(from: value)
        return dayKeyFormatter().string(from: date)
    }

    static func displayDate(from date: Date) -> String {
        displayFormatter().string(from: date)
    }

    static func cutoffDate(for filter: DocumentsCreatedFromFilter) -> Date {
        let calendar = Calendar.current
        let now = Date()

        switch filter {
        case .today:
            return calendar.startOfDay(for: now)
        case .last7Days:
            return calendar.date(byAdding: .day, value: -7, to: now) ?? now
        case .last30Days:
            return calendar.date(byAdding: .day, value: -30, to: now) ?? now
        case .last90Days:
            return calendar.date(byAdding: .day, value: -90, to: now) ?? now
        }
    }

    private static func fractionalFormatter() -> ISO8601DateFormatter {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }

    private static func internetFormatter() -> ISO8601DateFormatter {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }

    private static func dayKeyFormatter() -> DateFormatter {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone.current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }

    private static func displayFormatter() -> DateFormatter {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone.current
        formatter.dateFormat = "M/d/yyyy"
        return formatter
    }
}