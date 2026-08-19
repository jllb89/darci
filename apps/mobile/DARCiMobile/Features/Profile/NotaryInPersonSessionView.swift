import PDFKit
import SwiftUI

struct NotaryInPersonSessionView: View {
    private enum ActivePicker: String, Identifiable {
        case documentType
        case issuingJurisdiction

        var id: String { rawValue }
    }

    private let session: AuthSession?

    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var viewModel: NotaryInPersonSessionViewModel
    @State private var pageCount = 1
    @State private var currentPage = 1
    @State private var zoomInTrigger = 0
    @State private var zoomOutTrigger = 0
    @State private var activePicker: ActivePicker?
    @State private var isStepCardMinimized = false

    init(
        session: AuthSession?,
        requestId: String,
        apiClient: NotaryProfileAPIProviding = NotaryProfileAPIClient(),
        locationProvider: NotarySessionLocationProviding = CoreLocationNotarySessionProvider()
    ) {
        self.session = session
        _viewModel = StateObject(
            wrappedValue: NotaryInPersonSessionViewModel(
                requestId: requestId,
                apiClient: apiClient,
                locationProvider: locationProvider
            )
        )
    }

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .bottom) {
                VStack(spacing: 0) {
                    header
                        .padding(.horizontal, scaled(24, in: proxy))
                        .padding(.top, scaled(18, in: proxy))
                        .padding(.bottom, scaled(14, in: proxy))
                        .background(Color.white)

                    if viewModel.step == .start {
                        startScreen(in: proxy)
                    } else {
                        ScrollView(showsIndicators: false) {
                            VStack(alignment: .leading, spacing: scaled(18, in: proxy)) {
                                sessionHeading
                                sessionMessages
                                progressCard

                                if viewModel.reviewDocuments.count > 1 {
                                    documentSelector
                                }

                                documentPreview(in: proxy)
                            }
                            .padding(.horizontal, scaled(24, in: proxy))
                            .padding(.top, scaled(10, in: proxy))
                            .padding(.bottom, scaled(48, in: proxy))
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .refreshable {
                            await viewModel.load(session: session)
                        }
                    }
                }
                .background(Color.white.ignoresSafeArea())

                if viewModel.context != nil {
                    stepCardBackground(in: proxy)

                    Group {
                        if isStepCardMinimized {
                            minimizedStepCard(in: proxy)
                        } else {
                            expandedStepCard(in: proxy)
                        }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                    .ignoresSafeArea(.container, edges: .bottom)
                    .animation(.easeInOut(duration: 0.24), value: isStepCardMinimized)
                }
            }
            .overlay {
                if viewModel.isLoading && viewModel.context == nil {
                    ZStack {
                        Color.white.opacity(0.88)
                        ProgressView("Loading session")
                            .font(DARCiFont.maisonNeue(.book, size: 12))
                            .tint(.black)
                    }
                }
            }
        }
        .navigationBarBackButtonHidden(true)
        .toolbar(.hidden, for: .navigationBar)
        .task {
            await viewModel.load(session: session)
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            Task { await viewModel.refreshFromForeground(session: session) }
        }
        .onChange(of: viewModel.step) { _, _ in
            isStepCardMinimized = false
        }
        .onDisappear {
            viewModel.stop()
        }
        .sheet(item: $activePicker) { picker in
            NotarySessionOptionPicker(
                title: pickerTitle(picker),
                options: pickerOptions(picker),
                selectedValue: pickerSelectedValue(picker)
            ) { value in
                activePicker = nil
                switch picker {
                case .documentType:
                    Task { await viewModel.selectIdentityDocumentType(value, session: session) }
                case .issuingJurisdiction:
                    viewModel.identityIssuingJurisdiction = value
                }
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
    }

    private func startScreen(in proxy: GeometryProxy) -> some View {
        VStack(alignment: .leading, spacing: scaled(14, in: proxy)) {
            sessionHeading
            sessionMessages
            if viewModel.context != nil && viewModel.hasSessionStart == false {
                contactExchangeCard(in: proxy)
            }
            progressCard

            if viewModel.reviewDocuments.count > 1 {
                documentSelector
            }

            documentPreview(in: proxy, fixedHeight: startDocumentPreviewHeight(in: proxy))
        }
        .padding(.horizontal, scaled(24, in: proxy))
        .padding(.top, scaled(8, in: proxy))
        .padding(.bottom, scaled(18, in: proxy))
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    private func expandedStepCard(in proxy: GeometryProxy) -> some View {
        VStack(alignment: .leading, spacing: scaled(16, in: proxy)) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("IN-PERSON SESSION")
                        .font(DARCiFont.maisonNeue(.mono, size: 9))
                        .foregroundStyle(.black.opacity(0.48))

                    Text(viewModel.step.title)
                        .font(DARCiFont.maisonNeue(.demi, size: 14))
                        .foregroundStyle(.black)
                }

                Spacer(minLength: 16)

                Button {
                    isStepCardMinimized = true
                } label: {
                    Image(systemName: "chevron.down")
                        .font(.system(size: 17, weight: .regular))
                        .foregroundStyle(Color(red: 0.49, green: 0.49, blue: 0.49))
                        .frame(width: 30, height: 30)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Minimize current session step")
                .accessibilityIdentifier("notary-session-step-card-minimize")
            }

            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: scaled(14, in: proxy)) {
                    if viewModel.step == .start,
                       viewModel.missingCompletionProfileFields.isEmpty == false {
                        statusMessage(
                            "Complete your notary profile before starting: \(viewModel.missingCompletionProfileFields.joined(separator: ", ")).",
                            tone: .warning
                        )
                    }

                    operatorPanel

                    if viewModel.step == .finalize || viewModel.step == .done {
                        finalizationPanel
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(.horizontal, scaled(24, in: proxy))
        .padding(.top, scaled(24, in: proxy))
        .padding(.bottom, scaled(20, in: proxy) + proxy.safeAreaInsets.bottom)
        .frame(maxWidth: .infinity)
        .frame(height: expandedStepCardHeight(in: proxy) + proxy.safeAreaInsets.bottom, alignment: .top)
        .background(Color(red: 0.90, green: 0.90, blue: 0.90))
        .clipShape(.rect(topLeadingRadius: 36, topTrailingRadius: 36))
        .shadow(color: .black.opacity(0.06), radius: 16, y: -4)
    }

    private func minimizedStepCard(in proxy: GeometryProxy) -> some View {
        Button {
            isStepCardMinimized = false
        } label: {
            HStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(viewModel.step.title)
                        .font(DARCiFont.maisonNeue(.demi, size: 14))
                        .foregroundStyle(.black)

                    Text("Tap to continue the in-person session")
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
        .accessibilityLabel("Expand current session step")
        .accessibilityIdentifier("notary-session-step-card-expand")
    }

    private func stepCardBackground(in proxy: GeometryProxy) -> some View {
        VStack(spacing: 0) {
            Spacer()
            Color(red: 0.90, green: 0.90, blue: 0.90)
                .frame(height: max(proxy.safeAreaInsets.bottom, 34))
                .ignoresSafeArea(.container, edges: .bottom)
        }
    }

    private func expandedStepCardHeight(in proxy: GeometryProxy) -> CGFloat {
        switch viewModel.step {
        case .start:
            return scaled(230, in: proxy)
        case .samePlace, .complete:
            return min(max(proxy.size.height * 0.48, 400), 500)
        case .done:
            return min(max(proxy.size.height * 0.52, 430), 540)
        case .identity, .venue, .seal, .finalize:
            return min(max(proxy.size.height * 0.66, 520), 680)
        }
    }

    private func startDocumentPreviewHeight(in proxy: GeometryProxy) -> CGFloat {
        let headerAndStartChrome = scaled(342, in: proxy) + proxy.safeAreaInsets.bottom
        let selectorHeight = viewModel.reviewDocuments.count > 1 ? scaled(62, in: proxy) : 0
        let messageCount = (viewModel.errorMessage == nil ? 0 : 1) + (viewModel.noticeMessage == nil ? 0 : 1)
        let messageHeight = scaled(CGFloat(messageCount) * 58, in: proxy)
        let availableHeight = proxy.size.height - headerAndStartChrome - selectorHeight - messageHeight
        return min(max(availableHeight, scaled(320, in: proxy)), scaled(540, in: proxy))
    }

    @ViewBuilder
    private var sessionMessages: some View {
        if let errorMessage = viewModel.errorMessage {
            statusMessage(errorMessage, tone: .error)
        }

        if let noticeMessage = viewModel.noticeMessage {
            statusMessage(noticeMessage, tone: .success)
        }
    }

    private var progressCard: some View {
        NotarySessionProgressCard(
            documentType: viewModel.documentTypeLabel,
            jurisdiction: viewModel.jurisdictionLabel,
            documentCode: viewModel.documentCode,
            memberName: viewModel.memberName,
            step: viewModel.step,
            timeline: viewModel.timeline
        )
    }

    private var header: some View {
        HStack(spacing: 18) {
            Button {
                dismiss()
            } label: {
                Image(systemName: "arrow.left")
                    .font(.system(size: 23, weight: .regular))
                    .foregroundStyle(.black)
                    .frame(width: 30, height: 30)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Back to notary requests")

            Text(viewModel.screenTitle)
                .font(DARCiFont.maisonNeue(.medium, size: 14))
                .foregroundStyle(.black)
                .lineLimit(1)
                .minimumScaleFactor(0.62)
        }
    }

    private var sessionHeading: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(viewModel.hasSessionStart ? "Complete in-person session" : "Coordinate with member")
                .font(DARCiFont.maisonNeue(.demi, size: 13))
                .foregroundStyle(.black)

            Text(viewModel.hasSessionStart
                 ? "Review the live document while each meeting requirement is recorded."
                 : "Member contact details are ready. Start the live session only when you are together.")
                .font(DARCiFont.maisonNeue(.book, size: 12))
                .lineSpacing(4)
                .foregroundStyle(.black.opacity(0.68))
        }
    }

    private func contactExchangeCard(in proxy: GeometryProxy) -> some View {
        VStack(alignment: .leading, spacing: scaled(14, in: proxy)) {
            Text("MEMBER")
                .font(DARCiFont.maisonNeue(.mono, size: scaled(9, in: proxy)))
                .foregroundStyle(.black.opacity(0.48))

            Text(viewModel.memberName)
                .font(DARCiFont.maisonNeue(.demi, size: scaled(18, in: proxy)))
                .foregroundStyle(.black)
                .lineLimit(2)

            HStack(spacing: scaled(10, in: proxy)) {
                contactButton(title: "Email", systemImage: "envelope", url: contactURL(scheme: "mailto", value: viewModel.memberEmail), in: proxy)
                contactButton(title: "Call", systemImage: "phone", url: contactURL(scheme: "tel", value: viewModel.memberPhone), in: proxy)
            }
        }
        .padding(scaled(18, in: proxy))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(red: 0.94, green: 0.94, blue: 0.94))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color.black.opacity(0.12), lineWidth: 0.5)
        }
    }

    private func contactButton(title: String, systemImage: String, url: URL?, in proxy: GeometryProxy) -> some View {
        let isEmailAction = title == "Email"
        let foregroundColor = url == nil ? Color.black.opacity(0.42) : (isEmailAction ? Color.black : Color.white)
        let backgroundColor = isEmailAction
            ? DARCiTheme.onboardingGreen.opacity(url == nil ? 0.42 : 1)
            : Color.black.opacity(url == nil ? 0.18 : 1)

        return Button {
            guard let url else { return }
            openURL(url)
        } label: {
            HStack(spacing: scaled(7, in: proxy)) {
                Image(systemName: systemImage)
                    .font(.system(size: scaled(12, in: proxy), weight: .medium))
                Text(title)
                    .font(DARCiFont.maisonNeue(.medium, size: scaled(12, in: proxy)))
            }
            .foregroundStyle(foregroundColor)
            .frame(maxWidth: .infinity)
            .frame(height: scaled(40, in: proxy))
            .background(backgroundColor)
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(url == nil)
    }

    private func contactURL(scheme: String, value: String?) -> URL? {
        guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines), value.isEmpty == false else { return nil }
        if scheme == "tel" {
            let allowed = value.filter { $0.isNumber || $0 == "+" }
            return allowed.isEmpty ? nil : URL(string: "tel:\(allowed)")
        }
        return URL(string: "\(scheme):\(value)")
    }

    private var documentSelector: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(viewModel.reviewDocuments) { document in
                    let isSelected = document.id == viewModel.selectedDocument?.id
                    Button {
                        viewModel.selectDocument(document)
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(document.label)
                                .font(DARCiFont.maisonNeue(.book, size: 11))
                                .lineLimit(1)
                            Text(document.isFinal ? "FINAL" : "SESSION PDF")
                                .font(DARCiFont.maisonNeue(.mono, size: 8))
                        }
                        .foregroundStyle(isSelected ? .white : .black)
                        .frame(width: 156, alignment: .leading)
                        .padding(.horizontal, 12)
                        .frame(height: 48)
                        .background(isSelected ? Color.black : Color.black.opacity(0.045))
                        .overlay {
                            RoundedRectangle(cornerRadius: 6)
                                .stroke(Color.black.opacity(isSelected ? 0 : 0.14), lineWidth: 1)
                        }
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func documentPreview(in proxy: GeometryProxy, fixedHeight: CGFloat? = nil) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 22) {
                Text("\(min(currentPage, max(pageCount, 1)))/\(max(pageCount, 1))")
                    .font(DARCiFont.maisonNeue(.book, size: 12))
                    .foregroundStyle(.black)
                    .frame(minWidth: 42, alignment: .leading)

                Button {
                    zoomInTrigger += 1
                } label: {
                    Image(systemName: "plus.magnifyingglass")
                        .font(.system(size: 14))
                        .frame(width: 26, height: 26)
                }
                .buttonStyle(.plain)
                .disabled(viewModel.pdfData == nil)

                Button {
                    zoomOutTrigger += 1
                } label: {
                    Image(systemName: "minus.magnifyingglass")
                        .font(.system(size: 14))
                        .frame(width: 26, height: 26)
                }
                .buttonStyle(.plain)
                .disabled(viewModel.pdfData == nil)

                Spacer(minLength: 0)

                Button {
                    guard let path = viewModel.selectedDocument?.downloadUrl,
                          let url = URL(string: path) else { return }
                    openURL(url)
                } label: {
                    Image(systemName: "arrow.down.to.line")
                        .font(.system(size: 16))
                        .frame(width: 26, height: 26)
                }
                .buttonStyle(.plain)
                .disabled(viewModel.selectedDocument?.downloadUrl == nil)
            }
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
                    ProgressView()
                        .tint(.black)
                } else {
                    Text("The session PDF will appear here when it is ready.")
                        .font(DARCiFont.maisonNeue(.book, size: 12))
                        .foregroundStyle(.black.opacity(0.56))
                        .multilineTextAlignment(.center)
                        .padding(24)
                }
            }
            .frame(height: fixedHeight.map { max($0 - scaled(66, in: proxy), scaled(220, in: proxy)) } ?? scaled(360, in: proxy))
            .padding(.horizontal, 14)
            .padding(.bottom, 14)
        }
        .frame(height: fixedHeight)
        .background(Color(red: 0.88, green: 0.88, blue: 0.88))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color.black.opacity(0.16), lineWidth: 0.5)
        }
    }

    private var operatorPanel: some View {
        Group {
            if viewModel.step == .start {
                startStep
            } else {
                VStack(alignment: .leading, spacing: 16) {
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("CURRENT STEP")
                                .font(DARCiFont.maisonNeue(.mono, size: 9))
                                .foregroundStyle(.black.opacity(0.48))

                            Text(viewModel.step.title)
                                .font(DARCiFont.maisonNeue(.medium, size: 20))
                                .foregroundStyle(.black)
                        }

                        Spacer(minLength: 12)

                        if viewModel.hasRunningAction {
                            ProgressView()
                                .tint(.black)
                        }
                    }

                    Group {
                        switch viewModel.step {
                        case .start:
                            EmptyView()
                        case .samePlace:
                            samePlaceStep
                        case .identity:
                            identityStep
                        case .venue:
                            venueStep
                        case .seal:
                            sealStep
                        case .complete:
                            completeStep
                        case .finalize:
                            finalizeStep
                        case .done:
                            doneStep
                        }
                    }
                }
                .padding(22)
                .background(Color(red: 0.90, green: 0.90, blue: 0.90))
                .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
            }
        }
    }

    private var startStep: some View {
        VStack(spacing: 0) {
            NotarySessionPrimaryButton(
                title: viewModel.activeAction == "start" ? "Starting session" : "Start in-person session",
                systemImage: nil,
                isEnabled: viewModel.canStartSession
            ) {
                Task { await viewModel.startSession(session: session) }
            }
            .accessibilityIdentifier("notary-session-start-button")
        }
    }

    private var samePlaceStep: some View {
        VStack(alignment: .leading, spacing: 14) {
            sessionInfoBand(
                icon: viewModel.hasPassedSamePlace ? "checkmark.circle.fill" : "location.circle",
                title: viewModel.hasPassedSamePlace ? "Same-place confirmed" : "Live location check",
                detail: viewModel.samePlaceMessage,
                tone: viewModel.hasPassedSamePlace ? .success : .neutral
            )

            HStack(spacing: 8) {
                sessionMetric(title: "MEMBER", value: viewModel.hasMemberCheckIn ? "CHECKED IN" : "WAITING")
                Divider().frame(height: 34)
                sessionMetric(title: "NOTARY", value: viewModel.hasSessionStart ? "ONLINE" : "WAITING")
                Divider().frame(height: 34)
                sessionMetric(title: "DISTANCE", value: viewModel.latestDistanceLabel.uppercased())
            }
            .padding(.horizontal, 12)
            .background(Color.white.opacity(0.58))
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))

            NotarySessionSecondaryButton(
                title: viewModel.activeAction == "same-place" ? "Refreshing location" : "Refresh my location",
                systemImage: "location.fill",
                isEnabled: viewModel.hasRunningAction == false
            ) {
                Task { await viewModel.refreshSamePlace(session: session) }
            }
        }
    }

    private var identityStep: some View {
        VStack(alignment: .leading, spacing: 13) {
            sessionInfoBand(
                icon: "person.text.rectangle",
                title: "Verify presented ID",
                detail: "Record the official document exactly as presented. DARCi stores only the fields required by the selected ID type."
            )

            NotarySessionTextField(
                title: "Member name",
                placeholder: "Member name",
                text: $viewModel.identitySubjectName
            )

            NotarySessionSelectField(
                title: "Identity document type",
                value: identityDocumentTypeLabel,
                placeholder: viewModel.isLoadingIdentitySchema ? "Loading options" : "Select document type"
            ) {
                activePicker = .documentType
            }

            ForEach(viewModel.identityFields) { field in
                identityField(field)
            }

            if let validationMessage = viewModel.identityValidationMessage {
                statusMessage(validationMessage, tone: .warning)
            }

            NotarySessionPrimaryButton(
                title: viewModel.activeAction == "identity" ? "Recording identity" : "Record identity",
                systemImage: "checkmark",
                isEnabled: viewModel.canRecordIdentity
            ) {
                Task { await viewModel.recordIdentity(session: session) }
            }
            .accessibilityIdentifier("notary-session-record-identity-button")
        }
    }

    @ViewBuilder
    private func identityField(_ field: NotaryIdentityDocumentField) -> some View {
        let requiredSuffix = field.required ? " *" : ""
        let placeholder = (field.placeholder?.isEmpty == false ? field.placeholder : field.label) ?? field.label

        if field.fieldKey == "issuingJurisdiction" && viewModel.identityIssuingOptions.isEmpty == false {
            NotarySessionSelectField(
                title: "\(field.label)\(requiredSuffix)",
                value: viewModel.identityIssuingJurisdiction,
                placeholder: "\(placeholder)\(requiredSuffix)"
            ) {
                activePicker = .issuingJurisdiction
            }
        } else {
            NotarySessionTextField(
                title: "\(field.label)\(requiredSuffix)",
                placeholder: "\(placeholder)\(requiredSuffix)",
                text: Binding(
                    get: { viewModel.identityValue(for: field.fieldKey) },
                    set: { value in
                        viewModel.updateIdentityValue(
                            field.inputKind == "date" ? IntakeDateFormatting.formatISODateInput(value) : value,
                            for: field.fieldKey
                        )
                    }
                ),
                keyboardType: field.inputKind == "date" ? .numbersAndPunctuation : .default,
                capitalization: field.inputKind == "date" ? .never : .characters
            )
        }
    }

    private var venueStep: some View {
        VStack(alignment: .leading, spacing: 13) {
            if let message = viewModel.venuePrefillMessage {
                sessionInfoBand(
                    icon: "location.fill",
                    title: "Location address",
                    detail: message,
                    tone: viewModel.venueState.isEmpty ? .warning : .success
                )
            }

            HStack(spacing: 10) {
                NotarySessionTextField(
                    title: "State *",
                    placeholder: "State",
                    text: venueBinding(\.venueState)
                )
                NotarySessionTextField(
                    title: "County *",
                    placeholder: "County",
                    text: venueBinding(\.venueCounty)
                )
            }

            NotarySessionTextField(
                title: "City",
                placeholder: "City",
                text: venueBinding(\.venueCity)
            )

            NotarySessionTextField(
                title: "Address or place",
                placeholder: "Street address",
                text: venueBinding(\.venueAddressLine1)
            )

            NotarySessionTextField(
                title: "Location label",
                placeholder: "Office, residence, or venue",
                text: venueBinding(\.venueLocationLabel)
            )

            NotarySessionSecondaryButton(
                title: viewModel.activeAction == "venue-prefill" ? "Finding address" : "Use current location",
                systemImage: "location.fill",
                isEnabled: viewModel.hasRunningAction == false
            ) {
                Task { await viewModel.prefillVenue(session: session) }
            }

            NotarySessionPrimaryButton(
                title: viewModel.activeAction == "venue" ? "Capturing venue" : "Confirm acknowledgment venue",
                systemImage: "checkmark",
                isEnabled: viewModel.canRecordVenue
            ) {
                Task { await viewModel.recordVenue(session: session) }
            }
            .accessibilityIdentifier("notary-session-record-venue-button")
        }
    }

    private var sealStep: some View {
        VStack(alignment: .leading, spacing: 14) {
            sessionInfoBand(
                icon: "seal.fill",
                title: "Notarial acknowledgment",
                detail: "Confirm the signer appeared and acknowledged the document. Your saved signature and seal will be appended to the PDF."
            )

            VStack(spacing: 0) {
                acknowledgmentFact(title: "Signer appeared", value: "Confirmed")
                Divider()
                acknowledgmentFact(title: "Signer acknowledged", value: "Confirmed")
                Divider()
                acknowledgmentFact(title: "Venue", value: venueSummary)
                Divider()
                acknowledgmentFact(title: "Notary assets", value: notaryAssetsSummary)
            }

            NotarySessionNotesField(text: $viewModel.notarialNotes)

            NotarySessionPrimaryButton(
                title: viewModel.activeAction == "seal" ? "Appending acknowledgment" : "Seal acknowledgment",
                systemImage: "seal.fill",
                isEnabled: viewModel.canSealAcknowledgment
            ) {
                Task { await viewModel.sealAcknowledgment(session: session) }
            }
            .accessibilityIdentifier("notary-session-seal-button")
        }
    }

    private var completeStep: some View {
        VStack(alignment: .leading, spacing: 14) {
            sessionInfoBand(
                icon: "checkmark.seal.fill",
                title: "Meeting evidence complete",
                detail: "Completing closes the meeting, watermarks the final PDF, records its SHA-256 hash, and anchors it to the ledger."
            )

            NotarySessionNotesField(text: $viewModel.notarialNotes)

            NotarySessionPrimaryButton(
                title: viewModel.activeAction == "complete" ? "Completing and anchoring" : "Complete and submit package",
                systemImage: "checkmark",
                isEnabled: viewModel.hasRunningAction == false
            ) {
                Task { await viewModel.completeSession(session: session) }
            }
            .accessibilityIdentifier("notary-session-complete-button")
        }
    }

    private var finalizeStep: some View {
        VStack(alignment: .leading, spacing: 14) {
            sessionInfoBand(
                icon: viewModel.hasLedgerFailure ? "exclamationmark.triangle.fill" : "clock.fill",
                title: viewModel.hasLedgerFailure ? "Final package needs attention" : "Final package processing",
                detail: viewModel.hasLedgerFailure
                    ? "The meeting is complete, but ledger anchoring did not finish. Retry the server-side finalization."
                    : "The meeting is complete. Submit the final package to finish hashing and anchoring.",
                tone: viewModel.hasLedgerFailure ? .warning : .neutral
            )

            NotarySessionPrimaryButton(
                title: viewModel.activeAction == "finalize" ? "Submitting final package" : "Submit final notarized package",
                systemImage: "arrow.up.doc.fill",
                isEnabled: viewModel.hasRunningAction == false
            ) {
                Task { await viewModel.submitFinalPackage(session: session) }
            }
        }
    }

    private var doneStep: some View {
        sessionInfoBand(
            icon: "checkmark.seal.fill",
            title: "Verification ready",
            detail: "The final package is hashed, ledger anchored, and available in the member record.",
            tone: .success
        )
    }

    private var finalizationPanel: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("FINAL PACKAGE")
                    .font(DARCiFont.maisonNeue(.mono, size: 10))
                    .foregroundStyle(.black.opacity(0.52))

                Spacer()

                Text(viewModel.finalizationStatusLabel.uppercased())
                    .font(DARCiFont.maisonNeue(.mono, size: 9))
                    .foregroundStyle(viewModel.hasLedgerFailure ? Color.red : .black)
            }

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                completionCell(title: "Watermarked", done: viewModel.context?.finalization?.isWatermarked == true)
                completionCell(title: "Hash recorded", done: viewModel.context?.finalization?.isHashRecorded == true)
                completionCell(title: "Ledger anchored", done: viewModel.isAnchored)
                completionCell(title: "Verification ready", done: viewModel.context?.capabilities?.canOpenVerification == true)
            }

            VStack(alignment: .leading, spacing: 8) {
                finalizationValue(title: "HASH", value: viewModel.context?.finalization?.hash)
                finalizationValue(title: "LEDGER TX", value: viewModel.context?.finalization?.ledgerTxId)
            }

            if let publicURL = viewModel.publicVerificationURL {
                NotarySessionSecondaryButton(
                    title: "Open public verification",
                    systemImage: "arrow.up.right.square",
                    isEnabled: true
                ) {
                    openURL(publicURL)
                }
            }
        }
        .padding(22)
        .background(Color(red: 0.90, green: 0.90, blue: 0.90))
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private func completionCell(title: String, done: Bool) -> some View {
        HStack(spacing: 8) {
            Image(systemName: done ? "checkmark.circle.fill" : "circle")
                .font(.system(size: 14))
                .foregroundStyle(done ? DARCiTheme.onboardingGreen : Color.black.opacity(0.26))
            Text(title)
                .font(DARCiFont.maisonNeue(.book, size: 11))
                .foregroundStyle(.black)
                .lineLimit(1)
            Spacer(minLength: 0)
        }
        .frame(height: 38)
    }

    private func finalizationValue(title: String, value: String?) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title)
                .font(DARCiFont.maisonNeue(.mono, size: 8))
                .foregroundStyle(.black.opacity(0.46))
            Text(value?.isEmpty == false ? value! : "Pending")
                .font(DARCiFont.maisonNeue(.mono, size: 9))
                .foregroundStyle(.black)
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func acknowledgmentFact(title: String, value: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Text(title)
                .font(DARCiFont.maisonNeue(.book, size: 11))
                .foregroundStyle(.black.opacity(0.56))
            Spacer(minLength: 12)
            Text(value)
                .font(DARCiFont.maisonNeue(.book, size: 11))
                .foregroundStyle(.black)
                .multilineTextAlignment(.trailing)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 11)
    }

    private var venueSummary: String {
        let values = [viewModel.venueAddressLine1, viewModel.venueCity, viewModel.venueCounty, viewModel.venueState]
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { $0.isEmpty == false }
        return values.isEmpty ? "Recorded" : values.joined(separator: ", ")
    }

    private var notaryAssetsSummary: String {
        let hasSignature = viewModel.notaryProfile?.signatureDataUrl?.isEmpty == false
        let hasSeal = viewModel.notaryProfile?.sealDataUrl?.isEmpty == false
        return hasSignature && hasSeal ? "Signature + seal ready" : "Profile assets required"
    }

    private func sessionMetric(title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title)
                .font(DARCiFont.maisonNeue(.mono, size: 7.5))
                .foregroundStyle(.black.opacity(0.46))
            Text(value)
                .font(DARCiFont.maisonNeue(.mono, size: 8.5))
                .foregroundStyle(.black)
                .lineLimit(1)
                .minimumScaleFactor(0.68)
        }
        .padding(.horizontal, 10)
        .frame(maxWidth: .infinity, minHeight: 54, alignment: .leading)
    }

    private enum InfoTone {
        case neutral
        case success
        case warning
    }

    private func sessionInfoBand(icon: String, title: String, detail: String, tone: InfoTone = .neutral) -> some View {
        HStack(alignment: .top, spacing: 11) {
            Image(systemName: icon)
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(infoForeground(tone))
                .frame(width: 20)

            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(DARCiFont.maisonNeue(.medium, size: 12))
                    .foregroundStyle(infoForeground(tone))
                Text(detail)
                    .font(DARCiFont.maisonNeue(.book, size: 11))
                    .lineSpacing(3)
                    .foregroundStyle(infoForeground(tone).opacity(0.76))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.vertical, 2)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(infoBackground(tone))
    }

    private func infoForeground(_ tone: InfoTone) -> Color {
        switch tone {
        case .neutral: .black
        case .success: Color(red: 0.04, green: 0.34, blue: 0.12)
        case .warning: Color(red: 0.56, green: 0.31, blue: 0.02)
        }
    }

    private func infoBackground(_ tone: InfoTone) -> Color {
        Color.clear
    }

    private func statusMessage(_ text: String, tone: NotarySessionMessageTone) -> some View {
        Text(text)
            .font(DARCiFont.maisonNeue(.book, size: 11))
            .lineSpacing(4)
            .foregroundStyle(tone.foreground)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(tone.background)
            .overlay {
                RoundedRectangle(cornerRadius: 14)
                    .stroke(tone.border, lineWidth: 1)
            }
            .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private var identityDocumentTypeLabel: String {
        viewModel.identityDocumentTypes.first { $0.value == viewModel.identityDocumentType }?.label ?? ""
    }

    private func pickerTitle(_ picker: ActivePicker) -> String {
        switch picker {
        case .documentType: "Identity document type"
        case .issuingJurisdiction: viewModel.identityIssuingPlaceholder
        }
    }

    private func pickerOptions(_ picker: ActivePicker) -> [NotarySessionPickerOption] {
        switch picker {
        case .documentType:
            viewModel.identityDocumentTypes.map { NotarySessionPickerOption(id: $0.value, label: $0.label) }
        case .issuingJurisdiction:
            viewModel.identityIssuingOptions.map { NotarySessionPickerOption(id: $0, label: $0) }
        }
    }

    private func pickerSelectedValue(_ picker: ActivePicker) -> String {
        switch picker {
        case .documentType: viewModel.identityDocumentType
        case .issuingJurisdiction: viewModel.identityIssuingJurisdiction
        }
    }

    private func venueBinding(_ keyPath: ReferenceWritableKeyPath<NotaryInPersonSessionViewModel, String>) -> Binding<String> {
        Binding(
            get: { viewModel[keyPath: keyPath] },
            set: {
                viewModel[keyPath: keyPath] = $0
                viewModel.markVenueEdited()
            }
        )
    }

    private func scaled(_ value: CGFloat, in proxy: GeometryProxy) -> CGFloat {
        value * min(max(proxy.size.width / 440, 0.86), 1.08)
    }
}

