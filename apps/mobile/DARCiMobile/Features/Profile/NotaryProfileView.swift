import SwiftUI

struct NotaryProfileView: View {
    private let designSize = CGSize(width: 440, height: 956)
    private let session: AuthSession?
    private let onProfileAction: () -> Void
    private let onSettingsAction: () -> Void
    private let onReviewRequest: (NotaryQueueRequestSummary) -> Void
    private let onStartSession: (NotaryQueueRequestSummary) -> Void

    @StateObject private var viewModel: NotaryProfileViewModel
    @State private var selectedTab: NotaryQueueTab = .review

    init(
        session: AuthSession?,
        viewModel: NotaryProfileViewModel = NotaryProfileViewModel(),
        onProfileAction: @escaping () -> Void,
        onSettingsAction: @escaping () -> Void,
        onReviewRequest: @escaping (NotaryQueueRequestSummary) -> Void = { _ in },
        onStartSession: @escaping (NotaryQueueRequestSummary) -> Void = { _ in }
    ) {
        self.session = session
        self.onProfileAction = onProfileAction
        self.onSettingsAction = onSettingsAction
        self.onReviewRequest = onReviewRequest
        self.onStartSession = onStartSession
        _viewModel = StateObject(wrappedValue: viewModel)
    }

    var body: some View {
        GeometryReader { proxy in
            VStack(alignment: .leading, spacing: 0) {
                header(in: proxy)
                    .padding(.top, scaled(74, in: proxy))
                    .padding(.horizontal, scaled(33, in: proxy))

                queueTabs(in: proxy)
                    .padding(.top, scaled(71, in: proxy))
                    .padding(.horizontal, scaled(24, in: proxy))

                ScrollView(showsIndicators: false) {
                    queueContent(in: proxy)
                        .padding(.top, scaled(35, in: proxy))
                        .padding(.horizontal, scaled(26, in: proxy))
                        .padding(.bottom, scaled(96, in: proxy))
                }
                .refreshable {
                    await viewModel.load(session: session)
                }
            }
            .background(Color.white.ignoresSafeArea())
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .navigationBar)
        .task(id: session?.accessToken) {
            await viewModel.load(session: session)
        }
    }

    private func header(in proxy: GeometryProxy) -> some View {
        let profile = HomeProfileContent(user: session?.user)

        return HStack(alignment: .center, spacing: 0) {
            Button(action: onSettingsAction) {
                ZStack {
                    Circle()
                        .fill(DARCiTheme.onboardingGreen)
                        .frame(width: scaled(45, in: proxy), height: scaled(45, in: proxy))

                    Text(profile.initials)
                        .font(DARCiFont.maisonNeue(.medium, size: 20))
                        .lineSpacing(26)
                        .foregroundStyle(.black)
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Open user settings")

            NotarySearchIcon()
                .stroke(.black, style: StrokeStyle(lineWidth: 1.5, lineCap: .butt, lineJoin: .miter))
                .frame(width: scaled(18, in: proxy), height: scaled(18, in: proxy))
                .padding(.leading, scaled(29, in: proxy))

            Spacer(minLength: 0)

            Button(action: onProfileAction) {
                Text("Illuminotary")
                    .font(DARCiFont.maisonNeue(.mono, size: 13))
                    .lineSpacing(16.9)
                    .foregroundStyle(Color(red: 0.19, green: 0.19, blue: 0.19))
                    .frame(width: scaled(117, in: proxy), height: scaled(26, in: proxy))
                    .overlay {
                        RoundedRectangle(cornerRadius: scaled(13, in: proxy))
                            .inset(by: 0.5)
                            .stroke(Color(red: 0.84, green: 0.84, blue: 0.84), lineWidth: 0.5)
                    }
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity, minHeight: scaled(45, in: proxy), alignment: .leading)
    }

    private func queueTabs(in proxy: GeometryProxy) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: scaled(10, in: proxy)) {
                ForEach(NotaryQueueTab.allCases) { tab in
                    Button {
                        withAnimation(.timingCurve(0.16, 1.0, 0.3, 1.0, duration: 0.28)) {
                            selectedTab = tab
                        }
                    } label: {
                        Text(tab.title)
                            .font(DARCiFont.maisonNeue(.mono, size: scaled(11, in: proxy)))
                            .lineSpacing(scaled(11, in: proxy))
                            .foregroundStyle(selectedTab == tab ? .black : Color(red: 0.72, green: 0.72, blue: 0.72))
                            .lineLimit(1)
                            .minimumScaleFactor(0.9)
                            .allowsTightening(true)
                            .frame(width: tabWidth(for: tab, in: proxy), alignment: tab == .completed ? .trailing : .leading)
                            .frame(height: scaled(31, in: proxy), alignment: .topLeading)
                    }
                    .buttonStyle(.plain)
                }
            }

            Rectangle()
                .fill(.black.opacity(0.12))
                .frame(height: 0.5)
                .overlay(alignment: .bottomLeading) {
                    GeometryReader { lineProxy in
                        Rectangle()
                            .fill(.black)
                            .frame(width: indicatorWidth(in: lineProxy.size.width), height: scaled(2, in: proxy))
                            .offset(x: indicatorOffset(in: lineProxy.size.width))
                    }
                }
                .frame(height: scaled(2, in: proxy))
        }
    }

