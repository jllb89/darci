import SwiftUI

struct RequestsView: View {
    private let designSize = CGSize(width: 440, height: 956)
    private let session: AuthSession?
    private let onOpenDocument: (String) -> Void

    @Binding private var selectedTab: AppTab
    @StateObject private var viewModel: RequestsViewModel
    @State private var selectedLane: RequestsLane = .inbox
    @State private var isFilterPresented = false
    @State private var isSearchPresented = false
    @Namespace private var searchTransitionNamespace

    init(
        session: AuthSession?,
        selectedTab: Binding<AppTab>,
        viewModel: RequestsViewModel = RequestsViewModel(),
        onOpenDocument: @escaping (String) -> Void
    ) {
        self.session = session
        self.onOpenDocument = onOpenDocument
        _selectedTab = selectedTab
        _viewModel = StateObject(wrappedValue: viewModel)
    }

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .top) {
                if isSearchPresented {
                    RequestsSearchView(
                        viewModel: viewModel,
                        selectedLane: selectedLane,
                        searchNamespace: searchTransitionNamespace,
                        onBack: { isSearchPresented = false },
                        onOpenRequest: openRequest
                    )
                    .transition(.opacity)
                    .zIndex(2)
                } else if isFilterPresented {
                    RequestsFilterView(
                        viewModel: viewModel,
                        onBack: { isFilterPresented = false },
                        onApply: { isFilterPresented = false }
                    )
                    .transition(.opacity)
                    .zIndex(1)
                } else {
                    requestsContent(in: proxy)
                        .transition(.opacity)
                }
            }
            .animation(.easeInOut(duration: 0.34), value: isSearchPresented)
            .animation(.easeInOut(duration: 0.34), value: isFilterPresented)
            .safeAreaInset(edge: .bottom) {
                if isSearchPresented == false && isFilterPresented == false {
                    RequestsBottomToolbar(selectedTab: $selectedTab)
                        .frame(width: scaled(241, in: proxy), height: scaled(44, in: proxy))
                        .frame(maxWidth: .infinity)
                        .padding(.top, scaled(10, in: proxy))
                        .padding(.bottom, scaled(12, in: proxy))
                        .background(Color.white)
                }
            }
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .navigationBar)
        .task(id: session?.accessToken) {
            await viewModel.load(session: session)
        }
        .refreshable {
            await viewModel.load(session: session)
        }
    }

    private func requestsContent(in proxy: GeometryProxy) -> some View {
        ZStack(alignment: .top) {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 0) {
                    laneTabs(in: proxy)
                        .padding(.top, scaled(116, in: proxy))

                    Text(selectedLane.subtitle)
                        .font(DARCiFont.maisonNeue(.light, size: scaled(12, in: proxy)))
                        .lineSpacing(scaled(3.6, in: proxy))
                        .foregroundStyle(.black)
                        .padding(.top, scaled(26, in: proxy))
                        .padding(.horizontal, scaled(25, in: proxy))

                    requestList(in: proxy)
                        .padding(.top, scaled(28, in: proxy))
                        .padding(.horizontal, scaled(26, in: proxy))
                }
                .padding(.bottom, scaled(100, in: proxy))
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(Color.white.ignoresSafeArea())

            RequestsTopBar(
                title: "Requests",
                showsClearButton: viewModel.filters.isActive,
                onSearch: { isSearchPresented = true },
                onFilter: { isFilterPresented = true },
                onClearFilters: { viewModel.clearFilters() },
                searchNamespace: searchTransitionNamespace
            )
            .padding(.top, scaled(42, in: proxy))
            .padding(.horizontal, scaled(58, in: proxy))
            .padding(.bottom, scaled(12, in: proxy))
            .background(Color.white)
        }
    }

    private func laneTabs(in proxy: GeometryProxy) -> some View {
        HStack(spacing: scaled(32, in: proxy)) {
            ForEach(RequestsLane.allCases) { lane in
                Button {
                    withAnimation(.easeInOut(duration: 0.24)) {
                        selectedLane = lane
                    }
                } label: {
                    Text(lane.title)
                        .font(DARCiFont.maisonNeue(.book, size: scaled(24, in: proxy)))
                        .lineSpacing(scaled(2.4, in: proxy))
                        .foregroundStyle(selectedLane == lane ? .black : Color(red: 0.77, green: 0.77, blue: 0.77))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, scaled(25, in: proxy))
    }

    @ViewBuilder
    private func requestList(in proxy: GeometryProxy) -> some View {
        let requests = viewModel.requests(for: selectedLane)

        if viewModel.isLoading && viewModel.allRequests.isEmpty {
            ProgressView()
                .tint(.black)
                .frame(maxWidth: .infinity, minHeight: scaled(210, in: proxy))
        } else if let errorMessage = viewModel.errorMessage, viewModel.allRequests.isEmpty {
            RequestsStatusMessage(text: errorMessage)
        } else if requests.isEmpty {
            RequestsStatusMessage(text: emptyMessage)
        } else {
            VStack(spacing: scaled(20, in: proxy)) {
                ForEach(requests) { request in
                    RequestsCard(
                        request: request,
                        lane: selectedLane,
                        resendState: viewModel.resendStates[request.inviteId],
                        isOpening: viewModel.openingInviteIds.contains(request.inviteId),
                        canSendReminder: viewModel.canSendReminder(for: request),
                        onOpen: { openRequest(request) },
                        onSendReminder: {
                            Task { await viewModel.sendReminder(for: request, session: session) }
                        }
                    )
                }
            }
        }
    }

    private var emptyMessage: String {
        if viewModel.filters.isActive {
            return "No requests match these filters."
        }

        switch selectedLane {
        case .inbox:
            return "No documents are waiting for your signature."
        case .outbox:
            return "No sent signature requests yet."
        }
    }

    private func openRequest(_ request: SigningRequestCard) {
        Task {
            if await viewModel.openIncomingRequest(request, session: session) {
                onOpenDocument(request.documentId)
            }
        }
    }

    private func scaled(_ value: CGFloat, in proxy: GeometryProxy) -> CGFloat {
        value * min(proxy.size.width / designSize.width, 1.08)
    }
}

private enum RequestsSearchTransition {
    static let iconID = "requests-search-icon"
}

private struct RequestsTopBar: View {
    let title: String
    let showsClearButton: Bool
    let onSearch: () -> Void
    let onFilter: () -> Void
    let onClearFilters: () -> Void
    let searchNamespace: Namespace.ID

    var body: some View {
        HStack(spacing: 22) {
            Button(action: onSearch) {
                HStack(spacing: 22) {
                    RequestsSearchIcon()
                        .stroke(.black, style: StrokeStyle(lineWidth: 1.5, lineCap: .butt, lineJoin: .miter))
                        .frame(width: 18, height: 18)
                        .matchedGeometryEffect(id: RequestsSearchTransition.iconID, in: searchNamespace)

                    Text(title)
                        .font(DARCiFont.maisonNeue(.book, size: 15))
                        .lineSpacing(15)
                        .foregroundStyle(Color(red: 0.67, green: 0.67, blue: 0.67).opacity(0.61))
                }
            }
            .buttonStyle(.plain)
            .frame(minHeight: 44)
            .accessibilityLabel("Search requests")

            Spacer(minLength: 0)

            if showsClearButton {
                Button(action: onClearFilters) {
                    Text("Clear")
                        .font(DARCiFont.maisonNeue(.book, size: 10))
                        .foregroundStyle(Color.black.opacity(0.55))
                }
                .buttonStyle(.plain)
                .frame(minWidth: 44, minHeight: 44)
                .transition(.opacity)
            }

            Button(action: onFilter) {
                RequestsFilterIcon()
                    .stroke(.black, style: StrokeStyle(lineWidth: 1.5, lineCap: .butt, lineJoin: .miter))
                    .frame(width: 19, height: 15)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Filter requests")
        }
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .center)
    }
}

private struct RequestsCard: View {
    let request: SigningRequestCard
    let lane: RequestsLane
    let resendState: RequestSendState?
    let isOpening: Bool
    let canSendReminder: Bool
    let onOpen: () -> Void
    let onSendReminder: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                Text(cardTitle)
                    .font(DARCiFont.maisonNeue(.book, size: 13))
                    .lineSpacing(3.9)
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)

                Spacer(minLength: 12)

                Text(statusLabel)
                    .font(DARCiFont.maisonNeue(.mono, size: 10))
                    .lineSpacing(3)
                    .foregroundStyle(.white)
                    .lineLimit(1)
            }

            Text(request.detail.uppercased())
                .font(DARCiFont.maisonNeue(.mono, size: 8.5))
                .lineSpacing(2.55)
                .foregroundStyle(.white)
                .lineLimit(2)
                .minimumScaleFactor(0.72)
                .padding(.top, 9)

            Text(metaText)
                .font(DARCiFont.maisonNeue(.mono, size: 8))
                .lineSpacing(2.4)
                .foregroundStyle(.white)
                .padding(.top, 26)

            Spacer(minLength: 0)

            if lane == .inbox {
                Button(action: onOpen) {
                    HStack(spacing: 6) {
                        Text(isOpening ? "OPENING..." : "GO TO SIGN")
                            .underline(isOpening == false)
                        Text("->")
                    }
                    .font(DARCiFont.maisonNeue(.mono, size: 10))
                    .lineSpacing(3)
                    .foregroundStyle(.white)
                }
                .buttonStyle(.plain)
                .disabled(isOpening)
            } else {
                Button(action: onSendReminder) {
                    HStack(spacing: 7) {
                        Text(reminderTitle)
                            .underline(resendState != .sending)
                        RequestsBellIcon()
                            .stroke(.white, style: StrokeStyle(lineWidth: 1, lineCap: .round, lineJoin: .round))
                            .frame(width: 10, height: 10)
                    }
                    .font(DARCiFont.maisonNeue(.mono, size: 10))
                    .lineSpacing(3)
                    .foregroundStyle(canSendReminder ? .white : .white.opacity(0.42))
                }
                .buttonStyle(.plain)
                .disabled(canSendReminder == false || resendState == .sending)
            }
        }
        .padding(.horizontal, 24)
        .padding(.top, 24)
        .padding(.bottom, 31)
        .frame(maxWidth: .infinity, minHeight: 175, alignment: .leading)
        .background(Color.black)
        .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
    }

    private var cardTitle: String {
        request.documentLabel
            .replacingOccurrences(of: " - ", with: " - ")
            .uppercased()
    }

    private var statusLabel: String {
        request.status
            .replacingOccurrences(of: "_", with: " ")
            .uppercased()
    }

    private var metaText: String {
        switch lane {
        case .inbox:
            return [
                "FROM: \((request.senderName ?? "Unknown").uppercased())",
                "ROLE: \(request.roleLabel.uppercased())",
                documentCode,
                "RECEIVED: \(dateLabel(from: request.sentAt ?? request.updatedAt).uppercased())"
            ].joined(separator: "\n")
        case .outbox:
            return [
                "SIGNER: \((request.signerName ?? "Unknown").uppercased())",
                "ROLE: \(request.roleLabel.uppercased())",
                documentCode,
                "SENT: \(dateLabel(from: request.sentAt ?? request.updatedAt).uppercased())"
            ].joined(separator: "\n")
        }
    }

    private var documentCode: String {
        let trimmed = request.documentId.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            return "DOC-PENDING"
        }

        return "DOC-\(trimmed.prefix(8).uppercased())"
    }

    private var reminderTitle: String {
        switch resendState {
        case .sending:
            "SENDING..."
        case .sent:
            "REMINDER SENT"
        case .error:
            "TRY AGAIN"
        case .none:
            "SEND REMINDER"
        }
    }

    private func dateLabel(from value: String?) -> String {
        guard let value, let date = RequestsDateFormatting.date(from: value) else {
            return "Pending"
        }

        return RequestsDateFormatting.displayDate.string(from: date)
    }
}

