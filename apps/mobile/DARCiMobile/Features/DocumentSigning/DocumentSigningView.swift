import PDFKit
import PencilKit
import SwiftUI
import UniformTypeIdentifiers

struct DocumentSigningView: View {
    let session: AuthSession?
    let documentId: String

    @Environment(\.dismiss) private var dismiss
    @StateObject private var viewModel: DocumentSigningViewModel
    @State private var pageCount = 1
    @State private var pdfData: Data?
    @State private var previewErrorMessage: String?
    @State private var selectedOutputKey: String?
    @State private var selectedCaptureMode = SignatureCaptureMode.upload
    @State private var typedValue = ""
    @State private var typedKind = "name"
    @State private var drawImageDataUrl = ""
    @State private var selectedSavedSignatureId: String?
    @State private var uploadData: Data?
    @State private var uploadFileName: String?
    @State private var uploadMimeType = "image/png"
    @State private var isSignatureFileImporterPresented = false
    @FocusState private var isTypedSignatureFocused: Bool
    @Environment(\.openURL) private var openURL

    init(
        session: AuthSession?,
        documentId: String,
        apiClient: DocumentIntakeAPIProviding = DocumentIntakeAPIClient()
    ) {
        self.session = session
        self.documentId = documentId
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

                        if let inviteMessage = viewModel.inviteDispatchSummary?.message {
                            signingStatusMessage(inviteMessage, tone: .success)
                        }

                        if outputChoices.count > 1 {
                            outputSelector
                        }

                        signingPreview(proxy: proxy)
                            .layoutPriority(1)
                    }
                    .padding(.horizontal, scaled(25, in: proxy))
                    .padding(.top, topPadding(in: proxy))
                    .padding(.bottom, captureCardHeight(in: proxy) - scaled(28, in: proxy))
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                }
                .background(Color.white.ignoresSafeArea())

                signatureCaptureCard(proxy: proxy)
            }
        }
        .navigationBarBackButtonHidden(true)
        .toolbar(.hidden, for: .navigationBar)
        .task {
            await viewModel.load(session: session)
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
        let outputLabel = selectedOutput?.outputLabel ?? documentTypeLabel(viewModel.payload?.document?.documentType)
        return "\(dateLabel) - \(outputLabel.uppercased())"
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
                Text("1/\(max(pageCount, 1))")
                    .font(DARCiFont.maisonNeue(.book, size: 12))
                    .foregroundStyle(.black)
                    .frame(minWidth: 44, alignment: .leading)

                Image(systemName: "plus.magnifyingglass")
                    .font(.system(size: 16, weight: .regular))
                    .foregroundStyle(.black)

                Image(systemName: "minus.magnifyingglass")
                    .font(.system(size: 16, weight: .regular))
                    .foregroundStyle(.black)

                Spacer()

                Button {
                    if let selectedOutput, let url = URL(string: selectedOutput.downloadUrl) {
                        openURL(url)
                    }
                } label: {
                    Image(systemName: "arrow.down.to.line")
                        .font(.system(size: 18, weight: .regular))
                        .foregroundStyle(.black)
                        .frame(width: 28, height: 28)
                }
                .buttonStyle(.plain)
                .disabled(selectedOutput == nil)

                Image(systemName: "ellipsis")
                    .rotationEffect(.degrees(90))
                    .font(.system(size: 18, weight: .regular))
                    .foregroundStyle(.black)
            }
            .padding(.horizontal, 16)
            .frame(height: 58)

            ZStack {
                Color.white

                if let pdfData {
                    SigningPDFKitPreview(data: pdfData, pageCount: $pageCount)
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

                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 24, weight: .regular))
                        .foregroundStyle(Color(red: 0.49, green: 0.49, blue: 0.49))
                        .frame(width: 32, height: 32)
                }
                .buttonStyle(.plain)
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
        .padding(.bottom, scaled(24, in: proxy))
        .frame(maxWidth: .infinity)
        .frame(height: captureCardHeight(in: proxy), alignment: .top)
        .background(Color(red: 0.90, green: 0.90, blue: 0.90))
        .clipShape(.rect(topLeadingRadius: 36, topTrailingRadius: 36))
        .shadow(color: .black.opacity(0.06), radius: 16, y: -4)
    }

    private var captureModeSelector: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(SignatureCaptureMode.allCases) { mode in
                    Button {
                        selectedCaptureMode = mode
                    } label: {
                        Text(mode.title)
                            .font(DARCiFont.maisonNeue(.book, size: 13))
                            .foregroundStyle(selectedCaptureMode == mode ? .white : Color(red: 0.19, green: 0.19, blue: 0.19))
                            .padding(.horizontal, mode == .saved ? 14 : 18)
                            .frame(height: 26)
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
            DrawingSignaturePad(imageDataUrl: $drawImageDataUrl)
                .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 24, style: .continuous)
                        .stroke(Color(red: 0.75, green: 0.75, blue: 0.75), lineWidth: 0.5)
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
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(savedSignatureTitle(signature))
                                            .font(DARCiFont.maisonNeue(.book, size: 14))
                                            .foregroundStyle(.black)
                                            .lineLimit(1)

                                        Text(signature.captureMethod.capitalized)
                                            .font(DARCiFont.maisonNeue(.book, size: 11))
                                            .foregroundStyle(.black.opacity(0.52))
                                    }

                                    Spacer()

                                    Image(systemName: selectedSavedSignatureId == signature.id ? "checkmark.circle.fill" : "circle")
                                        .font(.system(size: 18, weight: .regular))
                                        .foregroundStyle(.black)
                                }
                                .padding(.horizontal, 16)
                                .frame(height: 58)
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

    private var primaryActionTitle: String {
        if viewModel.isSavingCapture { return "Adding..." }
        if viewModel.isConfirming { return "Confirming..." }
        if viewModel.canConfirm { return "Confirm signatures" }
        return "Add signature"
    }

    private func performPrimaryCaptureAction() async {
        if viewModel.canConfirm {
            _ = await viewModel.confirmSigning(session: session)
            return
        }

        guard let activeSignature = viewModel.activeSignature else { return }

        switch selectedCaptureMode {
        case .upload:
            guard let uploadData, let uploadFileName else {
                isSignatureFileImporterPresented = true
                return
            }
            _ = await viewModel.uploadSignatureAssetForRequiredDocuments(
                from: activeSignature,
                fileName: uploadFileName,
                data: uploadData,
                mimeType: uploadMimeType,
                session: session
            )
        case .type:
            _ = await viewModel.captureTypedSignatureForRequiredDocuments(
                from: activeSignature,
                typedValue: typedValue,
                typedKind: typedKind,
                session: session
            )
        case .draw:
            _ = await viewModel.captureDrawnSignatureForRequiredDocuments(
                from: activeSignature,
                imageDataUrl: drawImageDataUrl,
                session: session
            )
        case .saved:
            guard let selectedSavedSignatureId else {
                await viewModel.fetchSavedSignatures(session: session)
                return
            }
            _ = await viewModel.applySavedSignatureForRequiredDocuments(
                from: activeSignature,
                savedSignatureId: selectedSavedSignatureId,
                session: session
            )
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

    private func savedSignatureTitle(_ signature: SavedDocumentSignature) -> String {
        if let typedValue = signature.typedValue, typedValue.isEmpty == false {
            return typedValue
        }

        return signature.capturedAt.flatMap { compactDateLabel(from: $0) } ?? "Saved signature"
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
        return value
            .split(separator: "_")
            .map { $0.prefix(1).uppercased() + $0.dropFirst() }
            .joined(separator: " ")
    }

    private static let iso8601Formatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}

private enum SignatureCaptureMode: CaseIterable, Identifiable {
    case upload
    case type
    case draw
    case saved

    var id: String { title }

    var title: String {
        switch self {
        case .upload: "Upload"
        case .type: "Type"
        case .draw: "Draw"
        case .saved: "My saved signatures"
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

private struct SigningPDFKitPreview: UIViewRepresentable {
    let data: Data
    @Binding var pageCount: Int

    func makeUIView(context: Context) -> PDFView {
        let view = PDFView()
        view.autoScales = true
        view.displayMode = .singlePageContinuous
        view.displayDirection = .vertical
        view.backgroundColor = .white
        return view
    }

    func updateUIView(_ uiView: PDFView, context: Context) {
        guard context.coordinator.data != data else { return }
        context.coordinator.data = data
        let document = PDFDocument(data: data)
        uiView.document = document
        uiView.autoScales = true

        DispatchQueue.main.async {
            pageCount = max(document?.pageCount ?? 1, 1)
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    final class Coordinator {
        var data: Data?
    }
}

private struct DrawingSignaturePad: UIViewRepresentable {
    @Binding var imageDataUrl: String

    func makeUIView(context: Context) -> PKCanvasView {
        let view = PKCanvasView()
        view.backgroundColor = Color(red: 0.85, green: 0.85, blue: 0.85).uiColor
        view.drawingPolicy = .anyInput
        view.tool = PKInkingTool(.pen, color: .black, width: 3)
        view.delegate = context.coordinator
        return view
    }

    func updateUIView(_ uiView: PKCanvasView, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(imageDataUrl: $imageDataUrl)
    }

    final class Coordinator: NSObject, PKCanvasViewDelegate {
        @Binding private var imageDataUrl: String

        init(imageDataUrl: Binding<String>) {
            _imageDataUrl = imageDataUrl
        }

        func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
            guard canvasView.drawing.bounds.isEmpty == false else {
                imageDataUrl = ""
                return
            }

            let bounds = canvasView.bounds
            let image = canvasView.drawing.image(from: bounds, scale: UIScreen.main.scale)
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