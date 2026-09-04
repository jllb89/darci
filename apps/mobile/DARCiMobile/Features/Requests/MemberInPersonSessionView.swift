import SwiftUI
import UIKit

struct MemberInPersonSessionView: View {
    private let session: AuthSession?

    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @StateObject private var viewModel: MemberInPersonSessionViewModel
    @State private var pageCount = 1
    @State private var currentPage = 1
    @State private var zoomInTrigger = 0
    @State private var zoomOutTrigger = 0
    @State private var isShowingNoticeToast = false

    init(
        session: AuthSession?,
        requestId: String,
        apiClient: RequestsAPIProviding = RequestsAPIClient(),
        locationProvider: NotarySessionLocationProviding = CoreLocationNotarySessionProvider()
    ) {
        self.session = session
        _viewModel = StateObject(
            wrappedValue: MemberInPersonSessionViewModel(
                requestId: requestId,
                apiClient: apiClient,
                locationProvider: locationProvider
            )
        )
    }

    var body: some View {
        GeometryReader { proxy in
            VStack(spacing: 0) {
                header
                    .padding(.horizontal, 24)
                    .padding(.top, 18)
                    .padding(.bottom, 14)
                    .background(Color.white)

                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 18) {
                        heading
                        messages

                        if viewModel.context != nil {
                            if viewModel.shouldShowContactExchange {
                                contactExchangeCard
                            } else {
                                MemberSessionStatusBar(
                                    documentType: viewModel.documentTypeLabel,
                                    jurisdiction: viewModel.jurisdictionLabel,
                                    documentCode: viewModel.documentCode,
                                    statusLabel: viewModel.statusLabel,
                                    timeline: viewModel.timeline
                                )
                            }

                            if viewModel.reviewDocuments.count > 1 {
                                documentSelector
                            }

                            documentPreview(in: proxy)

                            if let publicVerificationURL = viewModel.publicVerificationURL {
                                Button {
                                    openURL(publicVerificationURL)
                                } label: {
                                    HStack(spacing: 10) {
                                        Image(systemName: "arrow.up.right.square")
                                            .font(.system(size: 14, weight: .medium))
                                        Text("Open public verification")
                                            .font(DARCiFont.maisonNeue(.medium, size: 13))
                                    }
                                    .foregroundStyle(.white)
                                    .frame(maxWidth: .infinity, minHeight: 48)
                                    .background(Color.black)
                                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                                }
                                .buttonStyle(.plain)
                                .accessibilityIdentifier("member-session-open-public-verification")
                            }
                        }
                    }
                    .padding(.horizontal, 24)
                    .padding(.top, 10)
                    .padding(.bottom, 24)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .refreshable {
                    await viewModel.refreshFromForeground(session: session)
                }
            }
            .background(Color.white.ignoresSafeArea())
            .overlay {
                if viewModel.isLoading && viewModel.context == nil {
                    ZStack {
                        Color.white.opacity(0.9)
                        ProgressView("Loading session")
                            .font(DARCiFont.maisonNeue(.book, size: 12))
                            .tint(.black)
                    }
                }
            }
            .overlay(alignment: .top) {
                if let noticeMessage = viewModel.noticeMessage, isShowingNoticeToast {
                    noticeToast(noticeMessage)
                        .padding(.horizontal, 24)
                        .padding(.top, 10)
                        .transition(.move(edge: .top).combined(with: .opacity))
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if viewModel.context?.meeting?.status == "in_progress" {
                    Button {
                        Task { await viewModel.shareLocation(session: session) }
                    } label: {
                        HStack(spacing: 10) {
                            Image(systemName: "location.fill")
                                .font(.system(size: 14, weight: .medium))
                            Text(viewModel.shareLocationButtonTitle)
                                .font(DARCiFont.maisonNeue(.medium, size: 14))
                                .multilineTextAlignment(.center)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .foregroundStyle(viewModel.canShareLocation ? Color.black : Color.white.opacity(0.64))
                        .frame(maxWidth: .infinity, minHeight: 52)
                        .background(viewModel.canShareLocation ? DARCiTheme.onboardingGreen : Color.black.opacity(0.55))
                    }
                    .buttonStyle(.plain)
                    .disabled(viewModel.canShareLocation == false)
                    .accessibilityIdentifier("member-session-share-location")
                    .padding(.horizontal, 24)
                    .padding(.top, 12)
                    .padding(.bottom, max(proxy.safeAreaInsets.bottom, 12))
                    .background(.white)
                    .overlay(alignment: .top) {
                        Rectangle().fill(Color.black.opacity(0.08)).frame(height: 0.5)
                    }
                }
            }
        }
        .navigationBarBackButtonHidden(true)
        .toolbar(.hidden, for: .navigationBar)
        .task { await viewModel.load(session: session) }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            Task { await viewModel.refreshFromForeground(session: session) }
        }
        .onChange(of: viewModel.noticeToken) { _, _ in
            withAnimation(.easeInOut(duration: 0.18)) {
                isShowingNoticeToast = viewModel.noticeMessage != nil
            }
        }
        .onChange(of: viewModel.noticeMessage) { _, message in
            guard message == nil else { return }
            withAnimation(.easeInOut(duration: 0.18)) {
                isShowingNoticeToast = false
            }
        }
        .onDisappear { viewModel.stop() }
    }