private struct RequestsSearchView: View {
    private let designSize = CGSize(width: 440, height: 956)
    @ObservedObject var viewModel: RequestsViewModel
    let selectedLane: RequestsLane
    let searchNamespace: Namespace.ID
    let onBack: () -> Void
    let onOpenRequest: (SigningRequestCard) -> Void
    @State private var query = ""
    @FocusState private var isFocused: Bool

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .topLeading) {
                Color.black.ignoresSafeArea()

                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: scaled(22, in: proxy)) {
                        Button(action: onBack) {
                            RequestsBackIcon()
                                .stroke(.white, style: StrokeStyle(lineWidth: 1.8, lineCap: .square, lineJoin: .miter))
                                .frame(width: scaled(18, in: proxy), height: scaled(18, in: proxy))
                                .frame(width: 44, height: 44)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Back")

                        HStack(spacing: scaled(22, in: proxy)) {
                            RequestsSearchIcon()
                                .stroke(.white, style: StrokeStyle(lineWidth: 1.5, lineCap: .butt, lineJoin: .miter))
                                .frame(width: scaled(18, in: proxy), height: scaled(18, in: proxy))
                                .matchedGeometryEffect(id: RequestsSearchTransition.iconID, in: searchNamespace)

                            TextField("Search", text: $query)
                                .font(DARCiFont.maisonNeue(.book, size: 15))
                                .lineSpacing(15)
                                .foregroundStyle(.white)
                                .tint(.white)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .focused($isFocused)
                        }
                        .padding(.trailing, scaled(9, in: proxy))
                        .frame(height: scaled(34, in: proxy))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(query.isEmpty ? Color.clear : Color(red: 0.10, green: 0.10, blue: 0.10))
                        .overlay(alignment: .bottom) {
                            Rectangle()
                                .fill(query.isEmpty ? Color.clear : .white)
                                .frame(height: 0.5)
                        }
                    }
                    .padding(.top, scaled(42, in: proxy))

                    if query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false {
                        ScrollView(showsIndicators: false) {
                            VStack(alignment: .leading, spacing: scaled(31, in: proxy)) {
                                Text("Results:")
                                    .font(DARCiFont.maisonNeue(.medium, size: 12))
                                    .foregroundStyle(.white)

                                if results.isEmpty {
                                    Text("No results")
                                        .font(DARCiFont.maisonNeue(.book, size: 12))
                                        .foregroundStyle(.white.opacity(0.45))
                                } else {
                                    VStack(alignment: .leading, spacing: scaled(16, in: proxy)) {
                                        ForEach(results) { request in
                                            RequestsSearchResultCard(request: request) {
                                                onOpenRequest(request)
                                            }
                                        }
                                    }
                                }
                            }
                            .padding(.horizontal, scaled(10, in: proxy))
                            .padding(.bottom, scaled(80, in: proxy))
                        }
                        .scrollDismissesKeyboard(.interactively)
                        .padding(.top, scaled(76, in: proxy))
                        .transition(.opacity)
                    }

                    Spacer(minLength: 0)
                }
                .padding(.horizontal, scaled(12, in: proxy))
            }
            .onAppear {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.22) {
                    isFocused = true
                }
            }
        }
    }

    private var results: [SigningRequestCard] {
        viewModel.searchResults(for: query, lane: selectedLane)
    }

    private func scaled(_ value: CGFloat, in proxy: GeometryProxy) -> CGFloat {
        value * min(proxy.size.width / designSize.width, 1.08)
    }
}

