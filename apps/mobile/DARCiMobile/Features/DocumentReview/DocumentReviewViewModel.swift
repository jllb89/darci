import Foundation

@MainActor
final class DocumentReviewViewModel: ObservableObject {
    @Published private(set) var payload: DocumentReviewResponse?
    @Published var selectedOutputKey: String?
    @Published private(set) var pdfData: Data?
    @Published private(set) var isLoading = false
    @Published private(set) var isLoadingPreview = false
    @Published private(set) var isApproving = false
    @Published private(set) var isSavingDraft = false
    @Published private(set) var errorMessage: String?
    @Published private(set) var previewErrorMessage: String?
    @Published private(set) var draftNotice: String?

    let documentId: String

    private let apiClient: DocumentIntakeAPIProviding
    private var generationAttemptSignature: String?
    private var pollTask: Task<Void, Never>?
    private var previewTask: Task<Void, Never>?
    private var loadedPreviewVersionId: String?

    init(documentId: String, apiClient: DocumentIntakeAPIProviding = DocumentIntakeAPIClient()) {
        self.documentId = documentId
        self.apiClient = apiClient
    }

    var documentTitle: String {
        let dateLabel = Self.compactDateLabel(from: payload?.document?.createdAt) ?? "Review"
        let outputLabel = Self.documentOutputLabel(selectedOutput?.outputLabel)
            ?? Self.documentTypeLabel(payload?.document?.documentType)
        return "\(dateLabel) - \(outputLabel)"
    }

    var review: DocumentReviewState? {
        payload?.review
    }

    var selectedOutput: DocumentReviewOutput? {
        guard let review else { return nil }

        return review.outputs.first { $0.outputKey == selectedOutputKey }
            ?? review.outputs.first
    }

    var canContinueToSign: Bool {
        guard isApproving == false else { return false }

        if review?.reviewApproval != nil {
            return true
        }

        return review?.canApprove == true
    }

    var canContinueWithoutSignature: Bool {
        guard isApproving == false else { return false }
        guard isDocumentNotarization else { return false }

        if review?.reviewApproval != nil {
            return true
        }

        return review?.canApprove == true
    }

    var isDocumentNotarization: Bool {
        payload?.document?.productFlowMode == "notarize_document"
            || payload?.document?.documentType == "notarize_document"
            || payload?.document?.documentType == "uploaded_document"
    }

    var approvalHelperText: String? {
        guard let review else { return nil }

        if let approvedAt = review.reviewApproval?.approvedAt {
            return "Approved \(Self.longDateLabel(from: approvedAt) ?? "just now")."
        }

        if review.canApprove {
            return nil
        }

        if isWaitingForRenderableOutputs {
            return "Approval unlocks when the visible review PDFs finish rendering."
        }

        if hasBlockedOutputs {
            return "Approval is blocked until every visible review PDF is ready."
        }

        return "DARCi needs at least one visible review PDF before approval can proceed."
    }

    var isWaitingForRenderableOutputs: Bool {
        (review?.outputs.isEmpty ?? true) && (review?.pendingOutputs.contains { Self.isActiveGenerationStatus($0.status) } ?? false)
    }

    var hasBlockedOutputs: Bool {
        review?.pendingOutputs.contains { Self.isBlockedStatus($0.status) } ?? false
    }

    var isPreparingPreview: Bool {
        if isLoading && payload == nil {
            return true
        }

        guard let review else {
            return true
        }

        if review.requiresGeneration || review.missingOutputKeys.isEmpty == false {
            return true
        }

        if review.pendingOutputs.contains(where: { Self.isActiveGenerationStatus($0.status) }) {
            return true
        }

        if review.outputs.isEmpty {
            return hasBlockedOutputs == false
        }

        return pdfData == nil && previewErrorMessage == nil
    }

    func load(session: AuthSession?) async {
        generationAttemptSignature = nil
        await fetchReview(session: session, silent: false)
    }

    func stop() {
        pollTask?.cancel()
        pollTask = nil
        previewTask?.cancel()
        previewTask = nil
    }

    func selectOutput(_ output: DocumentReviewOutput) {
        selectedOutputKey = output.outputKey
        loadPreview(for: output)
    }

    func saveToDraft(session: AuthSession?) async -> Bool {
        guard let accessToken = session?.accessToken else {
            errorMessage = "Sign in again to save this draft."
            return false
        }

        isSavingDraft = true
        defer { isSavingDraft = false }

        do {
            let response = try await apiClient.resaveDocumentIntakeDraft(documentId: documentId, accessToken: accessToken)
            if let updatedAt = response.draft?.updatedAt, let savedAt = Self.longDateLabel(from: updatedAt) {
                draftNotice = "Draft saved at \(savedAt)."
            } else {
                draftNotice = "Draft saved."
            }
            errorMessage = nil
            return true
        } catch {
            errorMessage = displayMessage(for: error, fallback: "Failed to save draft.")
            return false
        }
    }

    func continueToSign(session: AuthSession?) async -> Bool {
        guard let accessToken = session?.accessToken else {
            errorMessage = "Sign in again to continue signing."
            return false
        }

        if review?.reviewApproval != nil {
            return true
        }

        guard review?.canApprove == true else {
            return false
        }

        isApproving = true
        defer { isApproving = false }

        do {
            _ = try await apiClient.approveDocumentReview(
                documentId: documentId,
                request: DocumentReviewApprovalRequest(agreed: true),
                accessToken: accessToken
            )
            errorMessage = nil
            return true
        } catch {
            errorMessage = displayMessage(for: error, fallback: "Failed to approve document review.")
            return false
        }
    }

    func continueWithoutSignature(session: AuthSession?) async -> Bool {
        guard isDocumentNotarization else { return false }
        return await continueToSign(session: session)
    }

