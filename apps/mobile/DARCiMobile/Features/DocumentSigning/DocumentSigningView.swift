import PDFKit
import PencilKit
import SwiftUI
import UniformTypeIdentifiers

struct DocumentSigningView: View {
    let session: AuthSession?
    let documentId: String
    let skipSignatureForNotarization: Bool

    @Environment(\.dismiss) private var dismiss
    @StateObject private var viewModel: DocumentSigningViewModel
    @State private var pageCount = 1
    @State private var currentPage = 1
    @State private var zoomInTrigger = 0
    @State private var zoomOutTrigger = 0
    @State private var pdfData: Data?
    @State private var previewErrorMessage: String?
    @State private var selectedOutputKey: String?
    @State private var selectedCaptureMode = SignatureCaptureMode.saved
    @State private var typedValue = ""
    @State private var typedKind = "name"
    @State private var drawImageDataUrl = ""
    @State private var drawResetToken = 0
    @State private var selectedSavedSignatureId: String?
    @State private var uploadData: Data?
    @State private var uploadFileName: String?
    @State private var uploadMimeType = "image/png"
    @State private var isSignatureFileImporterPresented = false
    @State private var isReplacingSignature = false
    @State private var isNotarySelectionPresented = false
    @State private var isNotarySelectionMinimized = false
    @State private var isSignatureCaptureMinimized = false
    @State private var isSignatureCaptureSuppressed = false
    @FocusState private var isTypedSignatureFocused: Bool
    @Environment(\.openURL) private var openURL