private struct RequestsSearchResultCard: View {
    let request: SigningRequestCard
    let onOpen: () -> Void

    var body: some View {
        Button(action: onOpen) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text(request.documentLabel.uppercased())
                        .font(DARCiFont.maisonNeue(.book, size: 13))
                        .foregroundStyle(.white)
                    Spacer()
                    Text(request.status.uppercased())
                        .font(DARCiFont.maisonNeue(.mono, size: 9))
                        .foregroundStyle(.white.opacity(0.72))
                }

                Text(request.detail.uppercased())
                    .font(DARCiFont.maisonNeue(.mono, size: 8.5))
                    .lineSpacing(2)
                    .foregroundStyle(.white.opacity(0.8))
                    .lineLimit(2)
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.white.opacity(0.08))
            .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

private struct RequestsFilterView: View {
    private let designSize = CGSize(width: 440, height: 956)
    @ObservedObject var viewModel: RequestsViewModel
    let onBack: () -> Void
    let onApply: () -> Void
    @State private var expandedSection: RequestsFilterSection?
    @State private var revealedSections: Set<RequestsFilterSection> = []

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .top) {
                DARCiTheme.onboardingGreen.ignoresSafeArea()

                VStack(alignment: .leading, spacing: 0) {
                    ScrollView(showsIndicators: true) {
                        VStack(alignment: .leading, spacing: 0) {
                            Button(action: onBack) {
                                RequestsBackIcon()
                                    .stroke(.black, style: StrokeStyle(lineWidth: 1.8, lineCap: .square, lineJoin: .miter))
                                    .frame(width: scaled(18, in: proxy), height: scaled(18, in: proxy))
                                    .frame(width: 44, height: 44)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Back")
                            .padding(.top, scaled(67, in: proxy))

                            HStack(spacing: scaled(15, in: proxy)) {
                                RequestsFilterIcon()
                                    .stroke(.black, style: StrokeStyle(lineWidth: 1.7, lineCap: .butt, lineJoin: .miter))
                                    .frame(width: scaled(22, in: proxy), height: scaled(18, in: proxy))

                                Text("Filter")
                                    .font(DARCiFont.maisonNeue(.medium, size: scaled(24, in: proxy)))
                                    .tracking(0.24)
                                    .lineSpacing(4.8)
                                    .foregroundStyle(.black)
                            }
                            .padding(.top, scaled(60, in: proxy))

                            VStack(alignment: .leading, spacing: 0) {
                                ForEach(RequestsFilterSection.allCases) { section in
                                    RequestsFilterSectionRow(
                                        section: section,
                                        isExpanded: expandedSection == section,
                                        summary: summary(for: section),
                                        content: { filterOptions(for: section) }
                                    ) {
                                        withAnimation(.timingCurve(0.16, 1.0, 0.3, 1.0, duration: 0.42)) {
                                            expandedSection = expandedSection == section ? nil : section
                                        }
                                    }
                                    .opacity(revealedSections.contains(section) ? 1 : 0)
                                    .offset(y: revealedSections.contains(section) ? 0 : 12)
                                    .animation(.easeOut(duration: 0.34).delay(Double(section.index) * 0.055), value: revealedSections)
                                }
                            }
                            .padding(.top, scaled(96, in: proxy))
                        }
                        .padding(.horizontal, scaled(23, in: proxy))
                        .padding(.bottom, scaled(24, in: proxy))
                    }

                    Button(action: onApply) {
                        HStack(spacing: scaled(18, in: proxy)) {
                            RequestsCornerArrowIcon()
                                .stroke(.white, style: StrokeStyle(lineWidth: 2, lineCap: .square, lineJoin: .miter))
                                .frame(width: scaled(18, in: proxy), height: scaled(18, in: proxy))

                            Text("Apply")
                                .font(DARCiFont.maisonNeue(.book, size: scaled(22, in: proxy)))
                                .lineSpacing(2)
                                .foregroundStyle(.white)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .frame(height: scaled(55, in: proxy))
                        .padding(.horizontal, scaled(21, in: proxy))
                        .background(Color.black)
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal, scaled(23, in: proxy))
                    .padding(.top, scaled(12, in: proxy))
                    .padding(.bottom, max(proxy.safeAreaInsets.bottom, scaled(24, in: proxy)))
                    .background(DARCiTheme.onboardingGreen)
                }
            }
            .onAppear(perform: revealSections)
        }
    }

    @ViewBuilder
    private func filterOptions(for section: RequestsFilterSection) -> some View {
        switch section {
        case .status:
            RequestsFilterChipGrid {
                ForEach(viewModel.statusFilterOptions, id: \.self) { status in
                    RequestsFilterChip(title: viewModel.displayStatus(status), isSelected: viewModel.filters.statuses.contains(status)) {
                        toggle(status, in: &viewModel.filters.statuses)
                    }
                }
            }
        case .role:
            RequestsFilterChipGrid {
                ForEach(viewModel.roleFilterOptions, id: \.self) { role in
                    RequestsFilterChip(title: viewModel.displayRole(role), isSelected: viewModel.filters.roles.contains(role)) {
                        toggle(role, in: &viewModel.filters.roles)
                    }
                }
            }
        case .activity:
            RequestsFilterChipGrid {
                ForEach(RequestsActivityFilter.allCases) { activity in
                    RequestsFilterChip(title: activity.title, isSelected: viewModel.filters.activities.contains(activity)) {
                        toggle(activity, in: &viewModel.filters.activities)
                    }
                }
            }
        }
    }

    private func summary(for section: RequestsFilterSection) -> String? {
        switch section {
        case .status:
            return summaryText(viewModel.filters.statuses.map(viewModel.displayStatus))
        case .role:
            return summaryText(viewModel.filters.roles.map(viewModel.displayRole))
        case .activity:
            return summaryText(viewModel.filters.activities.map(\.title))
        }
    }

    private func summaryText(_ values: [String]) -> String? {
        let sortedValues = values.sorted()
        guard sortedValues.isEmpty == false else { return nil }
        return sortedValues.count == 1 ? sortedValues[0] : "\(sortedValues.count) selected"
    }

    private func toggle<T: Hashable>(_ value: T, in set: inout Set<T>) {
        if set.contains(value) {
            set.remove(value)
        } else {
            set.insert(value)
        }
    }

    private func revealSections() {
        revealedSections = []
        for section in RequestsFilterSection.allCases {
            DispatchQueue.main.asyncAfter(deadline: .now() + Double(section.index) * 0.055) {
                revealedSections.insert(section)
            }
        }
    }

    private func scaled(_ value: CGFloat, in proxy: GeometryProxy) -> CGFloat {
        value * min(proxy.size.width / designSize.width, 1.08)
    }
}

