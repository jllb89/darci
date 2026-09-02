import SwiftUI

struct DocumentsView: View {
    private let designSize = CGSize(width: 440, height: 956)
    private let session: AuthSession?
    private let refreshSession: () async -> AuthSession?
    private let onDocumentSelected: (DocumentsListItem) -> Void

    @Binding private var selectedTab: AppTab
    @StateObject private var viewModel: DocumentsViewModel
    @State private var selectedCategory: DocumentsCategory?
    @State private var isFilterPresented = false
    @State private var isSearchPresented = false
    @State private var searchOrigin = DocumentsSearchOrigin.overview
    @State private var overviewScrollResetID = UUID()
    @State private var categoryScrollResetID = UUID()
    @Namespace private var searchTransitionNamespace

    init(
        session: AuthSession?,
        selectedTab: Binding<AppTab>,
        viewModel: DocumentsViewModel = DocumentsViewModel(),
        refreshSession: @escaping () async -> AuthSession? = { nil },
        onDocumentSelected: @escaping (DocumentsListItem) -> Void = { _ in }
    ) {
        self.session = session
        self.refreshSession = refreshSession
        self.onDocumentSelected = onDocumentSelected
        _selectedTab = selectedTab
        _viewModel = StateObject(wrappedValue: viewModel)
    }

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .top) {
                if isSearchPresented {
                    DocumentsSearchView(
                        viewModel: viewModel,
                        origin: searchOrigin,
                        searchNamespace: searchTransitionNamespace,
                        onBack: hideSearch,
                        onDocumentSelected: openSearchResult
                    )
                    .transition(.opacity)
                    .zIndex(3)
                } else if isFilterPresented {
                    DocumentsFilterView(
                        viewModel: viewModel,
                        onBack: hideFilter,
                        onApply: hideFilter
                    )
                    .transition(.opacity)
                    .zIndex(2)
                } else if let selectedCategory {
                    DocumentsCategoryDetailView(
                        category: selectedCategory,
                        viewModel: viewModel,
                        selectedTab: $selectedTab,
                        scrollResetID: categoryScrollResetID,
                        onSearch: showSearch,
                        onFilter: showFilter,
                        onClearFilters: clearFilters,
                        searchNamespace: searchTransitionNamespace,
                        onBack: showOverview,
                        onDocumentSelected: onDocumentSelected
                    )
                    .transition(.opacity)
                    .zIndex(1)
                } else {
                    documentsOverview(in: proxy)
                        .transition(.opacity)
                        .zIndex(0)
                }
            }
            .animation(.easeInOut(duration: 0.38), value: selectedCategory)
            .animation(.easeInOut(duration: 0.38), value: isFilterPresented)
            .animation(.easeInOut(duration: 0.38), value: isSearchPresented)
            .safeAreaInset(edge: .bottom) {
                if isFilterPresented == false && isSearchPresented == false {
                    DocumentsBottomToolbar(selectedTab: $selectedTab)
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
            await viewModel.load(session: session, refreshSession: refreshSession)
        }
        .refreshable {
            await viewModel.load(session: session, refreshSession: refreshSession)
        }
    }

    private func documentsOverview(in proxy: GeometryProxy) -> some View {
        ZStack(alignment: .top) {
            ScrollView(showsIndicators: false) {
                documentsContent(in: proxy)
                    .padding(.top, scaled(105, in: proxy))
                    .padding(.bottom, scaled(88, in: proxy))
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(Color.white.ignoresSafeArea())

            DocumentsTopBar(
                title: "Documents",
                showsBackButton: false,
                showsClearButton: viewModel.filters.isActive,
                onBack: {},
                onSearch: showSearch,
                onFilter: showFilter,
                onClearFilters: clearFilters,
                searchNamespace: searchTransitionNamespace
            )
                .padding(.top, scaled(42, in: proxy))
                .padding(.horizontal, scaled(58, in: proxy))
                .padding(.bottom, scaled(12, in: proxy))
                .background(Color.white)
        }
    }

    @ViewBuilder
    private func documentsContent(in proxy: GeometryProxy) -> some View {
        if viewModel.isLoading && viewModel.documents.isEmpty {
            ProgressView()
                .tint(.black)
                .frame(maxWidth: .infinity, minHeight: scaled(260, in: proxy))
        } else if let errorMessage = viewModel.errorMessage, viewModel.documents.isEmpty {
            DocumentsStatusMessage(text: errorMessage)
                .padding(.horizontal, scaled(33, in: proxy))
        } else if viewModel.sortedDocuments.isEmpty {
            DocumentsStatusMessage(text: "No documents yet.")
                .padding(.horizontal, scaled(33, in: proxy))
        } else {
            VStack(alignment: .leading, spacing: scaled(34, in: proxy)) {
                ForEach(viewModel.overviewCategories()) { category in
                    let documents = viewModel.documents(for: category)
                    if documents.isEmpty == false {
                        DocumentsCategoryRow(
                            category: category,
                            documents: documents,
                            cardWidth: cardWidth(in: proxy),
                            scrollResetID: overviewScrollResetID,
                            onViewAll: showCategory,
                            onDocumentSelected: onDocumentSelected
                        )
                    }
                }
            }
        }
    }

    private func scaled(_ value: CGFloat, in proxy: GeometryProxy) -> CGFloat {
        value * min(proxy.size.width / designSize.width, 1.08)
    }

    private func cardWidth(in proxy: GeometryProxy) -> CGFloat {
        min(max(proxy.size.width * 0.616, 250), 286)
    }

    private func showCategory(_ category: DocumentsCategory) {
        categoryScrollResetID = UUID()
        selectedCategory = category
    }

    private func showOverview() {
        overviewScrollResetID = UUID()
        selectedCategory = nil
    }

    private func showFilter() {
        isFilterPresented = true
    }

    private func hideFilter() {
        isFilterPresented = false
        overviewScrollResetID = UUID()
        categoryScrollResetID = UUID()
    }

    private func clearFilters() {
        viewModel.clearFilters()
        overviewScrollResetID = UUID()
        categoryScrollResetID = UUID()
    }

    private func showSearch() {
        searchOrigin = selectedCategory == nil ? .overview : .category
        isSearchPresented = true
    }

    private func hideSearch() {
        isSearchPresented = false
    }

    private func openSearchResult(_ document: DocumentsListItem) {
        isSearchPresented = false
        onDocumentSelected(document)
    }
}