    @ViewBuilder
    private func queueContent(in proxy: GeometryProxy) -> some View {
        let requests = viewModel.requests(for: selectedTab)

        if viewModel.isLoading && viewModel.requests.isEmpty {
            ProgressView()
                .tint(.black)
                .frame(maxWidth: .infinity, minHeight: scaled(180, in: proxy))
        } else if let errorMessage = viewModel.errorMessage, viewModel.requests.isEmpty {
            NotaryProfileStatusMessage(text: errorMessage)
        } else if requests.isEmpty {
            NotaryProfileStatusMessage(text: selectedTab.emptyMessage)
        } else {
            VStack(spacing: scaled(20, in: proxy)) {
                ForEach(requests) { request in
                    NotaryQueueRequestCard(
                        request: request,
                        tab: selectedTab,
                        onReview: { onReviewRequest(request) },
                        onStartSession: { onStartSession(request) }
                    )
                }
            }
        }
    }

    private func indicatorWidth(in availableWidth: CGFloat) -> CGFloat {
        switch selectedTab {
        case .ready:
            return tabWidth(for: .ready, availableWidth: availableWidth) * 0.98
        case .completed:
            return tabWidth(for: .completed, availableWidth: availableWidth) * 0.86
        default:
            return tabWidth(for: selectedTab, availableWidth: availableWidth) * 0.9
        }
    }

    private func indicatorOffset(in availableWidth: CGFloat) -> CGFloat {
        let spacing: CGFloat = 10
        var offset: CGFloat = 0

        for tab in NotaryQueueTab.allCases {
            if tab == selectedTab {
                if tab == .completed {
                    return availableWidth - indicatorWidth(in: availableWidth)
                }

                return min(offset, availableWidth - indicatorWidth(in: availableWidth))
            }

            offset += tabWidth(for: tab, availableWidth: availableWidth) + spacing
        }

        return 0
    }

    private func tabWidth(for tab: NotaryQueueTab, in proxy: GeometryProxy) -> CGFloat {
        let availableWidth = proxy.size.width - scaled(48, in: proxy)
        return tabWidth(for: tab, availableWidth: availableWidth)
    }

    private func tabWidth(for tab: NotaryQueueTab, availableWidth: CGFloat) -> CGFloat {
        let totalSpacing: CGFloat = 30
        let contentWidth = max(availableWidth - totalSpacing, 1)

        switch tab {
        case .review:
            return contentWidth * 0.24
        case .inReview:
            return contentWidth * 0.19
        case .ready:
            return contentWidth * 0.36
        case .completed:
            return contentWidth * 0.21
        }
    }

    private func scaled(_ value: CGFloat, in proxy: GeometryProxy) -> CGFloat {
        value * min(proxy.size.width / designSize.width, 1.08)
    }
}