private enum RequestsFilterSection: CaseIterable, Identifiable {
    case status
    case role
    case activity

    var id: String { title }

    var title: String {
        switch self {
        case .status:
            "Statuses"
        case .role:
            "Roles"
        case .activity:
            "Activity"
        }
    }

    var index: Int {
        Self.allCases.firstIndex(of: self) ?? 0
    }
}

private struct RequestsFilterSectionRow<Content: View>: View {
    let section: RequestsFilterSection
    let isExpanded: Bool
    let summary: String?
    @ViewBuilder let content: () -> Content
    let onToggle: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button(action: onToggle) {
                HStack(alignment: .firstTextBaseline, spacing: 14) {
                    Text(section.title)
                        .font(DARCiFont.maisonNeue(.book, size: 16))
                        .foregroundStyle(.black)

                    if let summary {
                        Text(summary)
                            .font(DARCiFont.maisonNeue(.book, size: 10))
                            .foregroundStyle(.black.opacity(0.55))
                            .lineLimit(1)
                    }

                    Spacer(minLength: 0)

                    RequestsChevronIcon()
                        .stroke(.black, style: StrokeStyle(lineWidth: 1.5, lineCap: .square, lineJoin: .miter))
                        .frame(width: 12, height: 12)
                        .rotationEffect(.degrees(isExpanded ? 90 : 0))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, 17)
            }
            .buttonStyle(.plain)

