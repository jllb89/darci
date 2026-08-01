import SwiftUI
import PDFKit

struct NotaryRequestReviewView: View {
    let session: AuthSession?
    let onDecisionRecorded: () -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @StateObject private var viewModel: NotaryRequestReviewViewModel
    @State private var pageCount = 1
    @State private var currentPage = 1
    @State private var zoomInTrigger = 0
    @State private var zoomOutTrigger = 0

    init(
        session: AuthSession?,
        requestId: String,
        apiClient: NotaryProfileAPIProviding = NotaryProfileAPIClient(),
        onDecisionRecorded: @escaping () -> Void
    ) {
        self.session = session
        self.onDecisionRecorded = onDecisionRecorded
        _viewModel = StateObject(wrappedValue: NotaryRequestReviewViewModel(requestId: requestId, apiClient: apiClient))
    }

    var body: some View {
        GeometryReader { proxy in
            VStack(spacing: 0) {
                VStack(alignment: .leading, spacing: reviewSectionSpacing(in: proxy)) {
                    header

                    instructionCopy

                    if let errorMessage = viewModel.errorMessage {
                        statusMessage(errorMessage)
                    }

                    if let decisionNotice = viewModel.decisionNotice {
                        statusMessage(decisionNotice, tone: .neutral)
                    }

                    if viewModel.reviewDocuments.count > 1 {
                        documentSelector
                    }

                    reviewPreview(proxy: proxy)
                        .layoutPriority(1)
                }
                .padding(.horizontal, scaled(25, in: proxy))
                .padding(.top, reviewTopPadding(in: proxy))
                .padding(.bottom, scaled(10, in: proxy))
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)

                actionBar(proxy: proxy)
            }
            .background(Color.white.ignoresSafeArea())
        }
        .navigationBarBackButtonHidden(true)
        .toolbar(.hidden, for: .navigationBar)
        .task {
            await viewModel.load(session: session)
        }
    }

    private var header: some View {
        HStack(spacing: 20) {
            Button {
                dismiss()
            } label: {
                Image(systemName: "arrow.left")
                    .font(.system(size: 24, weight: .regular))
                    .foregroundStyle(.black)
                    .frame(width: 28, height: 28)
            }
            .buttonStyle(.plain)

            Text(viewModel.screenTitle.uppercased())
                .font(DARCiFont.maisonNeue(.medium, size: 15))
                .lineLimit(1)
                .minimumScaleFactor(0.78)
                .foregroundStyle(.black)
        }
    }

    private var instructionCopy: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text("Review documents")
                .font(DARCiFont.maisonNeue(.demi, size: 12))
                .foregroundStyle(.black)

            Text("Approve: DARCi will share contact details with both parties for the in-person session.\nReject: Member will be notified and asked to select a different illuminotary.")
                .font(DARCiFont.maisonNeue(.book, size: 12))
                .lineSpacing(5)
                .foregroundStyle(.black)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var documentSelector: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(viewModel.reviewDocuments) { document in
                    Button {
                        viewModel.selectDocument(document)
                    } label: {
                        Text(document.label)
                            .font(DARCiFont.maisonNeue(.book, size: 12))
                            .foregroundStyle(document.id == viewModel.selectedDocument?.id ? .white : .black)
                            .lineLimit(1)
                            .padding(.horizontal, 14)
                            .frame(height: 36)
                            .background(document.id == viewModel.selectedDocument?.id ? Color.black : Color.clear)
                            .overlay {
                                Rectangle()
                                    .stroke(.black.opacity(0.22), lineWidth: 1)
                            }
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func reviewPreview(proxy: GeometryProxy) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 28) {
                Text("\(min(currentPage, max(pageCount, 1)))/\(max(pageCount, 1))")
                    .font(DARCiFont.maisonNeue(.book, size: 12))
                    .foregroundStyle(.black)
                    .frame(minWidth: 44, alignment: .leading)

                Button {
                    zoomInTrigger += 1
                } label: {
                    Image(systemName: "plus.magnifyingglass")
                        .font(.system(size: 14, weight: .regular))
                        .foregroundStyle(.black)
                        .frame(width: 24, height: 24)
                }
                .buttonStyle(.plain)
                .disabled(viewModel.pdfData == nil)

                Button {
                    zoomOutTrigger += 1
                } label: {
                    Image(systemName: "minus.magnifyingglass")
                        .font(.system(size: 14, weight: .regular))
                        .foregroundStyle(.black)
                        .frame(width: 24, height: 24)
                }
                .buttonStyle(.plain)
                .disabled(viewModel.pdfData == nil)

                Spacer()

                Button {
                    if let selectedDocument = viewModel.selectedDocument,
                       let downloadUrl = selectedDocument.downloadUrl,
                       let url = URL(string: downloadUrl) {
                        openURL(url)
                    }
                } label: {
                    Image(systemName: "arrow.down.to.line")
                        .font(.system(size: 16, weight: .regular))
                        .foregroundStyle(.black)
                        .frame(width: 24, height: 24)
                }
                .buttonStyle(.plain)
                .disabled(viewModel.selectedDocument?.downloadUrl == nil)
            }
            .padding(.horizontal, 16)
            .frame(height: 58)

            ZStack {
                Color.white

                if let pdfData = viewModel.pdfData {
                    PDFKitDocumentPreview(
                        data: pdfData,
                        pageCount: $pageCount,
                        currentPage: $currentPage,
                        zoomInTrigger: zoomInTrigger,
                        zoomOutTrigger: zoomOutTrigger
                    )
                } else if viewModel.isLoadingPreview || viewModel.isLoading {
                    ProgressView()
                        .tint(.black)
                } else {
                    Text(viewModel.previewMessage)
                        .font(DARCiFont.maisonNeue(.book, size: 12))
                        .lineSpacing(5)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.black.opacity(0.62))
                        .padding(24)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .padding(.horizontal, 16)
            .padding(.bottom, 16)
        }
        .frame(maxWidth: .infinity)
        .frame(maxHeight: .infinity)
        .background(Color(red: 0.85, green: 0.85, blue: 0.85))
        .clipShape(RoundedRectangle(cornerRadius: 17, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 17, style: .continuous)
                .stroke(Color(red: 0.72, green: 0.72, blue: 0.72), lineWidth: 0.5)
        }
    }

    private func actionBar(proxy: GeometryProxy) -> some View {
        HStack(spacing: scaled(10, in: proxy)) {
            Button {
                Task { await submitDecision("rejected") }
            } label: {
                HStack(spacing: scaled(14, in: proxy)) {
                    Spacer(minLength: 0)
                    Text(viewModel.isSubmittingDecision("rejected") ? "Rejecting" : "Reject")
                    Image(systemName: "xmark")
                        .font(.system(size: scaled(25, in: proxy), weight: .regular))
                    Spacer(minLength: 0)
                }
                .font(DARCiFont.maisonNeue(.book, size: scaled(16, in: proxy)))
                .lineSpacing(scaled(1.6, in: proxy))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, minHeight: scaled(54, in: proxy))
                .background(viewModel.canSubmitDecision ? Color.black : Color.black.opacity(0.42))
            }
            .buttonStyle(.plain)
            .disabled(viewModel.canSubmitDecision == false)

            Button {
                Task { await submitDecision("approved") }
            } label: {
                HStack(spacing: scaled(14, in: proxy)) {
                    Spacer(minLength: 0)
                    Text(viewModel.isSubmittingDecision("approved") ? "Approving" : "Approve")
                    DARCiCheckIcon()
                        .stroke(.black, style: StrokeStyle(lineWidth: 2, lineCap: .square, lineJoin: .miter))
                        .frame(width: scaled(23, in: proxy), height: scaled(23, in: proxy))
                    Spacer(minLength: 0)
                }
                .font(DARCiFont.maisonNeue(.book, size: scaled(16, in: proxy)))
                .lineSpacing(scaled(1.6, in: proxy))
                .foregroundStyle(.black)
                .frame(maxWidth: .infinity, minHeight: scaled(54, in: proxy))
                .background(viewModel.canSubmitDecision ? DARCiTheme.onboardingGreen : Color.black.opacity(0.18))
            }
            .buttonStyle(.plain)
            .disabled(viewModel.canSubmitDecision == false)
        }
        .padding(.horizontal, scaled(25, in: proxy))
        .padding(.top, scaled(12, in: proxy))
        .padding(.bottom, scaled(18, in: proxy))
        .background(Color.white)
    }

    private func submitDecision(_ decision: String) async {
        if await viewModel.submitDecision(decision, session: session) {
            onDecisionRecorded()
        }
    }

    private func statusMessage(_ text: String, tone: NotaryReviewStatusTone = .error) -> some View {
        Text(text)
            .font(DARCiFont.maisonNeue(.book, size: 12))
            .lineSpacing(5)
            .foregroundStyle(tone.foreground)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(tone.background)
            .overlay {
                Rectangle()
                    .stroke(tone.border, lineWidth: 1)
            }
    }

    private func scaled(_ value: CGFloat, in proxy: GeometryProxy) -> CGFloat {
        let widthScale = min(max(proxy.size.width / 440, 0.86), 1.08)
        return value * widthScale
    }

    private func reviewTopPadding(in proxy: GeometryProxy) -> CGFloat {
        scaled(proxy.size.height < 720 ? 20 : 30, in: proxy)
    }

    private func reviewSectionSpacing(in proxy: GeometryProxy) -> CGFloat {
        scaled(proxy.size.height < 720 ? 12 : 16, in: proxy)
    }
}