private enum DocumentsSearchOrigin {
    case overview
    case category

    func horizontalPadding(in proxy: GeometryProxy, scaled: (CGFloat, GeometryProxy) -> CGFloat) -> CGFloat {
        switch self {
        case .overview:
            scaled(12, proxy)
        case .category:
            scaled(27, proxy)
        }
    }

    func headerSpacing(in proxy: GeometryProxy, scaled: (CGFloat, GeometryProxy) -> CGFloat) -> CGFloat {
        switch self {
        case .overview:
            scaled(22, proxy)
        case .category:
            scaled(22, proxy)
        }
    }
}

private enum DocumentsSearchTransition {
    static let iconID = "documents-search-icon"
}

private struct DocumentsCategoryDetailView: View {
    private let designSize = CGSize(width: 440, height: 956)
    let category: DocumentsCategory
    @ObservedObject var viewModel: DocumentsViewModel
    @Binding var selectedTab: AppTab
    let scrollResetID: UUID
    let onSearch: () -> Void
    let onFilter: () -> Void
    let onClearFilters: () -> Void
    let searchNamespace: Namespace.ID
    let onBack: () -> Void
    let onDocumentSelected: (DocumentsListItem) -> Void

    var body: some View {
        GeometryReader { proxy in
            let groups = viewModel.dateGroups(for: category)

            ZStack(alignment: .top) {
                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 0) {
                        if groups.isEmpty {
                            DocumentsStatusMessage(text: "No documents in this category yet.")
                                .padding(.top, scaled(130, in: proxy))
                                .padding(.horizontal, scaled(33, in: proxy))
                        } else {
                            VStack(alignment: .leading, spacing: scaled(34, in: proxy)) {
                                ForEach(groups) { group in
                                    DocumentsDateGroupRow(
                                        group: group,
                                        cardWidth: cardWidth(in: proxy),
                                        scrollResetID: scrollResetID,
                                        onDocumentSelected: onDocumentSelected
                                    )
                                }
                            }
                            .padding(.top, scaled(105, in: proxy))
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.bottom, scaled(88, in: proxy))
                }
                .background(Color.white.ignoresSafeArea())

                DocumentsTopBar(
                    title: category.title,
                    showsBackButton: true,
                    showsClearButton: viewModel.filters.isActive,
                    onBack: onBack,
                    onSearch: onSearch,
                    onFilter: onFilter,
                    onClearFilters: onClearFilters,
                    searchNamespace: searchNamespace
                )
                .padding(.top, scaled(42, in: proxy))
                .padding(.horizontal, scaled(27, in: proxy))
                .padding(.bottom, scaled(12, in: proxy))
                .background(Color.white)
            }
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .navigationBar)
    }

    private func scaled(_ value: CGFloat, in proxy: GeometryProxy) -> CGFloat {
        value * min(proxy.size.width / designSize.width, 1.08)
    }

    private func cardWidth(in proxy: GeometryProxy) -> CGFloat {
        min(max(proxy.size.width * 0.616, 250), 286)
    }
}

