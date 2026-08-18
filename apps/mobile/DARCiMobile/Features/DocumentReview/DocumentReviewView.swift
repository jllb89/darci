import SwiftUI
import PDFKit

struct DocumentReviewView: View {
    let session: AuthSession?
    let onSavedToDraft: () -> Void
    let onContinueToSign: (String) -> Void
    let onContinueWithoutSignature: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @StateObject private var viewModel: DocumentReviewViewModel
    @State private var pageCount = 1
    @State private var currentPage = 1
    @State private var zoomInTrigger = 0
    @State private var zoomOutTrigger = 0
    @State private var isContinuingToSign = false
    @State private var isContinuingWithoutSignature = false
    @Environment(\.openURL) private var openURL

    init(
        session: AuthSession?,
        documentId: String,
        apiClient: DocumentIntakeAPIProviding = DocumentIntakeAPIClient(),
        onSavedToDraft: @escaping () -> Void,
        onContinueToSign: @escaping (String) -> Void,
        onContinueWithoutSignature: @escaping (String) -> Void
    ) {
        self.session = session
        self.onSavedToDraft = onSavedToDraft
        self.onContinueToSign = onContinueToSign
        self.onContinueWithoutSignature = onContinueWithoutSignature
        _viewModel = StateObject(wrappedValue: DocumentReviewViewModel(documentId: documentId, apiClient: apiClient))
    }

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                VStack(spacing: 0) {
                    VStack(alignment: .leading, spacing: reviewSectionSpacing(in: proxy)) {
                        header

                        VStack(alignment: .leading, spacing: 7) {
                            Text("Review documents")
                                .font(DARCiFont.maisonNeue(.demi, size: 12))
                                .foregroundStyle(.black)

                            Text("Review each PDF carefully before approving for signing.")
                                .font(DARCiFont.maisonNeue(.book, size: 12))
                                .lineSpacing(5)
                                .foregroundStyle(.black)
                        }

                        if let errorMessage = viewModel.errorMessage {
                            statusMessage(errorMessage, tone: .error)
                        }

                        if let draftNotice = viewModel.draftNotice {
                            statusMessage(draftNotice, tone: .success)
                        }

                        let outputs = viewModel.visibleOutputs
                        if outputs.count > 1 {
                            outputSelector(outputs)
                        }

                        if hasPendingOutputContent && viewModel.isPreparingPreview == false {
                            pendingOutputs
                        }

                        reviewPreview(proxy: proxy)
                            .layoutPriority(1)

                        if let approvalHelperText = viewModel.approvalHelperText {
                            statusMessage(approvalHelperText, tone: viewModel.review?.reviewApproval == nil ? .neutral : .success)
                        }
                    }
                    .padding(.horizontal, scaled(25, in: proxy))
                    .padding(.top, reviewTopPadding(in: proxy))
                    .padding(.bottom, scaled(10, in: proxy))
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)