@MainActor
final class NotaryRequestReviewViewModel: ObservableObject {
    @Published private(set) var context: NotaryRequestReviewContext?
    @Published private(set) var selectedDocument: NotaryReviewDocumentFile?
    @Published private(set) var pdfData: Data?
    @Published private(set) var isLoading = false
    @Published private(set) var isLoadingPreview = false
    @Published private(set) var submittingDecision: String?
    @Published private(set) var errorMessage: String?
    @Published private(set) var previewErrorMessage: String?

    let requestId: String

    private let apiClient: NotaryProfileAPIProviding
    private let urlSession: URLSession
    private var previewTask: Task<Void, Never>?

    init(requestId: String, apiClient: NotaryProfileAPIProviding = NotaryProfileAPIClient(), urlSession: URLSession = .shared) {
        self.requestId = requestId
        self.apiClient = apiClient
        self.urlSession = urlSession
    }

    var reviewDocuments: [NotaryReviewDocumentFile] {
        context?.document.reviewDocuments ?? []
    }

    var screenTitle: String {
        "Notarial request - \(documentTypeLabel(context?.document.documentTypeLabel ?? context?.document.documentType))"
    }

    var canSubmitDecision: Bool {
        guard submittingDecision == nil else { return false }
        guard isLoading == false else { return false }
        return context?.capabilities?.canReviewRequest == true
    }