private struct DocumentsTopBar: View {
    let title: String
    let showsBackButton: Bool
    let showsClearButton: Bool
    let onBack: () -> Void
    let onSearch: () -> Void
    let onFilter: () -> Void
    let onClearFilters: () -> Void
    let searchNamespace: Namespace.ID

    init(
        title: String,
        showsBackButton: Bool,
        showsClearButton: Bool = false,
        onBack: @escaping () -> Void,
        onSearch: @escaping () -> Void = {},
        onFilter: @escaping () -> Void = {},
        onClearFilters: @escaping () -> Void = {},
        searchNamespace: Namespace.ID
    ) {
        self.title = title
        self.showsBackButton = showsBackButton
        self.showsClearButton = showsClearButton
        self.onBack = onBack
        self.onSearch = onSearch
        self.onFilter = onFilter
        self.onClearFilters = onClearFilters
        self.searchNamespace = searchNamespace
    }

    var body: some View {
        HStack(spacing: 22) {
            if showsBackButton {
                Button(action: onBack) {
                    DocumentsBackIcon()
                        .stroke(.black, style: StrokeStyle(lineWidth: 1.8, lineCap: .square, lineJoin: .miter))
                        .frame(width: 18, height: 18)
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Back")
            }

            Button(action: onSearch) {
                HStack(spacing: 22) {
                    DocumentsSearchIcon()
                        .stroke(.black, style: StrokeStyle(lineWidth: 1.5, lineCap: .butt, lineJoin: .miter))
                        .frame(width: 18, height: 18)
                        .matchedGeometryEffect(id: DocumentsSearchTransition.iconID, in: searchNamespace)

                    Text(title)
                        .font(DARCiFont.maisonNeue(.book, size: 15))
                        .lineSpacing(15)
                        .foregroundStyle(Color(red: 0.67, green: 0.67, blue: 0.67).opacity(0.61))
                        .lineLimit(1)
                        .minimumScaleFactor(0.72)
                }
            }
            .buttonStyle(.plain)
            .frame(minHeight: 44)
            .accessibilityLabel("Search documents")

            Spacer(minLength: 0)

            if showsClearButton {
                Button(action: onClearFilters) {
                    Text("Clear")
                        .font(DARCiFont.maisonNeue(.book, size: 10))
                        .lineSpacing(10)
                        .foregroundStyle(Color.black.opacity(0.55))
                }
                .buttonStyle(.plain)
                .frame(minWidth: 44, minHeight: 44)
                .transition(.opacity)
            }

            Button(action: onFilter) {
                DocumentsFilterIcon()
                    .stroke(.black, style: StrokeStyle(lineWidth: 1.5, lineCap: .butt, lineJoin: .miter))
                    .frame(width: 19, height: 15)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Filter documents")
        }
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .center)
    }
}

private struct DocumentsFilterView: View {
    private let designSize = CGSize(width: 440, height: 956)
    @ObservedObject var viewModel: DocumentsViewModel
    let onBack: () -> Void
    let onApply: () -> Void
    @State private var expandedSection: DocumentsFilterSection?
    @State private var revealedSections: Set<DocumentsFilterSection> = []

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .top) {
                DARCiTheme.onboardingGreen.ignoresSafeArea()

                VStack(alignment: .leading, spacing: 0) {
                    ScrollView(showsIndicators: true) {
                        VStack(alignment: .leading, spacing: 0) {
                            Button(action: onBack) {
                                DocumentsBackIcon()
                                    .stroke(.black, style: StrokeStyle(lineWidth: 1.8, lineCap: .square, lineJoin: .miter))
                                    .frame(width: scaled(18, in: proxy), height: scaled(18, in: proxy))
                                    .frame(width: 44, height: 44)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Back")
                            .padding(.top, scaled(67, in: proxy))

                            HStack(spacing: scaled(15, in: proxy)) {
                                DocumentsFilterIcon()
                                    .stroke(.black, style: StrokeStyle(lineWidth: 1.7, lineCap: .butt, lineJoin: .miter))
                                    .frame(width: scaled(22, in: proxy), height: scaled(18, in: proxy))

                                Text("Filter")
                                    .font(DARCiFont.maisonNeue(.medium, size: scaled(24, in: proxy)))
                                    .tracking(0.24)
                                    .lineSpacing(28.8)
                                    .foregroundStyle(.black)
                            }
                            .padding(.top, scaled(60, in: proxy))

                            VStack(alignment: .leading, spacing: 0) {
                                ForEach(DocumentsFilterSection.allCases) { section in
                                    DocumentsFilterSectionRow(
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
                            DocumentsCornerArrowIcon()
                                .stroke(.white, style: StrokeStyle(lineWidth: 2, lineCap: .square, lineJoin: .miter))
                                .frame(width: scaled(18, in: proxy), height: scaled(18, in: proxy))

                            Text("Apply")
                                .font(DARCiFont.maisonNeue(.book, size: scaled(22, in: proxy)))
                                .lineSpacing(24)
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
    private func filterOptions(for section: DocumentsFilterSection) -> some View {
        switch section {
        case .documentType:
            DocumentsFilterChipGrid {
                ForEach(viewModel.documentTypeFilterOptions, id: \.self) { kind in
                    DocumentsFilterChip(
                        title: kind.filterTitle,
                        isSelected: viewModel.filters.productKinds.contains(kind)
                    ) {
                        toggle(kind, in: &viewModel.filters.productKinds)
                    }
                }
            }
        case .status:
            DocumentsFilterChipGrid {
                ForEach(viewModel.statusFilterOptions, id: \.self) { status in
                    DocumentsFilterChip(
                        title: status.capitalized,
                        isSelected: viewModel.filters.statusLabels.contains(status)
                    ) {
                        toggle(status, in: &viewModel.filters.statusLabels)
                    }
                }
            }
        case .jurisdiction:
            DocumentsFilterChipGrid {
                ForEach(viewModel.jurisdictionFilterOptions, id: \.self) { jurisdiction in
                    DocumentsFilterChip(
                        title: jurisdiction,
                        isSelected: viewModel.filters.jurisdictions.contains(jurisdiction)
                    ) {
                        toggle(jurisdiction, in: &viewModel.filters.jurisdictions)
                    }
                }
            }
        case .createdFrom:
            DocumentsFilterChipGrid {
                ForEach(DocumentsCreatedFromFilter.allCases) { createdFrom in
                    DocumentsFilterChip(
                        title: createdFrom.title,
                        isSelected: viewModel.filters.createdFrom == createdFrom
                    ) {
                        viewModel.filters.createdFrom = viewModel.filters.createdFrom == createdFrom ? nil : createdFrom
                    }
                }
            }
        }
    }

    private func summary(for section: DocumentsFilterSection) -> String? {
        switch section {
        case .documentType:
            return summaryText(viewModel.filters.productKinds.map(\.filterTitle))
        case .status:
            return summaryText(viewModel.filters.statusLabels.map { $0.capitalized })
        case .jurisdiction:
            return summaryText(Array(viewModel.filters.jurisdictions))
        case .createdFrom:
            return viewModel.filters.createdFrom?.title
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
        for section in DocumentsFilterSection.allCases {
            DispatchQueue.main.asyncAfter(deadline: .now() + Double(section.index) * 0.055) {
                revealedSections.insert(section)
            }
        }
    }

    private func scaled(_ value: CGFloat, in proxy: GeometryProxy) -> CGFloat {
        value * min(proxy.size.width / designSize.width, 1.08)
    }
}

private enum DocumentsFilterSection: String, CaseIterable, Identifiable {
    case documentType
    case status
    case jurisdiction
    case createdFrom

    var id: String { rawValue }

    var title: String {
        switch self {
        case .documentType:
            "Document type"
        case .status:
            "Status"
        case .jurisdiction:
            "Jurisdiction"
        case .createdFrom:
            "Created from"
        }
    }

    var index: Int {
        Self.allCases.firstIndex(of: self) ?? 0
    }
}

private struct DocumentsSearchView: View {
    private let designSize = CGSize(width: 440, height: 956)
    @ObservedObject var viewModel: DocumentsViewModel
    let origin: DocumentsSearchOrigin
    let searchNamespace: Namespace.ID
    let onBack: () -> Void
    let onDocumentSelected: (DocumentsListItem) -> Void
    @State private var query = ""
    @FocusState private var isSearchFocused: Bool

    private var results: [DocumentsSearchResult] {
        viewModel.searchResults(for: query)
    }

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .topLeading) {
                Color.black.ignoresSafeArea()

                VStack(alignment: .leading, spacing: 0) {
                    searchHeader(in: proxy)
                        .padding(.top, scaled(42, in: proxy))

                    if query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false {
                        ScrollView(showsIndicators: true) {
                            searchResults(in: proxy)
                                .padding(.top, scaled(76, in: proxy))
                                .padding(.bottom, scaled(80, in: proxy))
                        }
                        .scrollDismissesKeyboard(.interactively)
                        .transition(.opacity)
                    }

                    Spacer(minLength: 0)
                }
                .padding(.horizontal, origin.horizontalPadding(in: proxy, scaled: scaled))
            }
            .onAppear {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.22) {
                    isSearchFocused = true
                }
            }
        }
    }

    private func searchHeader(in proxy: GeometryProxy) -> some View {
        HStack(spacing: origin.headerSpacing(in: proxy, scaled: scaled)) {
            Button(action: onBack) {
                DocumentsBackIcon()
                    .stroke(.white, style: StrokeStyle(lineWidth: 1.8, lineCap: .square, lineJoin: .miter))
                    .frame(width: scaled(18, in: proxy), height: scaled(18, in: proxy))
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Back")

            HStack(spacing: scaled(22, in: proxy)) {
                DocumentsSearchIcon()
                    .stroke(.white, style: StrokeStyle(lineWidth: 1.5, lineCap: .butt, lineJoin: .miter))
                    .frame(width: scaled(18, in: proxy), height: scaled(18, in: proxy))
                    .matchedGeometryEffect(id: DocumentsSearchTransition.iconID, in: searchNamespace)

                TextField("Search", text: $query)
                    .font(DARCiFont.maisonNeue(.book, size: 15))
                    .lineSpacing(15)
                    .foregroundStyle(.white)
                    .tint(.white)
                    .focused($isSearchFocused)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }
            .padding(.leading, 0)
            .padding(.trailing, scaled(9, in: proxy))
            .frame(height: scaled(query.isEmpty ? 34 : 34, in: proxy))
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(query.isEmpty ? Color.clear : Color(red: 0.10, green: 0.10, blue: 0.10))
            .overlay(alignment: .bottom) {
                Rectangle()
                    .fill(query.isEmpty ? Color.clear : .white)
                    .frame(height: 0.5)
            }
        }
    }

    private func searchResults(in proxy: GeometryProxy) -> some View {
        VStack(alignment: .leading, spacing: scaled(31, in: proxy)) {
            Text("Results:")
                .font(DARCiFont.maisonNeue(.medium, size: 12))
                .lineSpacing(12)
                .foregroundStyle(.white)
                .padding(.leading, scaled(10, in: proxy))

            if results.isEmpty {
                Text("No results")
                    .font(DARCiFont.maisonNeue(.book, size: 12))
                    .lineSpacing(12)
                    .foregroundStyle(Color.white.opacity(0.45))
                    .padding(.leading, scaled(10, in: proxy))
            } else {
                VStack(alignment: .leading, spacing: scaled(28, in: proxy)) {
                    ForEach(results) { result in
                        Button {
                            onDocumentSelected(result.document)
                        } label: {
                            VStack(alignment: .leading, spacing: scaled(18, in: proxy)) {
                                DocumentsSearchResultCard(document: result.document)
                                    .frame(width: scaled(271, in: proxy), height: scaled(72, in: proxy))

                                Text("\u{201c}\(result.query)\u{201d} \u{2013} \(result.fieldLabel): \(result.matchedValue)")
                                    .font(DARCiFont.maisonNeue(.medium, size: 12))
                                    .lineSpacing(12)
                                    .foregroundStyle(.white)
                                    .lineLimit(2)
                                    .multilineTextAlignment(.leading)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.leading, scaled(8, in: proxy))
            }
        }
    }

    private func scaled(_ value: CGFloat, in proxy: GeometryProxy) -> CGFloat {
        value * min(proxy.size.width / designSize.width, 1.08)
    }
}

private struct DocumentsSearchResultCard: View {
    let document: DocumentsListItem

    private var phase: DocumentsPhaseDisplay {
        DocumentsDisplay.phase(for: document)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text(documentTitle)
                    .font(DARCiFont.maisonNeue(.book, size: 11))
                    .lineSpacing(14.3)
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.74)

                Spacer(minLength: 8)

                Text(phase.label)
                    .font(DARCiFont.maisonNeue(.book, size: 5))
                    .lineSpacing(6.5)
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }

            HStack(spacing: 3.5) {
                ForEach(0..<5, id: \.self) { index in
                    Rectangle()
                        .fill(index < phase.completedSegmentCount ? DARCiTheme.onboardingGreen : Color(red: 0.17, green: 0.17, blue: 0.17))
                        .frame(height: 2)
                }
            }
            .padding(.top, 14)

            Text(documentMetaLabel)
                .font(DARCiFont.maisonNeue(.book, size: 7))
                .lineSpacing(9.1)
                .foregroundStyle(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.68)
                .padding(.top, 13)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 13)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Color(red: 0.08, green: 0.08, blue: 0.08))
        .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
    }

    private var documentTitle: String {
        let product = DocumentsDisplay.productLabel(for: document)
        let jurisdiction = DocumentsDisplay.normalizedJurisdiction(document.jurisdiction)
        return jurisdiction.isEmpty ? product : "\(product) \u{2013} \(jurisdiction)"
    }

    private var documentMetaLabel: String {
        let idLabel: String
        if let idn = document.idn, idn.isEmpty == false {
            idLabel = idn
        } else {
            idLabel = "DOC-\(document.id.prefix(8).uppercased())"
        }

        if let principalName = DocumentsDisplay.principalName(for: document), principalName.isEmpty == false {
            return "\(idLabel) | PRINCIPAL: \(principalName.uppercased())"
        }

        return idLabel
    }
}

private struct DocumentsFilterSectionRow<Content: View>: View {
    let section: DocumentsFilterSection
    let isExpanded: Bool
    let summary: String?
    @ViewBuilder let content: () -> Content
    let onTap: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Rectangle()
                .fill(Color.black.opacity(0.18))
                .frame(height: 0.5)

            Button(action: onTap) {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(section.title)
                            .font(DARCiFont.maisonNeue(.book, size: 18))
                            .lineSpacing(19.8)
                            .foregroundStyle(.black)

                        if let summary {
                            Text(summary)
                                .font(DARCiFont.maisonNeue(.book, size: 11))
                                .lineSpacing(12)
                                .foregroundStyle(Color.black.opacity(0.55))
                                .lineLimit(1)
                        }
                    }

                    Spacer(minLength: 0)

                    DocumentsChevronIcon()
                        .stroke(.black, style: StrokeStyle(lineWidth: 2, lineCap: .butt, lineJoin: .miter))
                        .frame(width: 32, height: 32)
                        .rotationEffect(.degrees(isExpanded ? 90 : 0))
                        .animation(.timingCurve(0.16, 1.0, 0.3, 1.0, duration: 0.34), value: isExpanded)
                }
                .frame(minHeight: 46, alignment: .center)
            }
            .buttonStyle(.plain)

            content()
                .padding(.top, 3)
                .padding(.bottom, 14)
                .opacity(isExpanded ? 1 : 0)
                .scaleEffect(y: isExpanded ? 1 : 0.94, anchor: .top)
                .frame(maxHeight: isExpanded ? nil : 0, alignment: .top)
                .clipped()
                .allowsHitTesting(isExpanded)
        }
        .animation(.timingCurve(0.16, 1.0, 0.3, 1.0, duration: 0.42), value: isExpanded)
    }
}

private struct DocumentsFilterChipGrid<Content: View>: View {
    @ViewBuilder let content: () -> Content