    private var header: some View {
        HStack(spacing: 18) {
            Button { dismiss() } label: {
                Image(systemName: "arrow.left")
                    .font(.system(size: 23, weight: .regular))
                    .foregroundStyle(.black)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Back to requests")

            Text(viewModel.screenTitle)
                .font(DARCiFont.maisonNeue(.medium, size: 14))
                .foregroundStyle(.black)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)

            Spacer(minLength: 0)
        }
    }

    private var heading: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(viewModel.shouldShowContactExchange ? "Request approved" : "In-person session")
                .font(DARCiFont.maisonNeue(.demi, size: 17))
                .foregroundStyle(.black)
            Text(viewModel.shouldShowContactExchange
                 ? "\(viewModel.notaryName) approved the request. Coordinate directly before the live session starts."
                 : "\(viewModel.notaryName) · Review the live document while your session is recorded.")
                .font(DARCiFont.maisonNeue(.book, size: 12))
                .lineSpacing(4)
                .foregroundStyle(.black.opacity(0.66))
        }
    }

    private var contactExchangeCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("YOUR illuminotary")
                .font(DARCiFont.maisonNeue(.mono, size: 9))
                .foregroundStyle(.black.opacity(0.48))

            Text(viewModel.notaryName)
                .font(DARCiFont.maisonNeue(.demi, size: 18))
                .foregroundStyle(.black)
                .lineLimit(2)

            let contactLayout = dynamicTypeSize.isAccessibilitySize
                ? AnyLayout(VStackLayout(spacing: 10))
                : AnyLayout(HStackLayout(spacing: 10))

            contactLayout {
                contactButton(title: "Email", systemImage: "envelope", value: viewModel.notaryEmail, url: contactURL(scheme: "mailto", value: viewModel.notaryEmail))
                contactButton(title: "Call", systemImage: "phone", value: viewModel.notaryPhone, url: contactURL(scheme: "tel", value: viewModel.notaryPhone))
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(red: 0.94, green: 0.94, blue: 0.94))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color.black.opacity(0.12), lineWidth: 0.5)
        }
    }

    private func contactButton(title: String, systemImage: String, value: String?, url: URL?) -> some View {
        let isEmailAction = title == "Email"
        let foregroundColor = url == nil ? Color.black.opacity(0.42) : (isEmailAction ? Color.black : Color.white)
        let backgroundColor = isEmailAction
            ? DARCiTheme.onboardingGreen.opacity(url == nil ? 0.42 : 1)
            : Color.black.opacity(url == nil ? 0.18 : 1)

        return Button {
            guard let url else { return }
            openURL(url)
        } label: {
            HStack(spacing: 7) {
                Image(systemName: systemImage)
                    .font(.system(size: 12, weight: .medium))
                Text(title)
                    .font(DARCiFont.maisonNeue(.medium, size: 12))
            }
            .foregroundStyle(foregroundColor)
            .frame(maxWidth: .infinity)
            .frame(height: 40)
            .background(backgroundColor)
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(value?.isEmpty != false || url == nil)
    }

    private func contactURL(scheme: String, value: String?) -> URL? {
        guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines), value.isEmpty == false else { return nil }
        if scheme == "tel" {
            let allowed = value.filter { $0.isNumber || $0 == "+" }
            return allowed.isEmpty ? nil : URL(string: "tel:\(allowed)")
        }
        return URL(string: "\(scheme):\(value)")
    }

    @ViewBuilder
    private var messages: some View {
        if let errorMessage = viewModel.errorMessage {
            message(
                errorMessage,
                color: Color(red: 0.68, green: 0.10, blue: 0.10),
                background: Color(red: 0.99, green: 0.94, blue: 0.94),
                showsLocationSettingsAction: viewModel.shouldShowLocationSettingsAction
            )
        }
    }

    private func noticeToast(_ text: String) -> some View {
        Text(text)
            .font(DARCiFont.maisonNeue(.book, size: 12))
            .foregroundStyle(.white)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.black)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .shadow(color: .black.opacity(0.16), radius: 12, y: 5)
    }

    private func message(
        _ text: String,
        color: Color,
        background: Color,
        showsLocationSettingsAction: Bool = false
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(text)
                .font(DARCiFont.maisonNeue(.book, size: 12))
                .foregroundStyle(color)
                .fixedSize(horizontal: false, vertical: true)

            if showsLocationSettingsAction {
                Button("Open Settings", action: openLocationSettings)
                    .font(DARCiFont.maisonNeue(.medium, size: 12))
                    .foregroundStyle(.black)
                    .padding(.horizontal, 12)
                    .frame(height: 34)
                    .background(Color.white)
                    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: 6, style: .continuous)
                            .stroke(Color.black.opacity(0.16), lineWidth: 1)
                    }
                    .buttonStyle(.plain)
            }
        }
        .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(background)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func openLocationSettings() {
        guard let settingsURL = URL(string: UIApplication.openSettingsURLString) else { return }
        openURL(settingsURL)
    }

    private var documentSelector: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(viewModel.reviewDocuments) { document in
                    let isSelected = document.id == viewModel.selectedDocument?.id
                    Button { viewModel.selectDocument(document) } label: {
                        Text(document.label)
                            .font(DARCiFont.maisonNeue(.book, size: 11))
                            .lineLimit(1)
                        .foregroundStyle(isSelected ? .white : .black)
                        .frame(width: 156, alignment: .leading)
                        .padding(.horizontal, 12)
                        .frame(height: 48)
                        .background(isSelected ? Color.black : Color.black.opacity(0.045))
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                        .overlay {
                            RoundedRectangle(cornerRadius: 6)
                                .stroke(Color.black.opacity(isSelected ? 0 : 0.14), lineWidth: 1)
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func documentPreview(in proxy: GeometryProxy) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 22) {
                Text("\(min(currentPage, max(pageCount, 1)))/\(max(pageCount, 1))")
                    .font(DARCiFont.maisonNeue(.book, size: 12))
                    .frame(minWidth: 42, alignment: .leading)

                Button { zoomInTrigger += 1 } label: {
                    Image(systemName: "plus.magnifyingglass").frame(width: 26, height: 26)
                }
                .disabled(viewModel.pdfData == nil)

                Button { zoomOutTrigger += 1 } label: {
                    Image(systemName: "minus.magnifyingglass").frame(width: 26, height: 26)
                }
                .disabled(viewModel.pdfData == nil)

                Spacer(minLength: 0)

                Button {
                    guard let path = viewModel.selectedDocument?.downloadUrl,
                          let url = URL(string: path) else { return }
                    openURL(url)
                } label: {
                    Image(systemName: "arrow.down.to.line").frame(width: 26, height: 26)
                }
                .disabled(viewModel.selectedDocument?.downloadUrl == nil)
            }
            .buttonStyle(.plain)
            .font(.system(size: 14))
            .foregroundStyle(.black)
            .padding(.horizontal, 15)
            .frame(height: 52)

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
                    ProgressView().tint(.black)
                } else {
                    Text("The session PDF will appear here when it is ready.")
                        .font(DARCiFont.maisonNeue(.book, size: 12))
                        .foregroundStyle(.black.opacity(0.56))
                        .multilineTextAlignment(.center)
                        .padding(24)
                }
            }
            .frame(height: min(max(proxy.size.height * 0.58, 420), 620))
            .padding(.horizontal, 14)
            .padding(.bottom, 14)
        }
        .background(Color(red: 0.88, green: 0.88, blue: 0.88))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color.black.opacity(0.16), lineWidth: 0.5)
        }
    }
}