                    actionBar(proxy: proxy)
                }
                .opacity(viewModel.isPreparingPreview ? 0 : 1)

                if viewModel.isPreparingPreview {
                    documentGenerationLoader(proxy: proxy)
                }
            }
            .background(Color.white.ignoresSafeArea())
        }
        .navigationBarBackButtonHidden(true)
        .toolbar(.hidden, for: .navigationBar)
        .task {
            await viewModel.load(session: session)
        }
        .onDisappear {
            viewModel.stop()
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

            Text(viewModel.documentTitle)
                .font(DARCiFont.maisonNeue(.medium, size: 15))
                .lineLimit(1)
                .minimumScaleFactor(0.78)
                .foregroundStyle(.black)
        }
    }

    private func documentGenerationLoader(proxy: GeometryProxy) -> some View {
        VStack(alignment: .leading, spacing: scaled(28, in: proxy)) {
            header

            Spacer(minLength: 0)

            VStack(alignment: .leading, spacing: 18) {
                ProgressView()
                    .tint(.black)
                    .scaleEffect(1.15)

                Text("Preparing documents")
                    .font(DARCiFont.maisonNeue(.medium, size: 24))
                    .foregroundStyle(.black)

                Text("DARCi is rendering every required PDF and loading the preview. This usually takes a moment.")
                    .font(DARCiFont.maisonNeue(.book, size: 13))
                    .lineSpacing(5)
                    .foregroundStyle(.black.opacity(0.62))
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Spacer(minLength: 0)
        }
        .padding(.horizontal, scaled(25, in: proxy))
        .padding(.top, reviewTopPadding(in: proxy))
        .padding(.bottom, scaled(44, in: proxy))
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Color.white.ignoresSafeArea())
    }

    private var pendingOutputs: some View {
        VStack(alignment: .leading, spacing: 12) {
            if viewModel.isLoading && viewModel.payload == nil {
                statusMessage("Loading review documents...", tone: .neutral)
            }

            if viewModel.isWaitingForRenderableOutputs {
                statusMessage("Preparing your review PDFs.", tone: .neutral)
            }

            ForEach(viewModel.review?.pendingOutputs ?? []) { output in
                VStack(alignment: .leading, spacing: 8) {
                    Text(output.outputLabel)
                        .font(DARCiFont.maisonNeue(.medium, size: 12))
                        .foregroundStyle(.black)

                    Text(Self.statusLabel(output.status))
                        .font(DARCiFont.maisonNeue(.book, size: 11))
                        .foregroundStyle(Self.statusColor(output.status))

                    if let errorMessage = output.errorMessage, errorMessage.isEmpty == false {
                        Text(errorMessage)
                            .font(DARCiFont.maisonNeue(.book, size: 11))
                            .lineSpacing(4)
                            .foregroundStyle(.black.opacity(0.62))
                    }

                    ForEach((output.blockers ?? []).filter(\.blocking)) { blocker in
                        Text(blocker.message)
                            .font(DARCiFont.maisonNeue(.book, size: 11))
                            .lineSpacing(4)
                            .foregroundStyle(Color(red: 0.68, green: 0.10, blue: 0.10))
                    }
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .overlay {
                    Rectangle()
                        .stroke(.black.opacity(0.12), lineWidth: 1)
                }
            }
        }
    }

    private var hasPendingOutputContent: Bool {
        (viewModel.isLoading && viewModel.payload == nil)
            || viewModel.isWaitingForRenderableOutputs
            || (viewModel.review?.pendingOutputs.isEmpty == false)
    }

    private func outputSelector(_ outputs: [DocumentReviewOutput]) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(outputs) { output in
                    Button {
                        viewModel.selectOutput(output)
                    } label: {
                        Text(output.outputLabel)
                            .font(DARCiFont.maisonNeue(.book, size: 12))
                            .foregroundStyle(output.outputKey == viewModel.selectedOutput?.outputKey ? .white : .black)
                            .lineLimit(1)
                            .padding(.horizontal, 14)
                            .frame(height: 36)
                            .background(output.outputKey == viewModel.selectedOutput?.outputKey ? Color.black : Color.clear)
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
                    if let selectedOutput = viewModel.selectedOutput, let url = URL(string: selectedOutput.downloadUrl) {
                        openURL(url)
                    }
                } label: {
                    Image(systemName: "arrow.down.to.line")
                        .font(.system(size: 16, weight: .regular))
                        .foregroundStyle(.black)
                        .frame(width: 24, height: 24)
                }
                .buttonStyle(.plain)
                .disabled(viewModel.selectedOutput == nil)
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
                } else if viewModel.isLoadingPreview {
                    ProgressView()
                        .tint(.black)
                } else {
                    VStack(spacing: 10) {
                        Text(viewModel.previewErrorMessage ?? "Review PDFs will appear here as soon as they are ready.")
                            .font(DARCiFont.maisonNeue(.book, size: 12))
                            .lineSpacing(5)
                            .multilineTextAlignment(.center)
                            .foregroundStyle(.black.opacity(0.62))
                    }
                    .padding(24)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(maxHeight: .infinity)
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
        VStack(spacing: scaled(10, in: proxy)) {
            if viewModel.isDocumentNotarization {
                Button {
                    Task {
                        isContinuingWithoutSignature = true
                        defer { isContinuingWithoutSignature = false }
                        if await viewModel.continueWithoutSignature(session: session) {
                            onContinueWithoutSignature(viewModel.documentId)
                        }
                    }
                } label: {
                    HStack(spacing: 12) {
                        Text(isContinuingWithoutSignature ? "Approving..." : "Continue without signature")
                        DARCiArrowCornerIcon()
                            .stroke(.white, style: StrokeStyle(lineWidth: 2, lineCap: .square, lineJoin: .miter))
                            .frame(width: 18, height: 18)
                    }
                    .font(DARCiFont.maisonNeue(.book, size: 16))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.78)
                    .frame(maxWidth: .infinity, minHeight: 54)
                    .background(viewModel.canContinueWithoutSignature ? Color.black : Color.black.opacity(0.42))
                }
                .buttonStyle(.plain)
                .disabled(viewModel.canContinueWithoutSignature == false)
            }

            HStack(spacing: scaled(18, in: proxy)) {
                Button {
                    Task {
                        if await viewModel.saveToDraft(session: session) {
                            onSavedToDraft()
                        }
                    }
                } label: {
                    HStack(spacing: 12) {
                        Text(viewModel.isSavingDraft ? "Saving..." : "Save to drafts")
                        Image(systemName: "externaldrive")
                            .font(.system(size: 16, weight: .regular))
                    }
                    .font(DARCiFont.maisonNeue(.book, size: 16))
                    .foregroundStyle(.black)
                    .frame(maxWidth: .infinity, minHeight: 54)
                    .background(Color(red: 0.67, green: 0.67, blue: 0.67).opacity(0.61))
                }
                .buttonStyle(.plain)
                .disabled(viewModel.isSavingDraft)

                Button {
                    Task {
                        isContinuingToSign = true
                        defer { isContinuingToSign = false }
                        if await viewModel.continueToSign(session: session) {
                            onContinueToSign(viewModel.documentId)
                        }
                    }
                } label: {
                    HStack(spacing: 12) {
                        Text(isContinuingToSign ? "Approving..." : continueWithSignatureTitle)
                        DARCiArrowCornerIcon()
                            .stroke(.white, style: StrokeStyle(lineWidth: 2, lineCap: .square, lineJoin: .miter))
                            .frame(width: 18, height: 18)
                    }
                    .font(DARCiFont.maisonNeue(.book, size: 16))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.78)
                    .frame(maxWidth: .infinity, minHeight: 54)
                    .background(viewModel.canContinueToSign ? Color.black : Color.black.opacity(0.42))
                }
                .buttonStyle(.plain)
                .disabled(viewModel.canContinueToSign == false)
            }
        }
        .padding(.horizontal, scaled(25, in: proxy))
        .padding(.top, 12)
        .padding(.bottom, 18)
        .background(Color.white)
    }

    private var continueWithSignatureTitle: String {
        viewModel.isDocumentNotarization ? "Sign document" : "Continue to sign"
    }

    private func reviewTopPadding(in proxy: GeometryProxy) -> CGFloat {
        scaled(proxy.size.height < 720 ? 20 : 30, in: proxy)
    }

    private func reviewSectionSpacing(in proxy: GeometryProxy) -> CGFloat {
        scaled(proxy.size.height < 720 ? 12 : 16, in: proxy)
    }

    private func statusMessage(_ text: String, tone: StatusTone) -> some View {
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

    private static func statusLabel(_ value: String) -> String {
        switch value {
        case "queued": return "Queued"
        case "rendering": return "Rendering"
        case "rendered": return "Rendered"
        case "blocked": return "Blocked"
        case "failed": return "Failed"
        case "canceled": return "Canceled"
        case "unsupported_format": return "Needs PDF rerender"
        case "download_unavailable": return "Preparing secure link"
        case "not_started": return "Waiting to start"
        default:
            return value
                .split(separator: "_")
                .map { $0.prefix(1).uppercased() + $0.dropFirst() }
                .joined(separator: " ")
        }
    }

    private static func statusColor(_ value: String) -> Color {
        switch value {
        case "failed", "blocked", "canceled":
            return Color(red: 0.68, green: 0.10, blue: 0.10)
        case "unsupported_format", "download_unavailable":
            return Color(red: 0.62, green: 0.36, blue: 0.02)
        case "rendered":
            return Color(red: 0.0, green: 0.42, blue: 0.22)
        default:
            return .black.opacity(0.62)
        }
    }
}

private enum StatusTone {
    case neutral
    case success
    case error

    var foreground: Color {
        switch self {
        case .neutral:
            .black.opacity(0.68)
        case .success:
            Color(red: 0.0, green: 0.42, blue: 0.22)
        case .error:
            Color(red: 0.68, green: 0.10, blue: 0.10)
        }
    }

    var background: Color {
        switch self {
        case .neutral:
            Color.black.opacity(0.04)
        case .success:
            Color(red: 0.92, green: 0.98, blue: 0.94)
        case .error:
            Color(red: 0.99, green: 0.94, blue: 0.94)
        }
    }

    var border: Color {
        switch self {
        case .neutral:
            Color.black.opacity(0.10)
        case .success:
            Color(red: 0.66, green: 0.88, blue: 0.72)
        case .error:
            Color(red: 0.88, green: 0.66, blue: 0.66)
        }
    }
}