    var body: some View {
        DocumentsFilterFlowLayout(horizontalSpacing: 8, verticalSpacing: 10) {
            content()
        }
    }
}

private struct DocumentsFilterFlowLayout: Layout {
    let horizontalSpacing: CGFloat
    let verticalSpacing: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? 0
        let rows = rows(for: subviews, maxWidth: maxWidth)
        let height = rows.reduce(CGFloat.zero) { total, row in
            total + row.height + (row.index == 0 ? 0 : verticalSpacing)
        }

        return CGSize(width: maxWidth, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var origin = bounds.origin
        for row in rows(for: subviews, maxWidth: bounds.width) {
            origin.x = bounds.minX

            for item in row.items {
                subviews[item.index].place(
                    at: CGPoint(x: origin.x, y: origin.y),
                    anchor: .topLeading,
                    proposal: ProposedViewSize(item.size)
                )
                origin.x += item.size.width + horizontalSpacing
            }

            origin.y += row.height + verticalSpacing
        }
    }

    private func rows(for subviews: Subviews, maxWidth: CGFloat) -> [DocumentsFilterFlowRow] {
        guard subviews.isEmpty == false else { return [] }

        let availableWidth = max(maxWidth, 1)
        var rows: [DocumentsFilterFlowRow] = []
        var currentItems: [DocumentsFilterFlowItem] = []
        var currentWidth: CGFloat = 0
        var currentHeight: CGFloat = 0

        for index in subviews.indices {
            let size = subviews[index].sizeThatFits(.unspecified)
            let itemWidth = min(size.width, availableWidth)
            let itemSize = CGSize(width: itemWidth, height: size.height)
            let nextWidth = currentItems.isEmpty ? itemWidth : currentWidth + horizontalSpacing + itemWidth

            if nextWidth > availableWidth, currentItems.isEmpty == false {
                rows.append(DocumentsFilterFlowRow(index: rows.count, items: currentItems, height: currentHeight))
                currentItems = [DocumentsFilterFlowItem(index: index, size: itemSize)]
                currentWidth = itemWidth
                currentHeight = itemSize.height
            } else {
                currentItems.append(DocumentsFilterFlowItem(index: index, size: itemSize))
                currentWidth = nextWidth
                currentHeight = max(currentHeight, itemSize.height)
            }
        }

        if currentItems.isEmpty == false {
            rows.append(DocumentsFilterFlowRow(index: rows.count, items: currentItems, height: currentHeight))
        }

        return rows
    }
}

private struct DocumentsFilterFlowRow {
    let index: Int
    let items: [DocumentsFilterFlowItem]
    let height: CGFloat
}

private struct DocumentsFilterFlowItem {
    let index: Int
    let size: CGSize
}

private struct DocumentsFilterChip: View {
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

private struct DocumentsCategoryRow: View {
    let category: DocumentsCategory
    let documents: [DocumentsListItem]
    let cardWidth: CGFloat
    let scrollResetID: UUID
    let onViewAll: (DocumentsCategory) -> Void
    let onDocumentSelected: (DocumentsListItem) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .firstTextBaseline) {
                Text(category.title)
                    .font(DARCiFont.maisonNeue(.medium, size: 12))
                    .lineSpacing(12)
                    .foregroundStyle(.black)

                Spacer()

                if documents.count > 1 {
                    Button {
                        onViewAll(category)
                    } label: {
                        HStack(spacing: 9) {
                            Text("View all")
                                .font(DARCiFont.maisonNeue(.book, size: 12))
                                .lineSpacing(12)
                                .foregroundStyle(Color(red: 0.66, green: 0.66, blue: 0.66))

                            DocumentsCornerArrowIcon()
                                .stroke(Color(red: 0.66, green: 0.66, blue: 0.66), style: StrokeStyle(lineWidth: 1.7, lineCap: .square, lineJoin: .miter))
                                .frame(width: 11, height: 11)
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 33)

            DocumentsHorizontalCardStrip(
                documents: documents,
                cardWidth: cardWidth,
                scrollResetID: scrollResetID,
                onDocumentSelected: onDocumentSelected
            )
        }
    }
}

private struct DocumentsDateGroupRow: View {
    let group: DocumentsDateGroup
    let cardWidth: CGFloat
    let scrollResetID: UUID
    let onDocumentSelected: (DocumentsListItem) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text(group.title)
                .font(DARCiFont.maisonNeue(.medium, size: 12))
                .lineSpacing(12)
                .foregroundStyle(.black)
                .padding(.horizontal, 33)