private struct NotarySessionProgressCard: View {
    let documentType: String
    let jurisdiction: String
    let documentCode: String
    let memberName: String
    let step: NotaryInPersonSessionStep
    let timeline: [NotarySessionTimelineItem]
    @State private var activeProgress: CGFloat = 0

    private var currentIndex: Int {
        timeline.firstIndex { $0.isComplete == false } ?? max(timeline.count - 1, 0)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 13) {
            HStack(alignment: .firstTextBaseline) {
                Text([documentType, jurisdiction].filter { $0.isEmpty == false }.joined(separator: " - "))
                    .font(DARCiFont.maisonNeue(.book, size: 12))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)

                Spacer(minLength: 12)

                Text(step.title.uppercased())
                    .font(DARCiFont.maisonNeue(.mono, size: 8))
                    .foregroundStyle(.white.opacity(0.78))
                    .lineLimit(1)
            }

            HStack(spacing: 4) {
                ForEach(Array(timeline.enumerated()), id: \.element.id) { index, item in
                    GeometryReader { segment in
                        ZStack(alignment: .leading) {
                            Rectangle().fill(Color.white.opacity(0.14))
                            Rectangle()
                                .fill(DARCiTheme.onboardingGreen)
                                .frame(
                                    width: segment.size.width * (
                                        item.isComplete ? 1 : index == currentIndex ? activeProgress : 0
                                    )
                                )
                        }
                    }
                    .frame(height: 3)
                }
            }