    var decisionNotice: String? {
        guard isLoading == false, context != nil, canSubmitDecision == false, submittingDecision == nil else {
            return nil
        }

        return "This request is not ready for a review decision yet."
    }

    var previewMessage: String {
        previewErrorMessage ?? "Review PDFs will appear here as soon as they are ready."
    }

    func isSubmittingDecision(_ decision: String) -> Bool {
        submittingDecision == decision
    }

    func load(session: AuthSession?) async {
        guard let accessToken = session?.accessToken else {
            errorMessage = "Sign in again to review this request."
            return
        }

        isLoading = true
        defer { isLoading = false }

        do {
            let response = try await apiClient.getNotaryRequestContext(requestId: requestId, accessToken: accessToken)
            guard var context = response.context else {
                throw NotaryRequestReviewError.missingContext
            }

            if Self.unopenedReviewStatuses.contains(Self.workspaceStatus(context)),
               let idn = context.document.idn?.trimmingCharacters(in: .whitespacesAndNewlines),
               idn.isEmpty == false {
                let resolved = try await apiClient.resolveNotaryRequest(idn: idn, accessToken: accessToken)
                if let resolvedContext = resolved.context {
                    context = resolvedContext
                }
            }

            self.context = context
            errorMessage = nil
            selectDocument(context.document.reviewDocuments.first)
        } catch {
            errorMessage = displayMessage(for: error, fallback: "Unable to load this notarial request.")
        }
    }