            DocumentsHorizontalCardStrip(
                documents: group.documents,
                cardWidth: cardWidth,
                scrollResetID: scrollResetID,
                onDocumentSelected: onDocumentSelected
            )
        }
    }
}

private struct DocumentsHorizontalCardStrip: View {
    let documents: [DocumentsListItem]
    let cardWidth: CGFloat
    let scrollResetID: UUID
    let onDocumentSelected: (DocumentsListItem) -> Void

    var body: some View {
        ScrollViewReader { scrollProxy in
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 12) {
                    ForEach(documents) { document in
                        Button {
                            onDocumentSelected(document)
                        } label: {
                            DocumentsStatusCard(document: document)
                                .frame(width: cardWidth, height: 72)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .scrollTargetLayout()
                .padding(.horizontal, 33)
            }
            .scrollTargetBehavior(.viewAligned)
            .onAppear {
                resetScroll(scrollProxy)
            }
            .onChange(of: scrollResetID) { _, _ in
                resetScroll(scrollProxy)
            }
        }
    }

    private func resetScroll(_ scrollProxy: ScrollViewProxy) {
        guard let firstID = documents.first?.id else { return }

        scrollProxy.scrollTo(firstID, anchor: .leading)
    }
}

private struct DocumentsStatusCard: View {
    let document: DocumentsListItem
    @State private var segmentProgress: CGFloat = 0