            if isExpanded {
                content()
                    .padding(.bottom, 17)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .overlay(alignment: .bottom) {
            Rectangle().fill(.black.opacity(0.18)).frame(height: 1)
        }
    }
}

private struct RequestsFilterChipGrid<Content: View>: View {
    @ViewBuilder let content: () -> Content

    var body: some View {
        RequestsFlowLayout(horizontalSpacing: 8, verticalSpacing: 10) {
            content()
        }
    }
}

private struct RequestsFilterChip: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(DARCiFont.maisonNeue(.book, size: 13))
                .lineSpacing(14)
                .foregroundStyle(isSelected ? DARCiTheme.onboardingGreen : .black)
                .fixedSize(horizontal: true, vertical: false)
                .padding(.horizontal, 11)
                .frame(height: 33)
                .background(isSelected ? Color.black : Color.clear)
                .overlay(
                    Rectangle()
                        .stroke(.black, lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
    }
}

private struct RequestsStatusMessage: View {
    let text: String

    var body: some View {
        Text(text)
            .font(DARCiFont.maisonNeue(.book, size: 13))
            .lineSpacing(5)
            .foregroundStyle(.black.opacity(0.58))
            .frame(maxWidth: .infinity, minHeight: 175, alignment: .center)
            .padding(.horizontal, 18)
            .background(Color.black.opacity(0.05))
            .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
    }
}