            HStack(alignment: .bottom) {
                Text("\(documentCode.uppercased()) | MEMBER: \(memberName.uppercased())")
                    .font(DARCiFont.maisonNeue(.mono, size: 8))
                    .foregroundStyle(.white.opacity(0.82))
                    .lineLimit(1)
                    .minimumScaleFactor(0.62)

                Spacer(minLength: 10)

                Text("\(min(currentIndex + 1, timeline.count))/\(timeline.count)")
                    .font(DARCiFont.maisonNeue(.mono, size: 8))
                    .foregroundStyle(.white.opacity(0.56))
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 92, alignment: .leading)
        .background(Color.black)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .onAppear(perform: animate)
        .onChange(of: currentIndex) { _, _ in animate() }
    }

    private func animate() {
        activeProgress = 0
        withAnimation(.timingCurve(0.12, 0.88, 0.25, 1, duration: 0.7)) {
            activeProgress = 1
        }
    }
}

private struct NotarySessionTextField: View {
    let title: String
    let placeholder: String
    @Binding var text: String
    var keyboardType: UIKeyboardType = .default
    var capitalization: TextInputAutocapitalization = .words

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(DARCiFont.maisonNeue(.book, size: 11))
                .foregroundStyle(.black.opacity(0.58))

            TextField(placeholder, text: $text)
                .font(DARCiFont.maisonNeue(.book, size: 14))
                .foregroundStyle(.black)
                .tint(.black)
                .keyboardType(keyboardType)
                .textInputAutocapitalization(capitalization)
                .autocorrectionDisabled()
                .padding(.horizontal, 16)
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(Color.white)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct NotarySessionSelectField: View {
    let title: String
    let value: String
    let placeholder: String
    let action: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(DARCiFont.maisonNeue(.book, size: 11))
                .foregroundStyle(.black.opacity(0.58))

            Button(action: action) {
                HStack(spacing: 10) {
                    Text(value.isEmpty ? placeholder : value)
                        .font(DARCiFont.maisonNeue(.book, size: 14))
                        .foregroundStyle(value.isEmpty ? Color.black.opacity(0.38) : .black)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.down")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(.black)
                }
                .padding(.horizontal, 16)
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(Color.white)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            .buttonStyle(.plain)
        }
    }
}