    private var phase: DocumentsPhaseStatus {
        DocumentsPhaseStatus(document: document)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text(documentTitle)
                    .font(DARCiFont.maisonNeue(.book, size: 13))
                    .lineSpacing(16.9)
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.72)

                Spacer(minLength: 8)

                Text(phase.label)
                    .font(DARCiFont.maisonNeue(.book, size: 6.5))
                    .lineSpacing(8.4)
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.72)
            }

            HStack(spacing: 3.5) {
                ForEach(0..<5, id: \.self) { index in
                    GeometryReader { proxy in
                        ZStack(alignment: .leading) {
                            Rectangle()
                                .fill(Color(red: 0.17, green: 0.17, blue: 0.17))

                            Rectangle()
                                .fill(DARCiTheme.onboardingGreen)
                                .frame(width: proxy.size.width * segmentFillProgress(for: index))
                        }
                    }
                    .frame(height: 2)
                }
            }
            .padding(.top, 12)

            Text(documentMetaLabel)
                .font(DARCiFont.maisonNeue(.book, size: 8.5))
                .lineSpacing(11.05)
                .foregroundStyle(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.64)
                .padding(.top, 12)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 13)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Color.black)
        .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
        .onAppear(perform: animateSegments)
        .onChange(of: phase.completedSegmentCount) { _, _ in
            animateSegments()
        }
    }

    private var documentTitle: String {
        let product = DocumentsDisplay.productLabel(for: document)
        let jurisdiction = DocumentsDisplay.normalizedJurisdiction(document.jurisdiction)
        return jurisdiction.isEmpty ? product : "\(product) – \(jurisdiction)"
    }

    private var documentMetaLabel: String {
        let idLabel: String
        if let idn = document.idn, idn.isEmpty == false {
            idLabel = idn
        } else {
            idLabel = "DOC-\(document.id.prefix(8).uppercased())"
        }

        if let principalName = DocumentsDisplay.principalName(for: document), principalName.isEmpty == false {
            return "\(idLabel) | PRINCIPAL: \(principalName.uppercased())"
        }

        return idLabel
    }

    private func segmentFillProgress(for index: Int) -> CGFloat {
        guard phase.completedSegmentCount > 0 else { return 0 }

        if index < phase.completedSegmentCount - 1 {
            return 1
        }

        if index == phase.completedSegmentCount - 1 {
            return segmentProgress
        }

        return 0
    }

    private func animateSegments() {
        segmentProgress = 0
        withAnimation(.timingCurve(0.12, 0.88, 0.25, 1.0, duration: 0.72)) {
            segmentProgress = 1
        }
    }
}