    init(
        session: AuthSession?,
        documentId: String,
        skipSignatureForNotarization: Bool = false,
        apiClient: DocumentIntakeAPIProviding = DocumentIntakeAPIClient()
    ) {
        self.session = session
        self.documentId = documentId
        self.skipSignatureForNotarization = skipSignatureForNotarization
        _viewModel = StateObject(wrappedValue: DocumentSigningViewModel(documentId: documentId, apiClient: apiClient))
    }

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .bottom) {
                VStack(spacing: 0) {
                    VStack(alignment: .leading, spacing: sectionSpacing(in: proxy)) {
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
                            signingStatusMessage(errorMessage, tone: .error)
                        }

                        if viewModel.shouldShowCaptureControls == false, viewModel.shouldShowCompletionActions == false, isReplacingSignature == false, viewModel.payload != nil {
                            DocumentPhaseStatusCard(
                                document: viewModel.payload?.document,
                                output: selectedOutput,
                                principalName: viewModel.primarySelfSignature?.partyName
                            )
                        }

                        if outputChoices.count > 1 {
                            outputSelector
                        }

                        signingPreview(proxy: proxy)
                            .layoutPriority(1)
                    }
                    .padding(.horizontal, scaled(25, in: proxy))
                    .padding(.top, topPadding(in: proxy))
                    .padding(.bottom, bottomReservedHeight(in: proxy))
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                }
                .background(Color.white.ignoresSafeArea())

                if shouldShowNotarySelectionSheet {
                    captureSheetBackground(proxy: proxy)
                    Group {
                        if isNotarySelectionMinimized {
                            minimizedNotarySelectionCard(proxy: proxy)
                        } else {
                            notarySelectionCard(proxy: proxy)
                        }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                    .ignoresSafeArea(.container, edges: .bottom)
                } else if shouldShowCaptureSheet {
                    captureSheetBackground(proxy: proxy)
                    Group {
                        if isSignatureCaptureMinimized {
                            minimizedSignatureCaptureCard(proxy: proxy)
                        } else {
                            signatureCaptureCard(proxy: proxy)
                        }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                    .ignoresSafeArea(.container, edges: .bottom)
                } else if viewModel.shouldShowCompletionActions {
                    signingCompletionActionBar(proxy: proxy)
                }
            }
        }
        .navigationBarBackButtonHidden(true)
        .toolbar(.hidden, for: .navigationBar)
        .task {
            viewModel.isSkippingSignatureForNotarization = skipSignatureForNotarization
            await viewModel.load(session: session)
            if selectedCaptureMode == .saved {
                await viewModel.fetchSavedSignatures(session: session)
            }
            if viewModel.shouldShowNotarySelection {
                isNotarySelectionPresented = true
                await viewModel.fetchAvailableNotaries(session: session)
            }
        }
        .task(id: selectedOutput?.downloadUrl) {
            await loadPreview()
        }
        .onChange(of: viewModel.selectedOutput?.outputKey) { _, outputKey in
            if selectedOutputKey == nil {
                selectedOutputKey = outputKey
            }
        }
        .onChange(of: selectedCaptureMode) { _, mode in
            handleCaptureModeChange(mode)
        }
        .onChange(of: shouldShowCaptureSheet) { _, shouldShow in
            if shouldShow == false {
                isSignatureCaptureMinimized = false
            }
        }
        .onChange(of: viewModel.shouldShowNotarySelection) { _, shouldShow in
            if shouldShow {
                isNotarySelectionPresented = true
                isNotarySelectionMinimized = false
                isSignatureCaptureSuppressed = false
                viewModel.isSkippingSignatureForNotarization = skipSignatureForNotarization
                Task { await viewModel.fetchAvailableNotaries(session: session) }
            } else {
                isNotarySelectionPresented = false
                isNotarySelectionMinimized = false
            }
        }
        .fileImporter(
            isPresented: $isSignatureFileImporterPresented,
            allowedContentTypes: [.png, .jpeg],
            allowsMultipleSelection: false
        ) { result in
            handleSignatureFileImport(result)
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

            Text(documentTitle)
                .font(DARCiFont.maisonNeue(.medium, size: 15))
                .lineLimit(1)
                .minimumScaleFactor(0.78)
                .foregroundStyle(.black)
        }
    }

    private var documentTitle: String {
        let dateLabel = compactDateLabel(from: viewModel.payload?.document?.createdAt) ?? "Signing"
        let outputLabel = documentOutputLabel(selectedOutput?.outputLabel)
            ?? documentTypeLabel(viewModel.payload?.document?.documentType)
        return "\(dateLabel) - \(outputLabel)"
    }

    private var selectedOutput: DocumentReviewOutput? {
        if let selectedOutputKey,
           let output = outputChoices.first(where: { $0.outputKey == selectedOutputKey }) {
            return output
        }

        return viewModel.selectedOutput ?? outputChoices.first
    }

    private var outputChoices: [DocumentReviewOutput] {
        let visibleOutputKeys = Set(viewModel.visibleSignatures.map(\.outputKey))
        let outputs = viewModel.signing?.outputs ?? []
        guard visibleOutputKeys.isEmpty == false else { return outputs }
        return outputs.filter { visibleOutputKeys.contains($0.outputKey) }
    }

    private var outputSelector: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(outputChoices) { output in
                    Button {
                        selectedOutputKey = output.outputKey
                    } label: {
                        Text(output.outputLabel)
                            .font(DARCiFont.maisonNeue(.book, size: 12))
                            .foregroundStyle(output.outputKey == selectedOutput?.outputKey ? .white : .black)
                            .lineLimit(1)
                            .padding(.horizontal, 14)
                            .frame(height: 36)
                            .background(output.outputKey == selectedOutput?.outputKey ? Color.black : Color.clear)
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

    private func signingPreview(proxy: GeometryProxy) -> some View {
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
                .disabled(pdfData == nil)

                Button {
                    zoomOutTrigger += 1
                } label: {
                    Image(systemName: "minus.magnifyingglass")
                        .font(.system(size: 14, weight: .regular))
                        .foregroundStyle(.black)
                        .frame(width: 24, height: 24)
                }
                .buttonStyle(.plain)
                .disabled(pdfData == nil)

                Spacer()

                Button {
                    if let selectedOutput, let url = URL(string: selectedOutput.downloadUrl) {
                        openURL(url)
                    }
                } label: {
                    Image(systemName: "arrow.down.to.line")
                        .font(.system(size: 16, weight: .regular))
                        .foregroundStyle(.black)
                        .frame(width: 24, height: 24)
                }
                .buttonStyle(.plain)
                .disabled(selectedOutput == nil)
            }
            .padding(.horizontal, 16)
            .frame(height: 58)

            ZStack {
                Color.white

                if let pdfData {
                    PDFKitDocumentPreview(
                        data: pdfData,
                        pageCount: $pageCount,
                        currentPage: $currentPage,
                        zoomInTrigger: zoomInTrigger,
                        zoomOutTrigger: zoomOutTrigger
                    )
                } else if viewModel.isLoading {
                    ProgressView()
                        .tint(.black)
                } else {
                    Text(previewErrorMessage ?? "Signing PDFs will appear here as soon as they are ready.")
                        .font(DARCiFont.maisonNeue(.book, size: 12))
                        .lineSpacing(5)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.black.opacity(0.62))
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

    private func signatureCaptureCard(proxy: GeometryProxy) -> some View {
        VStack(alignment: .leading, spacing: scaled(20, in: proxy)) {
            HStack {
                Text("Signature capture")
                    .font(DARCiFont.maisonNeue(.medium, size: 10))
                    .foregroundStyle(Color(red: 0.49, green: 0.49, blue: 0.49))

                Spacer()

                HStack(spacing: 10) {
                    Button {
                        isSignatureCaptureMinimized = true
                    } label: {
                        Image(systemName: "chevron.down")
                            .font(.system(size: 17, weight: .regular))
                            .foregroundStyle(Color(red: 0.49, green: 0.49, blue: 0.49))
                            .frame(width: 26, height: 26)
                    }
                    .buttonStyle(.plain)

                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .regular))
                            .foregroundStyle(Color(red: 0.49, green: 0.49, blue: 0.49))
                            .frame(width: 26, height: 26)
                    }
                    .buttonStyle(.plain)
                }
            }

            captureModeSelector

            captureModeContent(proxy: proxy)
                .frame(maxWidth: .infinity)
                .frame(height: captureInputHeight(in: proxy))

            Button {
                Task {
                    await performPrimaryCaptureAction()
                }
            } label: {
                HStack(spacing: 16) {
                    Spacer()
                    Text(primaryActionTitle)
                    DARCiArrowCornerIcon()
                        .stroke(.white, style: StrokeStyle(lineWidth: 2, lineCap: .square, lineJoin: .miter))
                        .frame(width: 24, height: 24)
                }
                .font(DARCiFont.maisonNeue(.book, size: 22))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, minHeight: 54)
                .padding(.horizontal, 20)
                .background(Color.black)
            }
            .buttonStyle(.plain)
            .disabled(viewModel.activeSignature == nil || viewModel.isSavingCapture || viewModel.isConfirming)
        }
        .padding(.horizontal, scaled(32, in: proxy))
        .padding(.top, scaled(30, in: proxy))
        .padding(.bottom, scaled(24, in: proxy) + proxy.safeAreaInsets.bottom)
        .frame(maxWidth: .infinity)
        .frame(height: captureCardHeight(in: proxy) + proxy.safeAreaInsets.bottom, alignment: .top)
        .background(Color(red: 0.90, green: 0.90, blue: 0.90))
        .clipShape(.rect(topLeadingRadius: 36, topTrailingRadius: 36))
        .shadow(color: .black.opacity(0.06), radius: 16, y: -4)
    }

    private func minimizedSignatureCaptureCard(proxy: GeometryProxy) -> some View {
        Button {
            isSignatureCaptureMinimized = false
        } label: {
            HStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Signature capture")
                        .font(DARCiFont.maisonNeue(.demi, size: 14))
                        .foregroundStyle(.black)

                    Text("Tap to continue signing")
                        .font(DARCiFont.maisonNeue(.book, size: 11))
                        .foregroundStyle(.black.opacity(0.56))
                }

                Spacer(minLength: 12)

                Image(systemName: "chevron.up")
                    .font(.system(size: 17, weight: .regular))
                    .foregroundStyle(.black)
                    .frame(width: 28, height: 28)
            }
            .padding(.horizontal, scaled(24, in: proxy))
            .padding(.top, scaled(18, in: proxy))
            .padding(.bottom, scaled(18, in: proxy) + proxy.safeAreaInsets.bottom)
            .frame(maxWidth: .infinity)
            .background(Color(red: 0.90, green: 0.90, blue: 0.90))
            .clipShape(.rect(topLeadingRadius: 28, topTrailingRadius: 28))
            .shadow(color: .black.opacity(0.06), radius: 16, y: -4)
        }
        .buttonStyle(.plain)
    }

    private var shouldShowCaptureSheet: Bool {
        (viewModel.shouldShowCaptureControls && isSignatureCaptureSuppressed == false)
            || (isReplacingSignature && viewModel.isReadyForSignatureMutations)
    }

    private var shouldShowNotarySelectionSheet: Bool {
        viewModel.shouldShowNotarySelection && isNotarySelectionPresented
    }

    private func closeNotarySelection(suppressSignatureCapture: Bool) {
        isNotarySelectionPresented = false
        isNotarySelectionMinimized = false
        isSignatureCaptureSuppressed = suppressSignatureCapture
    }

    private func notarySelectionCard(proxy: GeometryProxy) -> some View {
        VStack(alignment: .leading, spacing: scaled(22, in: proxy)) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Choose a notary")
                        .font(DARCiFont.maisonNeue(.demi, size: 14))
                        .foregroundStyle(.black)

                    Text("Select a notary in the document jurisdiction to review the confirmed document.")
                        .font(DARCiFont.maisonNeue(.book, size: 12))
                        .lineSpacing(4)
                        .foregroundStyle(.black)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 16)

                HStack(spacing: 10) {
                    Button {
                        isNotarySelectionMinimized = true
                    } label: {
                        Image(systemName: "chevron.down")
                            .font(.system(size: 17, weight: .regular))
                            .foregroundStyle(Color(red: 0.49, green: 0.49, blue: 0.49))
                            .frame(width: 26, height: 26)
                    }
                    .buttonStyle(.plain)

                    Button {
                        closeNotarySelection(suppressSignatureCapture: true)
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .regular))
                            .foregroundStyle(Color(red: 0.49, green: 0.49, blue: 0.49))
                            .frame(width: 26, height: 26)
                    }
                    .buttonStyle(.plain)
                }
            }

            notarySelectionContent(proxy: proxy)
                .frame(height: notaryOptionsHeight(in: proxy), alignment: .top)

            HStack(spacing: scaled(10, in: proxy)) {
                Button {
                    closeNotarySelection(suppressSignatureCapture: true)
                } label: {
                    Text("Save draft")
                        .font(DARCiFont.maisonNeue(.book, size: 15))
                        .foregroundStyle(.black)
                        .frame(maxWidth: .infinity, minHeight: 54)
                        .background(Color(red: 0.67, green: 0.67, blue: 0.67).opacity(0.61))
                }
                .buttonStyle(.plain)

                Button {
                    Task {
                        if await viewModel.submitToSelectedNotary(session: session) {
                            closeNotarySelection(suppressSignatureCapture: false)
                        }
                    }
                } label: {
                    Text(viewModel.isSubmittingNotarization ? notarySubmitBusyTitle : notarySubmitTitle)
                        .font(DARCiFont.maisonNeue(.book, size: 15))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                        .minimumScaleFactor(0.72)
                        .frame(maxWidth: .infinity, minHeight: 54)
                        .background(viewModel.canSubmitSelectedNotary ? Color.black : Color.black.opacity(0.42))
                }
                .buttonStyle(.plain)
                .disabled(viewModel.canSubmitSelectedNotary == false)
            }
        }
        .padding(.horizontal, scaled(32, in: proxy))
        .padding(.top, scaled(36, in: proxy))
        .padding(.bottom, scaled(22, in: proxy) + proxy.safeAreaInsets.bottom)
        .frame(maxWidth: .infinity)
        .frame(height: notarySelectionCardHeight(in: proxy) + proxy.safeAreaInsets.bottom, alignment: .top)
        .background(Color(red: 0.90, green: 0.90, blue: 0.90))
        .clipShape(.rect(topLeadingRadius: 36, topTrailingRadius: 36))
        .shadow(color: .black.opacity(0.06), radius: 16, y: -4)
    }

    private func minimizedNotarySelectionCard(proxy: GeometryProxy) -> some View {
        Button {
            isNotarySelectionMinimized = false
        } label: {
            HStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Choose a notary")
                        .font(DARCiFont.maisonNeue(.demi, size: 14))
                        .foregroundStyle(.black)

                    Text("Tap to continue notary selection")
                        .font(DARCiFont.maisonNeue(.book, size: 11))
                        .foregroundStyle(.black.opacity(0.56))
                }

                Spacer(minLength: 12)

                Image(systemName: "chevron.up")
                    .font(.system(size: 17, weight: .regular))
                    .foregroundStyle(.black)
                    .frame(width: 28, height: 28)
            }
            .padding(.horizontal, scaled(24, in: proxy))
            .padding(.top, scaled(18, in: proxy))
            .padding(.bottom, scaled(18, in: proxy) + proxy.safeAreaInsets.bottom)
            .frame(maxWidth: .infinity)
            .background(Color(red: 0.90, green: 0.90, blue: 0.90))
            .clipShape(.rect(topLeadingRadius: 28, topTrailingRadius: 28))
            .shadow(color: .black.opacity(0.06), radius: 16, y: -4)
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func notarySelectionContent(proxy: GeometryProxy) -> some View {
        if viewModel.activeNotarizationRequestId != nil {
            notaryStatusMessage("This document already has a notarization request in progress.")
        } else if viewModel.isLoadingAvailableNotaries && viewModel.availableNotariesPayload == nil {
            notaryStatusMessage("Loading available notaries...")
        } else if let message = viewModel.availableNotaryErrorMessage {
            VStack(alignment: .leading, spacing: 12) {
                notaryStatusMessage(message)

                Button {
                    Task { await viewModel.fetchAvailableNotaries(session: session) }
                } label: {
                    Text("Retry")
                        .font(DARCiFont.maisonNeue(.book, size: 13))
                        .foregroundStyle(.black)
                        .frame(width: 96, height: 38)
                        .background(.white.opacity(0.78))
                }
                .buttonStyle(.plain)
            }
        } else if viewModel.availableNotaries.isEmpty {
            notaryStatusMessage("No active notaries are available for this document jurisdiction yet.")
        } else {
            ScrollView(showsIndicators: false) {
                VStack(spacing: 10) {
                    ForEach(viewModel.availableNotaries) { notary in
                        Button {
                            viewModel.selectedNotaryUserId = notary.userId
                        } label: {
                            HStack(spacing: 12) {
                                VStack(alignment: .leading, spacing: 6) {
                                    Text(notary.displayName)
                                        .font(DARCiFont.maisonNeue(.demi, size: 15))
                                        .foregroundStyle(.black)
                                        .lineLimit(1)

                                    Text(notaryServiceAreaLabel(notary))
                                        .font(DARCiFont.maisonNeue(.book, size: 13))
                                        .foregroundStyle(Color(red: 0.70, green: 0.70, blue: 0.70))
                                        .lineLimit(1)
                                }

                                Spacer(minLength: 12)

                                if viewModel.selectedNotaryUserId == notary.userId {
                                    Image(systemName: "checkmark.circle.fill")
                                        .font(.system(size: 17, weight: .regular))
                                        .foregroundStyle(.black)
                                }
                            }
                            .padding(.horizontal, 20)
                            .frame(maxWidth: .infinity, minHeight: 58, alignment: .leading)
                            .background(.white)
                            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        }
    }

    private func notaryStatusMessage(_ text: String) -> some View {
        Text(text)
            .font(DARCiFont.maisonNeue(.book, size: 13))
            .lineSpacing(5)
            .foregroundStyle(.black.opacity(0.62))
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(18)
            .background(.white.opacity(0.72))
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private func signingCompletionActionBar(proxy: GeometryProxy) -> some View {
        HStack(spacing: scaled(10, in: proxy)) {
            Button {
                isReplacingSignature = true
            } label: {
                HStack(spacing: 10) {
                    Text("Clear signature")
                    Image(systemName: "xmark")
                        .font(.system(size: 18, weight: .regular))
                }
                .font(DARCiFont.maisonNeue(.book, size: 16))
                .foregroundStyle(.black)
                .frame(maxWidth: .infinity, minHeight: 54)
                .background(Color(red: 0.67, green: 0.67, blue: 0.67).opacity(0.61))
            }
            .buttonStyle(.plain)

            Button {
                Task { _ = await viewModel.confirmSigning(session: session) }
            } label: {
                HStack(spacing: 12) {
                    Text(viewModel.isConfirming ? "Completing..." : "Complete signing")
                    DARCiArrowCornerIcon()
                        .stroke(.black, style: StrokeStyle(lineWidth: 2, lineCap: .square, lineJoin: .miter))
                        .frame(width: 18, height: 18)
                }
                .font(DARCiFont.maisonNeue(.book, size: 16))
                .foregroundStyle(.black)
                .frame(maxWidth: .infinity, minHeight: 54)
                .background(DARCiTheme.onboardingGreen)
            }
            .buttonStyle(.plain)
            .disabled(viewModel.canConfirm == false)
        }
        .padding(.horizontal, scaled(25, in: proxy))
        .padding(.top, 12)
        .padding(.bottom, 18)
        .background(Color.white)
    }

    private func captureSheetBackground(proxy: GeometryProxy) -> some View {
        VStack(spacing: 0) {
            Spacer()
            Color(red: 0.90, green: 0.90, blue: 0.90)
                .frame(height: max(proxy.safeAreaInsets.bottom, 34))
                .ignoresSafeArea(.container, edges: .bottom)
        }
    }

    private var captureModeSelector: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 5) {
                ForEach(SignatureCaptureMode.allCases) { mode in
                    Button {
                        selectedCaptureMode = mode
                    } label: {
                        Text(mode.title)
                            .font(DARCiFont.maisonNeue(.book, size: 11))
                            .foregroundStyle(selectedCaptureMode == mode ? .white : Color(red: 0.19, green: 0.19, blue: 0.19))
                            .lineLimit(1)
                            .minimumScaleFactor(0.76)
                            .padding(.horizontal, mode == .saved ? 10 : 12)
                            .frame(height: 24)
                            .background(selectedCaptureMode == mode ? Color.black : Color.clear)
                            .clipShape(Capsule())
                            .overlay {
                                Capsule()
                                    .stroke(selectedCaptureMode == mode ? Color.black : Color(red: 0.84, green: 0.84, blue: 0.84), lineWidth: 0.5)
                            }
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    @ViewBuilder
    private func captureModeContent(proxy: GeometryProxy) -> some View {
        switch selectedCaptureMode {
        case .upload:
            Button {
                isSignatureFileImporterPresented = true
            } label: {
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .fill(Color(red: 0.85, green: 0.85, blue: 0.85))
                    .overlay {
                        RoundedRectangle(cornerRadius: 24, style: .continuous)
                            .stroke(Color(red: 0.75, green: 0.75, blue: 0.75), lineWidth: 0.5)
                    }
                    .overlay {
                        VStack(spacing: 8) {
                            Text(uploadFileName ?? "Tap to upload signature")
                                .font(DARCiFont.maisonNeue(.book, size: 15))
                                .foregroundStyle(Color(red: 0.49, green: 0.49, blue: 0.49))

                            if uploadFileName != nil {
                                Text("PNG/JPG selected")
                                    .font(DARCiFont.maisonNeue(.book, size: 11))
                                    .foregroundStyle(.black.opacity(0.52))
                            }
                        }
                    }
            }
            .buttonStyle(.plain)
        case .type:
            VStack(alignment: .leading, spacing: 14) {
                TextField("Type signature", text: $typedValue)
                    .font(DARCiFont.maisonNeue(.book, size: 24))
                    .foregroundStyle(.black)
                    .textInputAutocapitalization(.words)
                    .focused($isTypedSignatureFocused)
                    .padding(.horizontal, 18)
                    .frame(height: 64)
                    .background(Color.white.opacity(0.78))
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

                Picker("Typed kind", selection: $typedKind) {
                    Text("Name").tag("name")
                    Text("Initials").tag("initials")
                }
                .pickerStyle(.segmented)
            }
            .frame(maxHeight: .infinity, alignment: .center)
        case .draw:
            ZStack(alignment: .topTrailing) {
                DrawingSignaturePad(imageDataUrl: $drawImageDataUrl, resetToken: drawResetToken)
                    .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: 24, style: .continuous)
                            .stroke(Color(red: 0.75, green: 0.75, blue: 0.75), lineWidth: 0.5)
                    }

                Button {
                    drawResetToken += 1
                } label: {
                    Image(systemName: "arrow.counterclockwise")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(.black)
                        .frame(width: 34, height: 34)
                        .background(Color.white.opacity(0.86))
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
                .padding(12)
            }
        case .saved:
            savedSignaturesList
        }
    }

    private var savedSignaturesList: some View {
        Group {
            if viewModel.savedSignatures.isEmpty {
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .fill(Color(red: 0.85, green: 0.85, blue: 0.85))
                    .overlay {
                        Text("No saved signatures yet")
                            .font(DARCiFont.maisonNeue(.book, size: 15))
                            .foregroundStyle(Color(red: 0.49, green: 0.49, blue: 0.49))
                    }
            } else {
                ScrollView(showsIndicators: false) {
                    VStack(spacing: 10) {
                        ForEach(viewModel.savedSignatures) { signature in
                            Button {
                                selectedSavedSignatureId = signature.id
                            } label: {
                                HStack(spacing: 12) {
                                    savedSignaturePreview(signature)

                                    Spacer()

                                    Image(systemName: selectedSavedSignatureId == signature.id ? "checkmark.circle.fill" : "circle")
                                        .font(.system(size: 18, weight: .regular))
                                        .foregroundStyle(.black)
                                }
                                .padding(.horizontal, 16)
                                .frame(height: 74)
                                .background(Color.white.opacity(selectedSavedSignatureId == signature.id ? 0.95 : 0.62))
                                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func savedSignaturePreview(_ signature: SavedDocumentSignature) -> some View {
        if let typedValue = signature.typedValue, typedValue.isEmpty == false {
            VStack(alignment: .leading, spacing: 4) {
                Text(typedValue)
                    .font(DARCiFont.maisonNeue(.book, size: 24))
                    .foregroundStyle(.black)
                    .lineLimit(1)
                    .minimumScaleFactor(0.72)

                Text(signature.typedKind == "initials" ? "Typed initials" : "Typed name")
                    .font(DARCiFont.maisonNeue(.book, size: 11))
                    .foregroundStyle(.black.opacity(0.52))
            }
        } else if let urlString = signature.assetDownloadUrl, let url = URL(string: urlString) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image
                        .resizable()
                        .scaledToFit()
                case .failure:
                    savedSignatureFallback(signature)
                case .empty:
                    ProgressView()
                        .tint(.black)
                @unknown default:
                    savedSignatureFallback(signature)
                }
            }
            .frame(width: 180, height: 52, alignment: .leading)
        } else {
            savedSignatureFallback(signature)
        }
    }

    private func savedSignatureFallback(_ signature: SavedDocumentSignature) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(signature.captureMethod == "draw" ? "Drawn signature" : "Uploaded signature")
                .font(DARCiFont.maisonNeue(.book, size: 16))
                .foregroundStyle(.black)

            Text(signature.captureMethod.capitalized)
                .font(DARCiFont.maisonNeue(.book, size: 11))
                .foregroundStyle(.black.opacity(0.52))
        }
    }

    private var primaryActionTitle: String {
        if viewModel.isSavingCapture { return "Adding..." }
        if viewModel.isConfirming { return "Confirming..." }
        return "Add signature"
    }

    private var notarySubmitTitle: String {
        viewModel.isSkippingSignatureForNotarization ? "Continue" : "Send to selected notary"
    }

    private var notarySubmitBusyTitle: String {
        viewModel.isSkippingSignatureForNotarization ? "Continuing..." : "Sending..."
    }

    private func performPrimaryCaptureAction() async {
        guard let activeSignature = viewModel.activeSignature else { return }
        let didCapture: Bool

        switch selectedCaptureMode {
        case .upload:
            guard let uploadData, let uploadFileName else {
                isSignatureFileImporterPresented = true
                return
            }
            didCapture = await viewModel.uploadSignatureAssetForRequiredDocuments(
                from: activeSignature,
                fileName: uploadFileName,
                data: uploadData,
                mimeType: uploadMimeType,
                session: session
            )
        case .type:
            didCapture = await viewModel.captureTypedSignatureForRequiredDocuments(
                from: activeSignature,
                typedValue: typedValue,
                typedKind: typedKind,
                session: session
            )
        case .draw:
            didCapture = await viewModel.captureDrawnSignatureForRequiredDocuments(
                from: activeSignature,
                imageDataUrl: drawImageDataUrl,
                session: session
            )
        case .saved:
            guard let selectedSavedSignatureId else {
                await viewModel.fetchSavedSignatures(session: session)
                return
            }
            didCapture = await viewModel.applySavedSignatureForRequiredDocuments(
                from: activeSignature,
                savedSignatureId: selectedSavedSignatureId,
                session: session
            )
        }

        if didCapture {
            isReplacingSignature = false
            await loadPreview()
        }
    }

    private func handleCaptureModeChange(_ mode: SignatureCaptureMode) {
        switch mode {
        case .upload:
            isTypedSignatureFocused = false
            isSignatureFileImporterPresented = true
        case .type:
            isTypedSignatureFocused = true
        case .draw:
            isTypedSignatureFocused = false
        case .saved:
            isTypedSignatureFocused = false
            Task { await viewModel.fetchSavedSignatures(session: session) }
        }
    }

    private func handleSignatureFileImport(_ result: Result<[URL], Error>) {
        do {
            guard let url = try result.get().first else { return }
            let didAccess = url.startAccessingSecurityScopedResource()
            defer {
                if didAccess { url.stopAccessingSecurityScopedResource() }
            }

            uploadData = try Data(contentsOf: url)
            uploadFileName = url.lastPathComponent
            uploadMimeType = url.pathExtension.lowercased() == "jpg" || url.pathExtension.lowercased() == "jpeg" ? "image/jpeg" : "image/png"
        } catch {
            uploadData = nil
            uploadFileName = nil
        }
    }

    private func loadPreview() async {
          guard let downloadUrl = selectedOutput?.downloadUrl,
              let url = URL(string: downloadUrl) else {
            pdfData = nil
            return
        }

        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            pdfData = data
            previewErrorMessage = nil
        } catch {
            pdfData = nil
            previewErrorMessage = "Failed to load signing PDF."
        }
    }

    private func topPadding(in proxy: GeometryProxy) -> CGFloat {
        scaled(proxy.size.height < 720 ? 20 : 30, in: proxy)
    }

    private func sectionSpacing(in proxy: GeometryProxy) -> CGFloat {
        scaled(proxy.size.height < 720 ? 12 : 16, in: proxy)
    }

    private func captureCardHeight(in proxy: GeometryProxy) -> CGFloat {
        min(max(proxy.size.height * 0.52, 390), 500)
    }

    private func bottomReservedHeight(in proxy: GeometryProxy) -> CGFloat {
        if shouldShowNotarySelectionSheet {
            if isNotarySelectionMinimized {
                return minimizedNotarySelectionCardHeight(in: proxy) - scaled(18, in: proxy)
            }

            return notarySelectionCardHeight(in: proxy) - scaled(28, in: proxy)
        }

        if shouldShowCaptureSheet {
            if isSignatureCaptureMinimized {
                return minimizedSignatureCaptureCardHeight(in: proxy) - scaled(18, in: proxy)
            }

            return captureCardHeight(in: proxy) - scaled(28, in: proxy)
        }

        if viewModel.shouldShowCompletionActions {
            return scaled(90, in: proxy)
        }

        return scaled(12, in: proxy)
    }

    private func notarySelectionCardHeight(in proxy: GeometryProxy) -> CGFloat {
        min(max(proxy.size.height * 0.66, 520), 640)
    }

    private func minimizedNotarySelectionCardHeight(in proxy: GeometryProxy) -> CGFloat {
        scaled(78, in: proxy) + proxy.safeAreaInsets.bottom
    }

    private func minimizedSignatureCaptureCardHeight(in proxy: GeometryProxy) -> CGFloat {
        scaled(78, in: proxy) + proxy.safeAreaInsets.bottom
    }

    private func notaryOptionsHeight(in proxy: GeometryProxy) -> CGFloat {
        min(max(proxy.size.height * 0.34, 286), 350)
    }

    private func captureInputHeight(in proxy: GeometryProxy) -> CGFloat {
        min(max(proxy.size.height * 0.26, 210), 320)
    }

    private func scaled(_ value: CGFloat, in proxy: GeometryProxy) -> CGFloat {
        let widthScale = min(max(proxy.size.width / 440, 0.86), 1.08)
        return value * widthScale
    }

    private func compactDateLabel(from value: String?) -> String? {
        guard let value, let date = Self.iso8601Formatter.date(from: value) else { return nil }
        let formatter = DateFormatter()
        formatter.dateFormat = "M/d/yyyy"
        return formatter.string(from: date)
    }

    private func documentTypeLabel(_ value: String?) -> String {
        guard let value, value.isEmpty == false else { return "Document" }
        if normalizedDocumentLabelKey(value) == "notarize_document" || normalizedDocumentLabelKey(value) == "uploaded_document" {
            return "Document Notarization"
        }

        return value
            .split(separator: "_")
            .map { $0.prefix(1).uppercased() + $0.dropFirst() }
            .joined(separator: " ")
    }

    private func documentOutputLabel(_ value: String?) -> String? {
        guard let value, value.isEmpty == false else { return nil }
        let normalizedKey = normalizedDocumentLabelKey(value)
        if normalizedKey == "notarize_document" || normalizedKey == "uploaded_document" {
            return "Document Notarization"
        }

        if normalizedKey.contains("_") {
            return documentTypeLabel(normalizedKey)
        }

        return value
    }

    private func normalizedDocumentLabelKey(_ value: String) -> String {
        value
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .replacingOccurrences(of: " ", with: "_")
            .replacingOccurrences(of: "-", with: "_")
    }

    private func notaryServiceAreaLabel(_ notary: AvailableNotary) -> String {
        if let serviceAreaName = notary.serviceAreaName?.trimmingCharacters(in: .whitespacesAndNewlines), serviceAreaName.isEmpty == false {
            return serviceAreaName
        }

        if let serviceAreaKind = notary.serviceAreaKind?.trimmingCharacters(in: .whitespacesAndNewlines), serviceAreaKind.isEmpty == false {
            return documentTypeLabel(serviceAreaKind)
        }

        return notary.jurisdiction.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
    }

    private static let iso8601Formatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}

private enum SignatureCaptureMode: CaseIterable, Identifiable {
    case saved
    case upload
    case type
    case draw

    var id: String { title }

    var title: String {
        switch self {
        case .saved: "My saved signatures"
        case .upload: "Upload"
        case .type: "Type"
        case .draw: "Draw"
        }
    }
}

private enum SigningStatusTone {
    case success
    case error

    var foreground: Color {
        switch self {
        case .success: Color(red: 0.0, green: 0.42, blue: 0.22)
        case .error: Color(red: 0.68, green: 0.10, blue: 0.10)
        }
    }

    var background: Color {
        switch self {
        case .success: Color(red: 0.92, green: 0.98, blue: 0.94)
        case .error: Color(red: 0.99, green: 0.94, blue: 0.94)
        }
    }

    var border: Color {
        switch self {
        case .success: Color(red: 0.66, green: 0.88, blue: 0.72)
        case .error: Color(red: 0.88, green: 0.66, blue: 0.66)
        }
    }
}

private func signingStatusMessage(_ text: String, tone: SigningStatusTone) -> some View {
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

private struct DrawingSignaturePad: UIViewRepresentable {
    @Binding var imageDataUrl: String
    let resetToken: Int

    func makeUIView(context: Context) -> PKCanvasView {
        let view = PKCanvasView()
        view.backgroundColor = Color(red: 0.85, green: 0.85, blue: 0.85).uiColor
        view.drawingPolicy = .anyInput
        view.tool = PKInkingTool(.pen, color: .black, width: 3)
        view.delegate = context.coordinator
        return view
    }

    func updateUIView(_ uiView: PKCanvasView, context: Context) {
        guard context.coordinator.resetToken != resetToken else { return }
        context.coordinator.resetToken = resetToken
        uiView.drawing = PKDrawing()
        imageDataUrl = ""
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(imageDataUrl: $imageDataUrl)
    }

    final class Coordinator: NSObject, PKCanvasViewDelegate {
        @Binding private var imageDataUrl: String
        var resetToken = 0

        init(imageDataUrl: Binding<String>) {
            _imageDataUrl = imageDataUrl
        }

        func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
            let drawingBounds = canvasView.drawing.bounds
            guard drawingBounds.isEmpty == false else {
                imageDataUrl = ""
                return
            }

            let cropPadding: CGFloat = 14
            let paddedBounds = drawingBounds.insetBy(dx: -cropPadding, dy: -cropPadding)
            let cropBounds = paddedBounds.intersection(canvasView.bounds)
            let imageBounds = cropBounds.isNull || cropBounds.isEmpty ? drawingBounds : cropBounds
            let image = canvasView.drawing.image(from: imageBounds, scale: UIScreen.main.scale)
            guard let data = image.pngData() else { return }
            imageDataUrl = "data:image/png;base64,\(data.base64EncodedString())"
        }
    }
}

private extension Color {
    var uiColor: UIColor {
        UIColor(self)
    }
}