private struct NotarySessionNotesField: View {
    @Binding var text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("NOTARIAL NOTES · OPTIONAL")
                .font(DARCiFont.maisonNeue(.mono, size: 8))
                .foregroundStyle(.black.opacity(0.52))

            TextEditor(text: $text)
                .font(DARCiFont.maisonNeue(.book, size: 13))
                .foregroundStyle(.black)
                .scrollContentBackground(.hidden)
                .padding(12)
                .frame(minHeight: 104)
                .background(Color.white)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
    }
}

private struct NotarySessionPrimaryButton: View {
    let title: String
    let systemImage: String?
    let isEnabled: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Text(title)
                    .lineLimit(1)
                    .minimumScaleFactor(0.78)
                if let systemImage {
                    Image(systemName: systemImage)
                        .font(.system(size: 14, weight: .medium))
                } else {
                    DARCiArrowCornerIcon()
                        .stroke(style: StrokeStyle(lineWidth: 1.5, lineCap: .square, lineJoin: .miter))
                        .frame(width: 14, height: 14)
                }
            }
            .font(DARCiFont.maisonNeue(.medium, size: 14))
            .foregroundStyle(isEnabled ? Color.black : Color.white.opacity(0.62))
            .frame(maxWidth: .infinity, minHeight: 50)
            .background(isEnabled ? DARCiTheme.onboardingGreen : Color.black.opacity(0.48))
        }
        .buttonStyle(.plain)
        .disabled(isEnabled == false)
    }
}