private struct RequestsBottomToolbar: View {
    @Binding var selectedTab: AppTab

    var body: some View {
        HStack(spacing: 54.5) {
            toolbarButton(tab: .home, icon: .home)
            toolbarButton(tab: .documents, icon: .file)
            toolbarButton(tab: .requests, icon: .mail)
        }
        .frame(width: 241, height: 44)
        .accessibilityElement(children: .contain)
    }

    private func toolbarButton(tab: AppTab, icon: RequestsToolbarIcon.Kind) -> some View {
        Button {
            selectedTab = tab
        } label: {
            RequestsToolbarIcon(kind: icon)
                .stroke(selectedTab == tab ? DARCiTheme.onboardingGreen : .black, style: StrokeStyle(lineWidth: 2.0625, lineCap: .butt, lineJoin: .miter))
                .frame(width: 25, height: 25)
                .frame(width: 44, height: 44)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(tab.title)
    }
}

@MainActor
private enum RequestsDateFormatting {
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

private struct RequestsFlowLayout: Layout {
    let horizontalSpacing: CGFloat
    let verticalSpacing: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? 0
        var currentX: CGFloat = 0
        var currentY: CGFloat = 0
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if currentX + size.width > maxWidth && currentX > 0 {
                currentX = 0
                currentY += rowHeight + verticalSpacing
                rowHeight = 0
            }

            currentX += size.width + horizontalSpacing
            rowHeight = max(rowHeight, size.height)
        }

