import PhotosUI
import SwiftUI
import UIKit

struct NotaryInformationSettingsView: View {
    private enum Field: String, Hashable {
        case commissionNumber
        case commissionExpiration
    }

    private let designSize = CGSize(width: 440, height: 956)
    private let session: AuthSession?
    private let onBack: () -> Void

    @StateObject private var viewModel: NotaryInformationSettingsViewModel
    @State private var expandedSelectKey: String?
    @State private var signaturePickerItem: PhotosPickerItem?
    @State private var sealPickerItem: PhotosPickerItem?
    @FocusState private var focusedField: Field?

    init(
        session: AuthSession?,
        apiClient: NotaryProfileAPIProviding = NotaryProfileAPIClient(),
        onBack: @escaping () -> Void
    ) {
        self.session = session
        self.onBack = onBack
        _viewModel = StateObject(wrappedValue: NotaryInformationSettingsViewModel(apiClient: apiClient))
    }

    var body: some View {
        GeometryReader { proxy in
            VStack(alignment: .leading, spacing: 0) {
                Button(action: onBack) {
                    DARCiArrowLeftIcon()
                        .stroke(.white, style: StrokeStyle(lineWidth: 2, lineCap: .square, lineJoin: .miter))
                        .frame(width: scaled(21, in: proxy), height: scaled(21, in: proxy))
                        .frame(width: scaled(34, in: proxy), height: scaled(34, in: proxy), alignment: .leading)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Back to user settings")

                Text("Illuminotary Information")
                    .font(DARCiFont.maisonNeue(.book, size: scaled(24, in: proxy)))
                    .lineSpacing(scaled(2.4, in: proxy))
                    .foregroundStyle(.white)
                    .padding(.top, scaled(52, in: proxy))

                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: scaled(33, in: proxy)) {
                        selectField(title: "Jurisdiction", key: "jurisdiction", proxy: proxy)

                        selectField(title: "County or Service Area", key: "serviceArea", proxy: proxy)

                        profileTextField(title: "Commission number", field: .commissionNumber, proxy: proxy) {
                            TextField("", text: $viewModel.commissionNumber)
                                .textInputAutocapitalization(.characters)
                                .autocorrectionDisabled()
                        }

                        profileTextField(title: "Commission expiration", field: .commissionExpiration, proxy: proxy) {
                            TextField("YYYY-MM-DD", text: $viewModel.commissionExpiresAt)
                                .keyboardType(.numberPad)
                                .autocorrectionDisabled()
                                .onChange(of: viewModel.commissionExpiresAt) { _, nextValue in
                                    let formatted = IntakeDateFormatting.formatISODateInput(nextValue)
                                    if formatted != nextValue {
                                        viewModel.commissionExpiresAt = formatted
                                    }
                                }
                        }

                        VStack(alignment: .leading, spacing: scaled(12, in: proxy)) {
                            assetPickerRow(title: "Signature", item: $signaturePickerItem, proxy: proxy)
                                .onChange(of: signaturePickerItem) { _, nextItem in
                                    Task { await viewModel.loadAsset(from: nextItem, kind: .signature) }
                                }

                            assetPickerRow(title: "Notary Seal", item: $sealPickerItem, proxy: proxy)
                                .onChange(of: sealPickerItem) { _, nextItem in
                                    Task { await viewModel.loadAsset(from: nextItem, kind: .seal) }
                                }
                        }
                    }
                    .padding(.top, scaled(46, in: proxy))
                    .padding(.bottom, scaled(28, in: proxy))
                }

                Spacer(minLength: scaled(12, in: proxy))

                if viewModel.isLoading {
                    Text("Loading notary profile...")
                        .font(DARCiFont.maisonNeue(.book, size: scaled(11, in: proxy)))
                        .foregroundStyle(.white.opacity(0.68))
                        .padding(.bottom, scaled(8, in: proxy))
                } else if let statusMessage = viewModel.statusMessage {
                    Text(statusMessage)
                        .font(DARCiFont.maisonNeue(.book, size: scaled(11, in: proxy)))
                        .foregroundStyle(viewModel.statusTone == .success ? DARCiTheme.onboardingGreen : Color(red: 1, green: 0.42, blue: 0.42))
                        .lineLimit(2)
                        .padding(.bottom, scaled(8, in: proxy))
                }

                Button(action: save) {
                    HStack(spacing: scaled(12, in: proxy)) {
                        Spacer(minLength: 0)

                        Text(viewModel.isSaving ? "Saving..." : "Save changes")
                            .font(DARCiFont.maisonNeue(.book, size: scaled(22, in: proxy)))
                            .lineSpacing(scaled(2.2, in: proxy))

                        DARCiArrowCornerIcon()
                            .stroke(.black, style: StrokeStyle(lineWidth: 1.8, lineCap: .square, lineJoin: .miter))
                            .frame(width: scaled(18, in: proxy), height: scaled(18, in: proxy))
                    }
                    .foregroundStyle(.black)
                    .padding(.horizontal, scaled(22, in: proxy))
                    .frame(maxWidth: .infinity, minHeight: scaled(54, in: proxy), maxHeight: scaled(54, in: proxy))
                    .background(viewModel.canSave ? DARCiTheme.onboardingGreen : Color(red: 0.21, green: 0.21, blue: 0.21))
                }
                .buttonStyle(.plain)
                .disabled(viewModel.canSave == false)
                .accessibilityIdentifier("notary-information-save-button")
                .padding(.bottom, scaled(24, in: proxy))
            }
            .padding(.top, scaled(24, in: proxy))
            .padding(.horizontal, scaled(22, in: proxy))
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(Color.black.ignoresSafeArea())
            .clipped()
        }
        .ignoresSafeArea(.keyboard)
        .task { await viewModel.load(session: session) }
        .onChange(of: viewModel.jurisdiction) { _, _ in
            if expandedSelectKey == "serviceArea" {
                expandedSelectKey = nil
            }
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .navigationBar)
    }

    private func selectField(title: String, key: String, proxy: GeometryProxy) -> some View {
        VStack(alignment: .leading, spacing: scaled(10, in: proxy)) {
            Text(title)
                .font(DARCiFont.maisonNeue(.book, size: scaled(12, in: proxy)))
                .lineSpacing(scaled(1.2, in: proxy))
                .foregroundStyle(.white)

            NotarySettingsSelectInput(
                key: key,
                selectedText: selectedText(for: key),
                placeholder: placeholder(for: key),
                options: options(for: key),
                expandedKey: $expandedSelectKey,
                isDisabled: viewModel.isLoading || viewModel.isSaving || options(for: key).isEmpty
            ) { selectedId in
                if key == "jurisdiction" {
                    Task { await viewModel.selectJurisdiction(selectedId, session: session) }
                } else {
                    viewModel.selectServiceArea(selectedId)
                }
                expandedSelectKey = nil
            }
        }
        .zIndex(expandedSelectKey == key ? 1_000 : 0)
    }

    private func profileTextField<Content: View>(
        title: String,
        field: Field,
        proxy: GeometryProxy,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: scaled(10, in: proxy)) {
            Text(title)
                .font(DARCiFont.maisonNeue(.book, size: scaled(12, in: proxy)))
                .lineSpacing(scaled(1.2, in: proxy))
                .foregroundStyle(.white)

            content()
                .font(DARCiFont.maisonNeue(.book, size: scaled(18, in: proxy)))
                .lineSpacing(scaled(1.8, in: proxy))
                .foregroundStyle(.white)
                .tint(.white)
                .focused($focusedField, equals: field)
                .accessibilityIdentifier("notary-information-\(field.rawValue)-field")
                .padding(.horizontal, focusedField == field ? scaled(11, in: proxy) : scaled(10, in: proxy))
                .frame(maxWidth: .infinity, minHeight: scaled(43, in: proxy), maxHeight: scaled(43, in: proxy), alignment: .leading)
                .background(focusedField == field ? Color(red: 0.10, green: 0.10, blue: 0.10) : .clear)
                .overlay(alignment: .bottom) {
                    if focusedField == field {
                        Rectangle()
                            .fill(.white)
                            .frame(height: 1)
                    }
                }
        }
    }

    private func assetPickerRow(title: String, item: Binding<PhotosPickerItem?>, proxy: GeometryProxy) -> some View {
        let fontSize = scaled(13, in: proxy)
        let lineSpacing = scaled(1.3, in: proxy)
        let chevronWidth = scaled(8, in: proxy)
        let chevronHeight = scaled(14, in: proxy)
        let rowHeight = scaled(44, in: proxy)

        return PhotosPicker(selection: item, matching: .images) {
            HStack(spacing: 0) {
                Text(title)
                    .font(DARCiFont.maisonNeue(.book, size: fontSize))
                    .lineSpacing(lineSpacing)
                    .foregroundStyle(.white)

                Spacer(minLength: 0)

                NotarySettingsChevronIcon()
                    .stroke(.white, style: StrokeStyle(lineWidth: 1.7, lineCap: .square, lineJoin: .miter))
                    .frame(width: chevronWidth, height: chevronHeight)
            }
            .frame(height: rowHeight)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(viewModel.isLoading || viewModel.isSaving)
        .accessibilityIdentifier("notary-information-\(title.lowercased().replacingOccurrences(of: " ", with: "-"))-button")
    }

    private func save() {
        focusedField = nil
        expandedSelectKey = nil
        Task { await viewModel.save(session: session) }
    }

    private func selectedText(for key: String) -> String {
        switch key {
        case "jurisdiction":
            return viewModel.jurisdictionLabel
        case "serviceArea":
            return viewModel.serviceAreaLabel
        default:
            return ""
        }
    }

    private func placeholder(for key: String) -> String {
        switch key {
        case "jurisdiction":
            return "Select jurisdiction"
        case "serviceArea":
            return viewModel.isLoadingServiceAreas ? "Loading options..." : "Select one"
        default:
            return "Select"
        }
    }

    private func options(for key: String) -> [NotarySettingsSelectOption] {
        switch key {
        case "jurisdiction":
            return viewModel.jurisdictionOptions
        case "serviceArea":
            return viewModel.serviceAreaOptions
        default:
            return []
        }
    }

    private func scaled(_ value: CGFloat, in proxy: GeometryProxy) -> CGFloat {
        value * min(proxy.size.width / designSize.width, proxy.size.height / designSize.height, 1.08)
    }
}