private struct NotaryQueueRequestCard: View {
    let request: NotaryQueueRequestSummary
    let tab: NotaryQueueTab
    let onReview: () -> Void
    let onStartSession: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 12) {
                Text(documentTitle)
                    .font(DARCiFont.maisonNeue(.mono, size: 13))
                    .lineSpacing(16.9)
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.68)

                Spacer(minLength: 0)

                Text(dateLabel.uppercased())
                    .font(DARCiFont.maisonNeue(.mono, size: 10))
                    .lineSpacing(13)
                    .foregroundStyle(.white)
                    .lineLimit(1)
            }

            Text("PRINCIPAL: \(principalName.uppercased())\n\(documentCode.uppercased())")
                .font(DARCiFont.maisonNeue(.mono, size: 8.5))
                .lineSpacing(2.55)
                .foregroundStyle(.white)
                .padding(.top, 8)

            Spacer(minLength: 0)

            VStack(alignment: .leading, spacing: 9) {
                if tab == .completed {
                    HStack(spacing: 8) {
                        Text(completedStatus)
                        NotaryCheckIcon()
                            .stroke(.white, style: StrokeStyle(lineWidth: 1.4, lineCap: .square, lineJoin: .miter))
                            .frame(width: 12, height: 12)
                    }
                    .font(DARCiFont.maisonNeue(.mono, size: 10))
                    .lineSpacing(13)
                    .foregroundStyle(.white)
                } else if tab == .ready {
                    NotaryCardActionButton(title: "START IN-PERSON SESSION", action: onStartSession)
                        .accessibilityIdentifier("notary-ready-start-\(request.id)")
                } else {
                    NotaryCardActionButton(title: "REVIEW", action: onReview)
                }
            }
        }
        .padding(.horizontal, 19)
        .padding(.top, 24)
        .padding(.bottom, 30)
        .frame(maxWidth: .infinity, minHeight: 140, alignment: .leading)
        .background(Color.black)
        .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
    }

    private var documentTitle: String {
        let type = displayDocumentType(request.document.documentTypeLabel ?? request.document.documentType)
        let jurisdiction = displayJurisdiction(request.document.jurisdiction)
        return [type, jurisdiction]
            .filter { $0.isEmpty == false }
            .joined(separator: " - ")
            .uppercased()
    }

    private var principalName: String {
        let values = [request.owner?.displayName, request.owner?.fullName, request.owner?.email]
        return values.compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }.first { $0.isEmpty == false } ?? "Member pending"
    }

    private var documentCode: String {
        let idn = request.document.idn?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if idn.isEmpty == false {
            return idn
        }

        let id = request.document.id.trimmingCharacters(in: .whitespacesAndNewlines)
        return id.isEmpty ? request.request.id : String(id.prefix(12))
    }

    private var dateLabel: String {
        let value = request.request.submittedAt ?? request.workflow?.latestStatusAt ?? request.document.createdAt
        guard let value, let date = NotaryProfileDateFormatting.date(from: value) else {
            return "Pending"
        }

        return NotaryProfileDateFormatting.displayDate.string(from: date)
    }

    private var completedStatus: String {
        if request.finalization.isAnchored == true || request.document.summary?.finalization?.isAnchored == true {
            return "APPROVED"
        }

        return displayStatus(request.finalization.latestStatus ?? request.request.queueStatus ?? request.request.status)
    }

    private func displayDocumentType(_ value: String?) -> String {
        let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
        switch normalized {
        case "notarize_document", "document_notarization", "document notarization":
            return "Document Notarization"
        case "poa", "poa_only", "power_of_attorney", "power of attorney":
            return "POA"
        case "trust", "trust_bundle", "trust_registration", "trust registration":
            return "Trust"
        default:
            return normalized.isEmpty ? "Document" : normalized.split(separator: "_").map { $0.capitalized }.joined(separator: " ")
        }
    }

    private func displayJurisdiction(_ value: String?) -> String {
        value?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "-", with: "/") ?? ""
    }

    private func displayStatus(_ value: String?) -> String {
        let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
        if normalized.isEmpty { return "PENDING" }
        return normalized.split(separator: "_").map { $0.uppercased() }.joined(separator: " ")
    }
}

private struct NotaryCardActionButton: View {
    let title: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 5) {
                Text(title)
                    .underline()
                DARCiArrowRightIcon()
                    .stroke(.white, style: StrokeStyle(lineWidth: 1.4, lineCap: .square, lineJoin: .miter))
                    .frame(width: 11, height: 11)
            }
            .font(DARCiFont.maisonNeue(.mono, size: 10))
            .lineSpacing(13)
            .foregroundStyle(.white)
        }
        .buttonStyle(.plain)
    }
}

private struct NotaryProfileStatusMessage: View {
    let text: String

    var body: some View {
        Text(text)
            .font(DARCiFont.maisonNeue(.book, size: 13))
            .lineSpacing(5)
            .foregroundStyle(.black.opacity(0.58))
            .frame(maxWidth: .infinity, minHeight: 140, alignment: .center)
            .padding(.horizontal, 18)
            .background(Color.black.opacity(0.05))
            .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
    }
}

@MainActor
private enum NotaryProfileDateFormatting {
    static func date(from value: String) -> Date? {
        if let date = fractionalFormatter.date(from: value) {
            return date
        }

        return internetFormatter.date(from: value)
    }

    static let displayDate: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d, yyyy"
        return formatter
    }()

    private static let fractionalFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let internetFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()
}

private struct NotarySearchIcon: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let source: CGFloat = 18
        path.addEllipse(in: CGRect(x: rect.minX + (0.75 / source) * rect.width, y: rect.minY + (0.75 / source) * rect.height, width: (14.2222 / source) * rect.width, height: (14.2222 / source) * rect.height))
        path.move(to: point(16.75, 16.75, in: rect, source: source))
        path.addLine(to: point(12.8833, 12.8833, in: rect, source: source))
        return path
    }
}

private struct NotaryCheckIcon: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: point(10.7, 1.7, in: rect, source: 12))
        path.addLine(to: point(4.6, 9.3, in: rect, source: 12))
        path.addLine(to: point(1.3, 6.1, in: rect, source: 12))
        path.move(to: point(11.2, 5.2, in: rect, source: 12))
        path.addLine(to: point(11.2, 11.2, in: rect, source: 12))
        path.addLine(to: point(0.8, 11.2, in: rect, source: 12))
        path.addLine(to: point(0.8, 0.8, in: rect, source: 12))
        path.addLine(to: point(7.2, 0.8, in: rect, source: 12))
        return path
    }
}

private func point(_ x: CGFloat, _ y: CGFloat, in rect: CGRect, source: CGFloat) -> CGPoint {
    CGPoint(x: rect.minX + (x / source) * rect.width, y: rect.minY + (y / source) * rect.height)
}