        return CGSize(width: maxWidth, height: currentY + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var currentX = bounds.minX
        var currentY = bounds.minY
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if currentX + size.width > bounds.maxX && currentX > bounds.minX {
                currentX = bounds.minX
                currentY += rowHeight + verticalSpacing
                rowHeight = 0
            }

            subview.place(at: CGPoint(x: currentX, y: currentY), proposal: ProposedViewSize(size))
            currentX += size.width + horizontalSpacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

private struct RequestsSearchIcon: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let source: CGFloat = 18
        path.addEllipse(in: CGRect(x: rect.minX + (0.75 / source) * rect.width, y: rect.minY + (0.75 / source) * rect.height, width: (14.2222 / source) * rect.width, height: (14.2222 / source) * rect.height))
        path.move(to: point(16.75, 16.75, in: rect, source: source))
        path.addLine(to: point(12.8833, 12.8833, in: rect, source: source))
        return path
    }
}

private struct RequestsFilterIcon: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let sourceWidth: CGFloat = 19
        let sourceHeight: CGFloat = 15
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: rect.minX + (x / sourceWidth) * rect.width, y: rect.minY + (y / sourceHeight) * rect.height) }
        path.move(to: p(2.5, 15.0001)); path.addLine(to: p(2.5, 9.16675))
        path.move(to: p(2.5, 5.83333)); path.addLine(to: p(2.5, 0))
        path.move(to: p(9.16667, 15)); path.addLine(to: p(9.16667, 7.5))
        path.move(to: p(9.16667, 4.16667)); path.addLine(to: p(9.16667, 0))
        path.move(to: p(15.8333, 14.9999)); path.addLine(to: p(15.8333, 10.8333))
        path.move(to: p(15.8333, 7.5)); path.addLine(to: p(15.8333, 0))
        path.move(to: p(0, 9.16675)); path.addLine(to: p(5, 9.16675))
        path.move(to: p(6.66667, 4.16675)); path.addLine(to: p(11.6667, 4.16675))
        path.move(to: p(13.3333, 10.8333)); path.addLine(to: p(18.3333, 10.8333))
        return path
    }
}

private struct RequestsBackIcon: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.maxX, y: rect.midY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.midY))
        path.move(to: CGPoint(x: rect.minX + rect.width * 0.38, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.midY))
        path.addLine(to: CGPoint(x: rect.minX + rect.width * 0.38, y: rect.maxY))
        return path
    }
}

private struct RequestsCornerArrowIcon: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
        path.move(to: CGPoint(x: rect.maxX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX + rect.width * 0.15, y: rect.minY + rect.height * 0.15))
        return path
    }
}

private struct RequestsChevronIcon: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let source: CGFloat = 32
        path.move(to: point(12, 24, in: rect, source: source))
        path.addLine(to: point(20, 16, in: rect, source: source))
        path.addLine(to: point(12, 8, in: rect, source: source))
        return path
    }
}

private struct RequestsBellIcon: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let source: CGFloat = 10
        path.move(to: point(5.72083, 8.75016, in: rect, source: source))
        path.addCurve(to: point(4.27916, 8.75016, in: rect, source: source), control1: point(5.42, 9.27, in: rect, source: source), control2: point(4.58, 9.27, in: rect, source: source))
        path.move(to: point(9.16666, 7.0835, in: rect, source: source))
        path.addLine(to: point(0.833328, 7.0835, in: rect, source: source))
        path.addCurve(to: point(2.08333, 5.8335, in: rect, source: source), control1: point(1.16485, 7.0835, in: rect, source: source), control2: point(2.08333, 6.16502, in: rect, source: source))
        path.addLine(to: point(2.08333, 3.75016, in: rect, source: source))
        path.addCurve(to: point(7.91666, 3.75016, in: rect, source: source), control1: point(2.08333, 0.833496, in: rect, source: source), control2: point(7.91666, 0.833496, in: rect, source: source))
        path.addLine(to: point(7.91666, 5.8335, in: rect, source: source))
        path.addCurve(to: point(9.16666, 7.0835, in: rect, source: source), control1: point(7.91666, 6.16502, in: rect, source: source), control2: point(8.83514, 7.0835, in: rect, source: source))
        return path
    }
}

private struct RequestsToolbarIcon: Shape {
    enum Kind { case home, file, mail }
    let kind: Kind

    func path(in rect: CGRect) -> Path {
        switch kind {
        case .home: homePath(in: rect)
        case .file: filePath(in: rect)
        case .mail: mailPath(in: rect)
        }
    }