    private func fetchReview(session: AuthSession?, silent: Bool) async {
        guard let accessToken = session?.accessToken else {
            errorMessage = "Sign in again to load review documents."
            return
        }

        if silent == false {
            isLoading = true
        }

        do {
            let response = try await apiClient.getDocumentReview(documentId: documentId, accessToken: accessToken)
            guard response.document != nil, response.review != nil else {
                throw ReviewError.missingReview
            }

            payload = response
            errorMessage = nil
            selectInitialOutputIfNeeded()

            if let selectedOutput {
                loadPreview(for: selectedOutput)
            }

            await ensureGenerationIfNeeded(session: session)
            schedulePollIfNeeded(session: session)
        } catch {
            errorMessage = displayMessage(for: error, fallback: "Failed to load review documents.")
        }

        if silent == false {
            isLoading = false
        }
    }

    private func ensureGenerationIfNeeded(session: AuthSession?) async {
        guard let accessToken = session?.accessToken,
              let review,
              review.requiresGeneration,
              review.missingOutputKeys.isEmpty == false else {
            return
        }

        let signature = review.missingOutputKeys.joined(separator: ",")
        guard generationAttemptSignature != signature else {
            return
        }

        generationAttemptSignature = signature

        do {
            _ = try await apiClient.createDocumentGenerationRuns(
                documentId: documentId,
                request: DocumentGenerationRunsRequest(outputKeys: review.missingOutputKeys),
                accessToken: accessToken
            )
            await fetchReview(session: session, silent: true)
        } catch {
            errorMessage = displayMessage(for: error, fallback: "Failed to start review PDF generation.")
        }
    }

    private func schedulePollIfNeeded(session: AuthSession?) {
        pollTask?.cancel()

        guard shouldPollReview else {
            pollTask = nil
            return
        }

        pollTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(4))
            guard Task.isCancelled == false else { return }
            await self?.fetchReview(session: session, silent: true)
        }
    }

    private var shouldPollReview: Bool {
        guard let review else { return false }

        return review.state == "generating"
            || review.requiresGeneration
            || review.pendingOutputs.contains { Self.isActiveGenerationStatus($0.status) }
    }

    private func selectInitialOutputIfNeeded() {
        guard let outputs = review?.outputs, outputs.isEmpty == false else {
            selectedOutputKey = nil
            pdfData = nil
            loadedPreviewVersionId = nil
            return
        }

        if let selectedOutputKey, outputs.contains(where: { $0.outputKey == selectedOutputKey }) {
            return
        }

        selectedOutputKey = outputs[0].outputKey
    }

    private func loadPreview(for output: DocumentReviewOutput) {
        guard loadedPreviewVersionId != output.versionId else {
            return
        }

        previewTask?.cancel()
        previewTask = Task { [weak self] in
            await self?.loadPreviewData(for: output)
        }
    }

    private func loadPreviewData(for output: DocumentReviewOutput) async {
        guard let url = URL(string: output.downloadUrl) else {
            previewErrorMessage = "The PDF preview link is invalid."
            pdfData = nil
            loadedPreviewVersionId = nil
            return
        }

        isLoadingPreview = true
        previewErrorMessage = nil

        do {
            let (data, response) = try await URLSession.shared.data(from: url)
            if let httpResponse = response as? HTTPURLResponse,
               (200..<300).contains(httpResponse.statusCode) == false {
                throw ReviewError.previewUnavailable
            }

            loadedPreviewVersionId = output.versionId
            pdfData = data
        } catch {
            loadedPreviewVersionId = nil
            pdfData = nil
            previewErrorMessage = "Failed to load the PDF preview."
        }

        isLoadingPreview = false
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

    private static func isActiveGenerationStatus(_ status: String) -> Bool {
        status == "queued"
            || status == "rendering"
            || status == "not_started"
            || status == "download_unavailable"
    }

    private static func isBlockedStatus(_ status: String) -> Bool {
        status == "blocked" || status == "failed" || status == "canceled"
    }

    private static func documentTypeLabel(_ value: String?) -> String {
        switch normalizedDocumentLabelKey(value) {
        case "poa_document", "power_of_attorney":
            return "Power of Attorney"
        case "trust_certificate":
            return "Trust Certification"
        case "trust_rrr":
            return "Trust Registration Amendment"
        case "uploaded_document", "notarize_document":
            return "Document Notarization"
        default:
            return value?
                .split(separator: "_")
                .map { $0.prefix(1).uppercased() + $0.dropFirst() }
                .joined(separator: " ") ?? "Document"
        }
    }

    private static func documentOutputLabel(_ value: String?) -> String? {
        guard let value, value.isEmpty == false else { return nil }
        guard let normalizedKey = normalizedDocumentLabelKey(value) else { return value }
        if normalizedKey == "notarize_document" || normalizedKey == "uploaded_document" {
            return "Document Notarization"
        }

        if normalizedKey.contains("_") {
            return documentTypeLabel(normalizedKey)
        }

        return value
    }

    private static func normalizedDocumentLabelKey(_ value: String?) -> String? {
        value?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .replacingOccurrences(of: " ", with: "_")
            .replacingOccurrences(of: "-", with: "_")
    }

    private static func compactDateLabel(from value: String?) -> String? {
        guard let date = isoDateFormatter.date(from: value ?? "") else {
            return nil
        }

        return compactDateFormatter.string(from: date)
    }

    private static func longDateLabel(from value: String?) -> String? {
        guard let date = isoDateFormatter.date(from: value ?? "") else {
            return nil
        }

        return longDateFormatter.string(from: date)
    }

    private static let isoDateFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let compactDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "M/d/yyyy"
        return formatter
    }()

    private static let longDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter
    }()
}

private enum ReviewError: Error {
    case missingReview
    case previewUnavailable
}