private struct MemberSessionStatusBar: View {
    let documentType: String
    let jurisdiction: String
    let documentCode: String
    let statusLabel: String
    let timeline: [MemberSessionTimelineItem]

    private var currentIndex: Int {
        timeline.firstIndex(where: { $0.isComplete == false }) ?? max(timeline.count - 1, 0)
    }

    private var completedCount: Int {
        timeline.filter(\.isComplete).count
    }

    var body: some View {
        let current = timeline.indices.contains(currentIndex) ? timeline[currentIndex] : nil

        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text("\(documentType.uppercased())\(jurisdiction.isEmpty ? "" : " – \(jurisdiction)")")
                    .font(DARCiFont.maisonNeue(.book, size: 11))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                Spacer(minLength: 8)
                Text(statusLabel.uppercased())
                    .font(DARCiFont.maisonNeue(.mono, size: 8))
                    .foregroundStyle(.white.opacity(0.72))
            }

            HStack(spacing: 4) {
                ForEach(Array(timeline.enumerated()), id: \.element.id) { index, item in
                    Capsule()
                        .fill(item.isComplete || index == currentIndex ? DARCiTheme.onboardingGreen : Color.white.opacity(0.18))
                        .frame(height: 4)
                }
            }

            if let current {
                Text(current.description)
                    .font(DARCiFont.maisonNeue(.book, size: 10))
                    .foregroundStyle(.white.opacity(0.76))
                    .lineLimit(2)
            }

            HStack {
                Text(documentCode.uppercased())
                    .font(DARCiFont.maisonNeue(.mono, size: 8))
                    .lineLimit(1)
                Spacer(minLength: 8)
                Text("\(completedCount)/\(timeline.count)")
                    .font(DARCiFont.maisonNeue(.mono, size: 8))
                    .foregroundStyle(.white.opacity(0.58))
            }
            .foregroundStyle(.white.opacity(0.82))
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 112, alignment: .leading)
        .background(Color.black)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}