    private func filePath(in rect: CGRect) -> Path {
        var path = Path()
        let source: CGFloat = 25
        path.move(to: point(13.5417, 2.08325, in: rect, source: source))
        path.addLine(to: point(6.25001, 2.08325, in: rect, source: source))
        path.addCurve(to: point(4.16667, 4.16659, in: rect, source: source), control1: point(5.10493, 2.08325, in: rect, source: source), control2: point(4.16667, 3.02151, in: rect, source: source))
        path.addLine(to: point(4.16667, 20.8333, in: rect, source: source))
        path.addCurve(to: point(6.25001, 22.9166, in: rect, source: source), control1: point(4.16667, 21.9791, in: rect, source: source), control2: point(5.10417, 22.9166, in: rect, source: source))
        path.addLine(to: point(18.75, 22.9166, in: rect, source: source))
        path.addCurve(to: point(20.8333, 20.8333, in: rect, source: source), control1: point(19.8951, 22.9166, in: rect, source: source), control2: point(20.8333, 21.9784, in: rect, source: source))
        path.addLine(to: point(20.8333, 9.37492, in: rect, source: source))
        path.addLine(to: point(13.5417, 2.08325, in: rect, source: source))
        path.closeSubpath()
        path.move(to: point(13.5417, 3.125, in: rect, source: source))
        path.addLine(to: point(13.5417, 9.375, in: rect, source: source))
        path.addLine(to: point(19.7917, 9.375, in: rect, source: source))
        return path
    }

    private func homePath(in rect: CGRect) -> Path {
        var path = Path()
        let source: CGFloat = 25
        path.move(to: point(3.125, 9.37492, in: rect, source: source))
        path.addLine(to: point(12.5, 2.08325, in: rect, source: source))
        path.addLine(to: point(21.875, 9.37492, in: rect, source: source))
        path.addLine(to: point(21.875, 20.8333, in: rect, source: source))
        path.addCurve(to: point(19.7917, 22.9166, in: rect, source: source), control1: point(21.875, 21.9784, in: rect, source: source), control2: point(20.9368, 22.9166, in: rect, source: source))
        path.addLine(to: point(5.20833, 22.9166, in: rect, source: source))
        path.addCurve(to: point(3.125, 20.8333, in: rect, source: source), control1: point(4.06318, 22.9166, in: rect, source: source), control2: point(3.125, 21.9784, in: rect, source: source))
        path.addLine(to: point(3.125, 9.37492, in: rect, source: source))
        path.closeSubpath()
        path.move(to: point(9.375, 22.9167, in: rect, source: source))
        path.addLine(to: point(9.375, 12.5, in: rect, source: source))
        path.addLine(to: point(15.625, 12.5, in: rect, source: source))
        path.addLine(to: point(15.625, 22.9167, in: rect, source: source))
        return path
    }

    private func mailPath(in rect: CGRect) -> Path {
        var path = Path()
        let source: CGFloat = 25
        path.move(to: point(4.16666, 4.16675, in: rect, source: source))
        path.addLine(to: point(20.8333, 4.16675, in: rect, source: source))
        path.addCurve(to: point(22.9167, 6.25008, in: rect, source: source), control1: point(21.9792, 4.16675, in: rect, source: source), control2: point(22.9167, 5.10425, in: rect, source: source))
        path.addLine(to: point(22.9167, 18.7501, in: rect, source: source))
        path.addCurve(to: point(20.8333, 20.8334, in: rect, source: source), control1: point(22.9167, 19.8959, in: rect, source: source), control2: point(21.9792, 20.8334, in: rect, source: source))
        path.addLine(to: point(4.16666, 20.8334, in: rect, source: source))
        path.addCurve(to: point(2.08333, 18.7501, in: rect, source: source), control1: point(3.02083, 20.8334, in: rect, source: source), control2: point(2.08333, 19.8959, in: rect, source: source))
        path.addLine(to: point(2.08333, 6.25008, in: rect, source: source))
        path.addCurve(to: point(4.16666, 4.16675, in: rect, source: source), control1: point(2.08333, 5.10425, in: rect, source: source), control2: point(3.02083, 4.16675, in: rect, source: source))
        path.closeSubpath()
        path.move(to: point(22.9167, 6.25, in: rect, source: source))
        path.addLine(to: point(12.5, 13.5417, in: rect, source: source))
        path.addLine(to: point(2.08333, 6.25, in: rect, source: source))
        return path
    }
}

private func point(_ x: CGFloat, _ y: CGFloat, in rect: CGRect, source: CGFloat) -> CGPoint {
    CGPoint(x: rect.minX + (x / source) * rect.width, y: rect.minY + (y / source) * rect.height)
}

#Preview {
    NavigationStack {
        RequestsView(
            session: nil,
            selectedTab: .constant(.requests),
            viewModel: RequestsViewModel(apiClient: MockRequestsAPIClient()),
            onOpenDocument: { _ in }
        )
    }
}