private struct DocumentsPhaseStatus: Equatable {
    let label: String
    let completedSegmentCount: Int

    init(document: DocumentsListItem) {
        let phase = DocumentsDisplay.phase(for: document)
        label = phase.label
        completedSegmentCount = phase.completedSegmentCount
    }
}

private struct DocumentsStatusMessage: View {
    let text: String

    var body: some View {
        Text(text)
            .font(DARCiFont.maisonNeue(.book, size: 12))
            .lineSpacing(5)
            .foregroundStyle(Color(red: 0.49, green: 0.49, blue: 0.49))
            .frame(maxWidth: .infinity, minHeight: 160, alignment: .center)
            .multilineTextAlignment(.center)
    }
}

private struct DocumentsBottomToolbar: View {
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

    private func toolbarButton(tab: AppTab, icon: DocumentsToolbarIcon.Kind) -> some View {
        Button {
            selectedTab = tab
        } label: {
            DocumentsToolbarIcon(kind: icon)
                .stroke(selectedTab == tab ? DARCiTheme.onboardingGreen : .black, style: StrokeStyle(lineWidth: 2.0625, lineCap: .butt, lineJoin: .miter))
                .frame(width: 25, height: 25)
                .frame(width: 44, height: 44)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(tab.title)
    }
}

private struct DocumentsSearchIcon: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let source: CGFloat = 18