private struct NotarySettingsChevronIcon: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        return path
    }
}

struct NotarySettingsSelectOption: Identifiable, Equatable {
    let id: String
    let label: String
}

private struct NotarySettingsSelectInput: View {
    let key: String
    let selectedText: String
    let placeholder: String
    let options: [NotarySettingsSelectOption]
    @Binding var expandedKey: String?
    let isDisabled: Bool
    let onSelect: (String) -> Void

    private var isExpanded: Bool {
        expandedKey == key
    }

    var body: some View {
        VStack(spacing: 0) {
            Button {
                guard isDisabled == false else {
                    return
                }

                withAnimation(.easeOut(duration: 0.16)) {
                    expandedKey = isExpanded ? nil : key
                }
            } label: {
                HStack {
                    Text(selectedText.isEmpty ? placeholder : selectedText)
                        .font(DARCiFont.maisonNeue(.book, size: selectedText.isEmpty ? 14 : 18))
                        .foregroundStyle(selectedText.isEmpty ? Color(red: 0.48, green: 0.48, blue: 0.48) : .white)
                        .lineLimit(1)
                        .minimumScaleFactor(0.72)

                    Spacer(minLength: 12)

                    DARCiArrowRightIcon()
                        .stroke(.white, style: StrokeStyle(lineWidth: 2.2, lineCap: .square, lineJoin: .miter))
                        .frame(width: 24, height: 24)
                        .rotationEffect(.degrees(45))
                }
                .frame(maxWidth: .infinity, minHeight: 49)
                .padding(.horizontal, 16)
                .background(Color(red: 0.10, green: 0.10, blue: 0.10))
                .overlay(alignment: .bottom) {
                    Rectangle()
                        .fill(.white.opacity(isExpanded ? 1 : 0))
                        .frame(height: 1)
                }
            }
            .buttonStyle(.plain)
            .disabled(isDisabled)

            if isExpanded {
                ScrollView(showsIndicators: true) {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(options) { option in
                            Button {
                                onSelect(option.id)
                            } label: {
                                Text(option.label)
                                    .font(DARCiFont.maisonNeue(.book, size: 14))
                                    .foregroundStyle(.white)
                                    .lineLimit(2)
                                    .frame(maxWidth: .infinity, minHeight: 42, alignment: .leading)
                                    .padding(.horizontal, 16)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .frame(maxHeight: min(CGFloat(options.count) * 42, 220))
                .background(Color(red: 0.10, green: 0.10, blue: 0.10))
                .overlay {
                    Rectangle()
                        .stroke(.white.opacity(0.18), lineWidth: 1)
                }
            }
        }
        .zIndex(isExpanded ? 1_000 : 0)
    }
}

@MainActor
final class NotaryInformationSettingsViewModel: ObservableObject {
    enum AssetKind {
        case signature
        case seal
    }

    enum StatusTone {
        case error
        case success
    }

    private struct Snapshot: Equatable {
        let jurisdiction: String
        let serviceAreaKind: String
        let serviceAreaName: String
        let commissionNumber: String
        let commissionExpiresAt: String
        let signatureDataUrl: String?
        let sealDataUrl: String?
    }

    @Published var jurisdiction = ""
    @Published var serviceAreaKind = "county"
    @Published var serviceAreaName = ""
    @Published var commissionNumber = ""
    @Published var commissionExpiresAt = ""
    @Published var signatureDataUrl: String?
    @Published var sealDataUrl: String?
    @Published private(set) var jurisdictions: [IntakeJurisdictionOption] = []
    @Published private(set) var serviceAreas: [NotaryServiceAreaOption] = []
    @Published private(set) var isLoading = false
    @Published private(set) var isLoadingServiceAreas = false
    @Published private(set) var isSaving = false
    @Published private(set) var statusMessage: String?
    @Published private(set) var statusTone: StatusTone = .error

    private let apiClient: NotaryProfileAPIProviding
    private var savedSnapshot = Snapshot(
        jurisdiction: "",
        serviceAreaKind: "county",
        serviceAreaName: "",
        commissionNumber: "",
        commissionExpiresAt: "",
        signatureDataUrl: nil,
        sealDataUrl: nil
    )
    private var hasLoaded = false

    init(apiClient: NotaryProfileAPIProviding) {
        self.apiClient = apiClient
    }

    var jurisdictionOptions: [NotarySettingsSelectOption] {
        jurisdictions.map { NotarySettingsSelectOption(id: $0.code, label: $0.label) }
    }

    var serviceAreaOptions: [NotarySettingsSelectOption] {
        serviceAreas.map { NotarySettingsSelectOption(id: $0.value, label: $0.label) }
    }

    var jurisdictionLabel: String {
        guard jurisdiction.isEmpty == false else {
            return ""
        }

        return jurisdictions.first { $0.code == jurisdiction }?.label ?? jurisdiction
    }

    var serviceAreaLabel: String {
        guard serviceAreaName.isEmpty == false else {
            return ""
        }

        return serviceAreas.first { $0.value == serviceAreaName }?.label ?? serviceAreaName
    }

    var canSave: Bool {
        isLoading == false && isSaving == false && currentSnapshot != savedSnapshot
    }

    func load(session: AuthSession?) async {
        guard hasLoaded == false else {
            return
        }

        guard let accessToken = session?.accessToken else {
            statusTone = .error
            statusMessage = "Sign in again to edit your notary profile."
            return
        }

        hasLoaded = true
        isLoading = true
        statusMessage = nil

        do {
            async let profileResponse = apiClient.getMyNotaryProfile(accessToken: accessToken)
            async let jurisdictionsResponse = apiClient.listNotaryProfileJurisdictions(accessToken: accessToken)
            let (profilePayload, jurisdictionPayload) = try await (profileResponse, jurisdictionsResponse)

            jurisdictions = jurisdictionPayload.jurisdictions ?? []
            apply(profile: profilePayload.profile)

            if jurisdiction.isEmpty == false {
                await loadServiceAreas(jurisdiction: jurisdiction, accessToken: accessToken, preservesSelectedArea: true)
            }
        } catch {
            statusTone = .error
            statusMessage = Self.message(for: error, fallback: "Unable to load your notary profile.")
        }

        isLoading = false
    }

    func selectJurisdiction(_ selectedId: String, session: AuthSession?) async {
        jurisdiction = selectedId
        serviceAreaName = ""
        serviceAreaKind = "county"
        serviceAreas = []
        statusMessage = nil

        guard let accessToken = session?.accessToken else {
            statusTone = .error
            statusMessage = "Sign in again to load service areas."
            return
        }

        await loadServiceAreas(jurisdiction: selectedId, accessToken: accessToken, preservesSelectedArea: false)
    }

    func selectServiceArea(_ selectedId: String) {
        serviceAreaName = selectedId
        let label = serviceAreas.first { $0.value == selectedId }?.label ?? selectedId
        serviceAreaKind = Self.inferServiceAreaKind(from: label)
        statusMessage = nil
    }

    func loadAsset(from item: PhotosPickerItem?, kind: AssetKind) async {
        guard let item else {
            return
        }

        do {
            guard let data = try await item.loadTransferable(type: Data.self),
                  let image = UIImage(data: data),
                  let pngData = image.pngData() else {
                throw NotaryInformationSettingsError.invalidImage
            }

            let dataUrl = "data:image/png;base64,\(pngData.base64EncodedString())"
            switch kind {
            case .signature:
                signatureDataUrl = dataUrl
            case .seal:
                sealDataUrl = dataUrl
            }
            statusMessage = nil
        } catch {
            statusTone = .error
            statusMessage = "Choose a PNG or JPEG image."
        }
    }

    func save(session: AuthSession?) async {
        guard let accessToken = session?.accessToken else {
            statusTone = .error
            statusMessage = "Sign in again to save your notary profile."
            return
        }

        guard let request = makeSaveRequest() else {
            return
        }

        isSaving = true
        statusMessage = nil

        do {
            let response = try await apiClient.updateMyNotaryProfile(request, accessToken: accessToken)
            apply(profile: response.profile)
            savedSnapshot = currentSnapshot
            statusTone = .success
            statusMessage = "Notary profile updated."
        } catch {
            statusTone = .error
            statusMessage = Self.message(for: error, fallback: "Unable to save your notary profile.")
        }

        isSaving = false
    }

    private var currentSnapshot: Snapshot {
        Snapshot(
            jurisdiction: jurisdiction.trimmingCharacters(in: .whitespacesAndNewlines),
            serviceAreaKind: serviceAreaKind.trimmingCharacters(in: .whitespacesAndNewlines),
            serviceAreaName: serviceAreaName.trimmingCharacters(in: .whitespacesAndNewlines),
            commissionNumber: commissionNumber.trimmingCharacters(in: .whitespacesAndNewlines),
            commissionExpiresAt: commissionExpiresAt.trimmingCharacters(in: .whitespacesAndNewlines),
            signatureDataUrl: signatureDataUrl,
            sealDataUrl: sealDataUrl
        )
    }

    private func apply(profile: EditableNotaryProfile?) {
        jurisdiction = profile?.jurisdiction?.trimmingCharacters(in: .whitespacesAndNewlines) ?? jurisdiction
        serviceAreaKind = profile?.serviceAreaKind?.trimmingCharacters(in: .whitespacesAndNewlines) ?? serviceAreaKind
        serviceAreaName = profile?.serviceAreaName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? serviceAreaName
        commissionNumber = profile?.commissionNumber?.trimmingCharacters(in: .whitespacesAndNewlines) ?? commissionNumber
        commissionExpiresAt = Self.dateInputValue(from: profile?.commissionExpiresAt) ?? commissionExpiresAt
        signatureDataUrl = profile?.signatureDataUrl ?? signatureDataUrl
        sealDataUrl = profile?.sealDataUrl ?? sealDataUrl
        savedSnapshot = currentSnapshot
    }

    private func loadServiceAreas(jurisdiction: String, accessToken: String, preservesSelectedArea: Bool) async {
        isLoadingServiceAreas = true

        do {
            let response = try await apiClient.listServiceAreas(jurisdiction: jurisdiction, accessToken: accessToken)
            serviceAreas = (response.options ?? [])
                .filter { $0.value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false }
                .sorted { $0.label.localizedCaseInsensitiveCompare($1.label) == .orderedAscending }

            if preservesSelectedArea == false || serviceAreas.contains(where: { $0.value == serviceAreaName }) == false {
                serviceAreaName = ""
                serviceAreaKind = "county"
            }
        } catch {
            serviceAreas = []
            statusTone = .error
            statusMessage = "Unable to load county or service area options."
        }

        isLoadingServiceAreas = false
    }

    private func makeSaveRequest() -> NotaryProfileUpdateRequest? {
        let snapshot = currentSnapshot

        guard snapshot.jurisdiction.isEmpty == false, snapshot.serviceAreaName.isEmpty == false else {
            statusTone = .error
            statusMessage = "Choose your jurisdiction and service area."
            return nil
        }

        guard snapshot.commissionNumber.isEmpty == false, snapshot.commissionExpiresAt.isEmpty == false else {
            statusTone = .error
            statusMessage = "Enter your commission number and expiration date."
            return nil
        }

        guard Self.isValidDateInput(snapshot.commissionExpiresAt) else {
            statusTone = .error
            statusMessage = "Enter the expiration date as YYYY-MM-DD."
            return nil
        }

        guard Self.isTodayOrFuture(snapshot.commissionExpiresAt) else {
            statusTone = .error
            statusMessage = "Commission expiration must be today or later."
            return nil
        }

        return NotaryProfileUpdateRequest(
            jurisdiction: snapshot.jurisdiction,
            serviceAreaKind: snapshot.serviceAreaKind.isEmpty ? "county" : snapshot.serviceAreaKind,
            serviceAreaName: snapshot.serviceAreaName,
            commissionNumber: snapshot.commissionNumber,
            commissionExpiresAt: "\(snapshot.commissionExpiresAt)T23:59:59.999Z",
            signatureDataUrl: snapshot.signatureDataUrl,
            sealDataUrl: snapshot.sealDataUrl
        )
    }

    private static func dateInputValue(from value: String?) -> String? {
        let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard trimmed.isEmpty == false else {
            return nil
        }

        if isValidDateInput(trimmed) {
            return trimmed
        }

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: trimmed) {
            return localDateFormatter.string(from: date)
        }

        formatter.formatOptions = [.withInternetDateTime]
        guard let date = formatter.date(from: trimmed) else {
            return nil
        }

        return localDateFormatter.string(from: date)
    }

    private static func isValidDateInput(_ value: String) -> Bool {
        guard value.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil else {
            return false
        }

        return localDateFormatter.date(from: value) != nil
    }

    private static func isTodayOrFuture(_ value: String) -> Bool {
        value >= localDateFormatter.string(from: Date())
    }

    private static var localDateFormatter: DateFormatter {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }

    private static func inferServiceAreaKind(from label: String) -> String {
        let normalized = label.lowercased()
        if normalized.contains("parish") { return "parish" }
        if normalized.contains("borough") { return "borough" }
        if normalized.contains("district") { return "district" }
        if normalized.contains("city") { return "city" }
        if normalized.contains("metro") { return "metro" }
        if normalized.contains("region") { return "region" }
        if normalized.contains("state") { return "state" }
        return "county"
    }

    private static func message(for error: Error, fallback: String) -> String {
        guard let authError = error as? AuthAPIError else {
            return fallback
        }

        switch authError {
        case .wrongCode(let message), .unauthorized(let message), .validation(let message), .rateLimited(let message):
            return message ?? fallback
        case .server(_, let message), .unexpectedStatus(_, let message):
            return message ?? fallback
        case .invalidURL, .invalidResponse, .emptyResponse:
            return fallback
        }
    }
}

private enum NotaryInformationSettingsError: Error {
    case invalidImage
}