    func selectDocument(_ document: NotaryReviewDocumentFile?) {
        previewTask?.cancel()
        selectedDocument = document
        pdfData = nil
        previewErrorMessage = nil

        guard let document else {
            previewErrorMessage = "This request is missing its generated PDF package."
            return
        }

        guard let downloadUrl = document.downloadUrl,
              let url = URL(string: downloadUrl) else {
            previewErrorMessage = "This review PDF is still preparing."
            return
        }

        previewTask = Task { [weak self] in
            await self?.loadPreview(from: url)
        }
    }

    func submitDecision(_ decision: String, session: AuthSession?) async -> Bool {
        guard let accessToken = session?.accessToken else {
            errorMessage = "Sign in again to record this decision."
            return false
        }

        guard canSubmitDecision else {
            errorMessage = "This request is not ready for a review decision yet."
            return false
        }

        submittingDecision = decision
        defer { submittingDecision = nil }

        let summary = decision == "approved"
            ? "Approved from iOS notary review."
            : "Rejected from iOS notary review."

        do {
            _ = try await apiClient.submitReviewDecision(
                requestId: requestId,
                request: NotaryReviewDecisionRequest(
                    decision: decision,
                    summary: summary,
                    decisionNotes: summary
                ),
                accessToken: accessToken
            )
            errorMessage = nil
            return true
        } catch {
            errorMessage = displayMessage(for: error, fallback: "Unable to record review decision.")
            return false
        }
    }

    private static let unopenedReviewStatuses = Set(["pending", "submitted", "code_delivered"])

    private static func workspaceStatus(_ context: NotaryRequestReviewContext) -> String {
        let status = context.request.queueStatus
            ?? context.workflow?.latestStatus
            ?? context.workflow?.status
            ?? context.request.status
            ?? ""
        return status.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private func loadPreview(from url: URL) async {
        isLoadingPreview = true
        defer { isLoadingPreview = false }

        do {
            let (data, response) = try await urlSession.data(from: url)
            guard let httpResponse = response as? HTTPURLResponse,
                  (200..<300).contains(httpResponse.statusCode) else {
                throw NotaryRequestReviewError.previewUnavailable
            }

            guard Task.isCancelled == false else { return }
            pdfData = data
            previewErrorMessage = nil
        } catch {
            guard Task.isCancelled == false else { return }
            previewErrorMessage = "Unable to load this review PDF."
        }
    }

    private func documentTypeLabel(_ value: String?) -> String {
        let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
        switch normalized {
        case "poa", "poa_only", "power_of_attorney":
            return "POA"
        case "trust", "trust_bundle", "trust_registration":
            return "Trust"
        case "notarize_document", "document_notarization", "uploaded_document":
            return "Document"
        default:
            return normalized.isEmpty ? "Document" : normalized.split(separator: "_").map { $0.uppercased() }.joined(separator: " ")
        }
    }
}

private enum NotaryReviewStatusTone {
    case error
    case neutral

    var foreground: Color {
        switch self {
        case .error:
            Color(red: 0.68, green: 0.10, blue: 0.10)
        case .neutral:
            .black.opacity(0.62)
        }
    }

    var background: Color {
        switch self {
        case .error:
            Color(red: 0.99, green: 0.94, blue: 0.94)
        case .neutral:
            Color.black.opacity(0.05)
        }
    }

    var border: Color {
        switch self {
        case .error:
            Color(red: 0.88, green: 0.66, blue: 0.66)
        case .neutral:
            Color.black.opacity(0.12)
        }
    }
}

private enum NotaryRequestReviewError: Error {
    case missingContext
    case previewUnavailable
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