        path.addEllipse(in: CGRect(
            x: rect.minX + (0.75 / source) * rect.width,
            y: rect.minY + (0.75 / source) * rect.height,
            width: (14.2222 / source) * rect.width,
            height: (14.2222 / source) * rect.height
        ))
        path.move(to: point(16.75, 16.75, in: rect, source: source))
        path.addLine(to: point(12.8833, 12.8833, in: rect, source: source))

        return path
    }
}

private struct DocumentsFilterIcon: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let sourceWidth: CGFloat = 19
        let sourceHeight: CGFloat = 15

        func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: rect.minX + (x / sourceWidth) * rect.width, y: rect.minY + (y / sourceHeight) * rect.height)
        }

        path.move(to: point(2.5, 15.0001)); path.addLine(to: point(2.5, 9.16675))
        path.move(to: point(2.5, 5.83333)); path.addLine(to: point(2.5, 0))
        path.move(to: point(9.16667, 15)); path.addLine(to: point(9.16667, 7.5))
        path.move(to: point(9.16667, 4.16667)); path.addLine(to: point(9.16667, 0))
        path.move(to: point(15.8333, 14.9999)); path.addLine(to: point(15.8333, 10.8333))
        path.move(to: point(15.8333, 7.5)); path.addLine(to: point(15.8333, 0))
        path.move(to: point(0, 9.16675)); path.addLine(to: point(5, 9.16675))
        path.move(to: point(6.66667, 4.16675)); path.addLine(to: point(11.6667, 4.16675))
        path.move(to: point(13.3333, 10.8333)); path.addLine(to: point(18.3333, 10.8333))

        return path
    }
}

private struct DocumentsBackIcon: Shape {
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

private struct DocumentsCornerArrowIcon: Shape {
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

private struct DocumentsChevronIcon: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let source: CGFloat = 32

        func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: rect.minX + (x / source) * rect.width, y: rect.minY + (y / source) * rect.height)
        }

        path.move(to: point(12, 24))
        path.addLine(to: point(20, 16))
        path.addLine(to: point(12, 8))
        return path
    }
}

private struct DocumentsToolbarIcon: Shape {
    enum Kind {
        case home
        case file
        case mail
    }

    let kind: Kind

    func path(in rect: CGRect) -> Path {
        switch kind {
        case .home:
            homePath(in: rect)
        case .file:
            filePath(in: rect)
        case .mail:
            mailPath(in: rect)
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
        DocumentsView(
            session: nil,
            selectedTab: .constant(.documents),
            viewModel: DocumentsViewModel(apiClient: MockDocumentsAPIClient())
        )
    }
}