private struct NotarySessionSecondaryButton: View {
    let title: String
    let systemImage: String
    let isEnabled: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 9) {
                Image(systemName: systemImage)
                    .font(.system(size: 13, weight: .medium))
                Text(title)
                    .lineLimit(1)
                    .minimumScaleFactor(0.78)
            }
            .font(DARCiFont.maisonNeue(.book, size: 13))
            .foregroundStyle(.black.opacity(isEnabled ? 1 : 0.34))
            .frame(maxWidth: .infinity, minHeight: 46)
            .background(Color.white.opacity(isEnabled ? 0.72 : 0.34))
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(isEnabled == false)
    }
}

private struct NotarySessionPickerOption: Identifiable {
    let id: String
    let label: String
}

private struct NotarySessionOptionPicker: View {
    let title: String
    let options: [NotarySessionPickerOption]
    let selectedValue: String
    let onSelect: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    private var filteredOptions: [NotarySessionPickerOption] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.isEmpty == false else { return options }
        return options.filter { $0.label.localizedCaseInsensitiveContains(trimmed) }
    }

    var body: some View {
        NavigationStack {
            List(filteredOptions) { option in
                Button {
                    onSelect(option.id)
                    dismiss()
                } label: {
                    HStack {
                        Text(option.label)
                            .font(DARCiFont.maisonNeue(.book, size: 15))
                            .foregroundStyle(.black)
                        Spacer()
                        if option.id == selectedValue {
                            Image(systemName: "checkmark")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(.black)
                        }
                    }
                }
                .buttonStyle(.plain)
            }
            .listStyle(.plain)
            .searchable(text: $query, prompt: "Search")
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .foregroundStyle(.black)
                    }
                }
            }
        }
    }
}

private enum NotarySessionMessageTone {
    case error
    case success
    case warning

    var foreground: Color {
        switch self {
        case .error: Color(red: 0.68, green: 0.10, blue: 0.10)
        case .success: Color(red: 0.03, green: 0.34, blue: 0.12)
        case .warning: Color(red: 0.56, green: 0.31, blue: 0.02)
        }
    }

    var background: Color {
        switch self {
        case .error: Color(red: 0.99, green: 0.94, blue: 0.94)
        case .success: Color(red: 0.90, green: 0.98, blue: 0.91)
        case .warning: Color(red: 1.0, green: 0.96, blue: 0.86)
        }
    }

    var border: Color {
        switch self {
        case .error: Color(red: 0.88, green: 0.66, blue: 0.66)
        case .success: Color(red: 0.52, green: 0.80, blue: 0.58)
        case .warning: Color(red: 0.88, green: 0.72, blue: 0.34)
        }
    }
}