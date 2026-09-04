import SwiftUI
import UIKit
import UniformTypeIdentifiers

private let intakeRootCoordinateSpace = "intake-root"

struct ProductIntakeRoute: Identifiable, Hashable {
    let modeKey: String
    let draftDocumentId: String?

    init(modeKey: String, draftDocumentId: String? = nil) {
        self.modeKey = modeKey
        self.draftDocumentId = draftDocumentId
    }

    var id: String { "\(modeKey):\(draftDocumentId ?? "new")" }

    static func returningFromReview(
        existingRoute: ProductIntakeRoute?,
        documentId: String,
        productModeKey: String
    ) -> ProductIntakeRoute {
        if productModeKey == "notarize_document",
           let existingRoute,
           existingRoute.modeKey == productModeKey {
            return existingRoute
        }

        return ProductIntakeRoute(
            modeKey: productModeKey,
            draftDocumentId: productModeKey == "notarize_document" ? nil : documentId
        )
    }
}

struct ProductIntakeFlowView: View {
    private let session: AuthSession?
    private let productModeKey: String
    private let draftDocumentId: String?
    private let onSubmittedToReview: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @StateObject private var viewModel: DocumentIntakeViewModel
    @State private var isFileImporterPresented = false
    @State private var isPriorDocumentFileImporterPresented = false
    @State private var priorDocumentFileImporterIndex: Int?
    @State private var hasAppeared = false
    @State private var expandedSelectKey: String?
    @State private var selectInputFrames: [String: CGRect] = [:]
    @State private var activeTooltipKey: String?
    @State private var activeTooltipContent: String?
    private let maxPDFUploadBytes = 25 * 1024 * 1024

    init(
        session: AuthSession?,
        productModeKey: String,
        draftDocumentId: String? = nil,
        apiClient: DocumentIntakeAPIProviding = DocumentIntakeAPIClient(),
        onSubmittedToReview: @escaping (String) -> Void = { _ in }
    ) {
        self.session = session
        self.productModeKey = productModeKey
        self.draftDocumentId = draftDocumentId
        self.onSubmittedToReview = onSubmittedToReview
        _viewModel = StateObject(wrappedValue: DocumentIntakeViewModel(apiClient: apiClient))
    }

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .bottom) {
                Color.black.ignoresSafeArea()

                ScrollViewReader { scrollProxy in
                    ScrollView(showsIndicators: false) {
                        Color.clear
                            .frame(height: 0)
                            .id("intake-scroll-top")

                        VStack(alignment: .leading, spacing: 0) {
                            Text(viewModel.documentTitle)
                                .font(DARCiFont.maisonNeue(.book, size: 24))
                                .lineSpacing(2.4)
                                .foregroundStyle(.white)
                                .fixedSize(horizontal: false, vertical: true)
                                .padding(.top, scaled(34, in: proxy))
                                .opacity(hasAppeared ? 1 : 0)
                                .offset(y: hasAppeared ? 0 : 12)

                            stepContent(in: proxy)
                                .padding(.top, scaled(20, in: proxy))
                                .opacity(hasAppeared ? 1 : 0)
                                .offset(y: hasAppeared ? 0 : 14)
                        }
                        .id(viewModel.step)
                        .padding(.top, scaled(170, in: proxy))
                        .padding(.horizontal, scaled(24, in: proxy))
                        .padding(.bottom, scaled(96, in: proxy))
                    }
                    .scrollDismissesKeyboard(.interactively)
                    .id(viewModel.scrollResetKey)
                    .onChange(of: viewModel.scrollResetKey) { _, _ in
                        expandedSelectKey = nil
                        scrollToTop(scrollProxy)
                    }
                }

                VStack {
                    Color.black
                        .frame(height: scaled(188, in: proxy))
                        .ignoresSafeArea(edges: .top)
                        .allowsHitTesting(false)

                    Spacer(minLength: 0)
                }
                .shadow(color: .black.opacity(0.8), radius: 18, x: 0, y: 10)
                .zIndex(99)

                VStack {
                    header(in: proxy)
                        .padding(.top, scaled(70, in: proxy))
                        .padding(.horizontal, scaled(24, in: proxy))
                        .padding(.bottom, scaled(18, in: proxy))
                        .background(Color.black.ignoresSafeArea(edges: .top))
                        .opacity(hasAppeared ? 1 : 0)
                        .offset(y: hasAppeared ? 0 : 10)

                    Spacer(minLength: 0)
                }
                .allowsHitTesting(true)
                .zIndex(100)

                tooltipOverlay(in: proxy)
                    .zIndex(240)

                selectDropdownOverlay(in: proxy)
                    .zIndex(220)
            }
            .coordinateSpace(name: intakeRootCoordinateSpace)
            .onPreferenceChange(SelectInputFramePreferenceKey.self) { frames in
                selectInputFrames = frames
            }
        }
        .navigationBarBackButtonHidden(true)
        .toolbar(.hidden, for: .navigationBar)
        .task(id: startTaskID) {
            await viewModel.start(modeKey: productModeKey, resumingDocumentId: draftDocumentId, session: session)
        }
        .onAppear {
            viewModel.resumeEditingAfterReview()
            withAnimation(.easeOut(duration: 0.42)) {
                hasAppeared = true
            }
        }
        .onChange(of: viewModel.step) { _, _ in
            activeTooltipKey = nil
            activeTooltipContent = nil
        }
        .onChange(of: viewModel.autosaveSignature) { _, _ in
            viewModel.scheduleAutosave(session: session)
        }
        .onChange(of: viewModel.submittedDocumentId) { _, documentId in
            guard let documentId else {
                return
            }

            onSubmittedToReview(documentId)
        }
        .onDisappear {
            Task {
                await viewModel.flushAutosave(session: session)
            }
        }
        .animation(.easeOut(duration: 0.28), value: viewModel.canContinue)
    }

    private func scrollToTop(_ scrollProxy: ScrollViewProxy) {
        DispatchQueue.main.async {
            scrollProxy.scrollTo("intake-scroll-top", anchor: .top)
        }
    }

    private var startTaskID: String {
        "\(session?.accessToken ?? "signed-out"): \(productModeKey):\(draftDocumentId ?? "new")"
    }

    private func header(in proxy: GeometryProxy) -> some View {
        VStack(alignment: .leading, spacing: scaled(42, in: proxy)) {
            Button {
                if viewModel.goBack() == false {
                    dismiss()
                }
            } label: {
                DARCiArrowLeftIcon()
                    .stroke(.white, style: StrokeStyle(lineWidth: 2.25, lineCap: .square, lineJoin: .miter))
                    .frame(width: scaled(24, in: proxy), height: scaled(24, in: proxy))
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Back")

            ZStack(alignment: .leading) {
                Rectangle()
                    .fill(Color.white.opacity(0.22))
                    .frame(height: 1)

                Rectangle()
                    .fill(Color.white)
                    .frame(width: progressWidth(in: proxy), height: 3)
                    .animation(.timingCurve(0.16, 1.0, 0.3, 1.0, duration: 0.62), value: viewModel.currentStepIndex)

                if let label = viewModel.step.topLabel {
                    Text(label)
                        .font(DARCiFont.maisonNeue(.light, size: 10))
                        .foregroundStyle(.white.opacity(0.86))
                        .frame(maxWidth: .infinity, alignment: .trailing)
                        .padding(.bottom, 16)
                        .transition(.opacity)
                }
            }
        }
    }

    @ViewBuilder
    private func stepContent(in proxy: GeometryProxy) -> some View {
        if viewModel.isLoading {
            ProgressView()
                .tint(.white)
                .frame(maxWidth: .infinity, minHeight: scaled(280, in: proxy))
                .accessibilityLabel("Loading intake")
        } else {
            VStack(alignment: .leading, spacing: scaled(24, in: proxy)) {
                switch viewModel.step {
                case .productInfo:
                    productInfoStep(in: proxy)
                case .trustBasicInformation:
                    trustBasicInformationStep(in: proxy)
                case .trustPeople:
                    trustPeopleStep(in: proxy)
                case .trustAuthority:
                    trustAuthorityStep(in: proxy)
                case .trustDocuments:
                    trustDocumentsStep(in: proxy)
                case .principal:
                    principalStep(in: proxy)
                case .agent:
                    agentStep(in: proxy)
                case .authority:
                    authorityStep(in: proxy)
                case .notarization:
                    notarizationStep(in: proxy)
                }

                formFooter(in: proxy)
            }
            .id(viewModel.step)
            .transition(.opacity)
            .animation(.easeOut(duration: 0.28), value: viewModel.step)
        }
    }

    private func productInfoStep(in proxy: GeometryProxy) -> some View {
        VStack(alignment: .leading, spacing: scaled(34, in: proxy)) {
            Text("New document details.\nAnswer each question in plain terms. If you're unsure, choose the closest option and continue.")
                .font(DARCiFont.maisonNeue(.light, size: 12))
                .lineSpacing(3.6)
                .foregroundStyle(.white)
                .fixedSize(horizontal: false, vertical: true)

            VStack(alignment: .leading, spacing: scaled(16, in: proxy)) {
                Text("Jurisdiction")
                    .font(DARCiFont.maisonNeue(.book, size: 14))
                    .foregroundStyle(.white)

                Text("Jurisdiction determines which state law governs this document, including signing formalities, trustee authority language, and enforceability standards.")
                    .font(DARCiFont.maisonNeue(.light, size: 12))
                    .lineSpacing(3.6)
                    .foregroundStyle(.white)
                    .fixedSize(horizontal: false, vertical: true)

                jurisdictionMenu
            }
        }
    }

    @ViewBuilder
    private func principalStep(in proxy: GeometryProxy) -> some View {
        if productModeKey == "trust_bundle" {
            trustBundlePrincipalStep(in: proxy)
        } else {
            personStep(
                nameLabel: viewModel.principalFullNameLabel,
                addressLabel: viewModel.principalAddressLabel,
                addressFieldKey: "principal_address",
                emailLabel: "Principal's email",
                phoneLabel: "Principal's phone number",
                showsAddress: viewModel.showsPrincipalAddress,
                showsContact: viewModel.showsPrincipalContact,
                person: $viewModel.principal,
                in: proxy
            )
        }
    }

    private func trustBundlePrincipalStep(in proxy: GeometryProxy) -> some View {
        VStack(alignment: .leading, spacing: scaled(24, in: proxy)) {
            VStack(alignment: .leading, spacing: scaled(10, in: proxy)) {
                Text("POA Requirements")
                    .font(DARCiFont.maisonNeue(.light, size: 12))
                    .foregroundStyle(.white)

                Text("Principal information")
                    .font(DARCiFont.maisonNeue(.book, size: 14))
                    .foregroundStyle(.white)

                Text("A companion POA will be generated for this Trustmaker.")
                    .font(DARCiFont.maisonNeue(.light, size: 12))
                    .lineSpacing(3.6)
                    .foregroundStyle(.white)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if let trustmakerIndex = viewModel.currentTrustmakerPrincipalGrantorIndex {
                let trustmaker = viewModel.grantors[trustmakerIndex]
                let addressFieldKey = "trustmaker-principal-\(trustmakerIndex)-address"

                VStack(alignment: .leading, spacing: scaled(14, in: proxy)) {
                    Text(viewModel.trustmakerPrincipalProgressLabel)
                        .font(DARCiFont.maisonNeue(.book, size: 11))
                        .foregroundStyle(.white.opacity(0.72))
                        .textCase(.uppercase)

                    intakeField(label: "Principal full legal name") {
                        Text(trustmaker.fullName)
                            .font(DARCiFont.maisonNeue(.book, size: 18))
                            .foregroundStyle(.white)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, minHeight: 49, alignment: .leading)
                            .padding(.horizontal, 16)
                            .background(Color(red: 0.10, green: 0.10, blue: 0.10))
                    }

                    ZStack(alignment: .topLeading) {
                        intakeField(label: "Principal address") {
                            AddressAutocompleteInput(
                                text: $viewModel.grantors[trustmakerIndex].address,
                                fieldKey: addressFieldKey,
                                session: session,
                                viewModel: viewModel
                            )
                        }
                    }
                    .zIndex(viewModel.addressAutocompleteFieldKey == addressFieldKey ? 1_000 : 1)

                    intakeField(label: "Principal email") {
                        Text(trustmaker.email)
                            .font(DARCiFont.maisonNeue(.book, size: 18))
                            .foregroundStyle(.white)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, minHeight: 49, alignment: .leading)
                            .padding(.horizontal, 16)
                            .background(Color(red: 0.10, green: 0.10, blue: 0.10))
                    }

                    intakeField(label: "Principal phone") {
                        Text(trustmaker.phone)
                            .font(DARCiFont.maisonNeue(.book, size: 18))
                            .foregroundStyle(.white)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, minHeight: 49, alignment: .leading)
                            .padding(.horizontal, 16)
                            .background(Color(red: 0.10, green: 0.10, blue: 0.10))
                    }
                }
            }
        }
    }

    private func poaOnlyPrincipalStep(in proxy: GeometryProxy) -> some View {
        personStep(
            nameLabel: viewModel.principalFullNameLabel,
            addressLabel: viewModel.principalAddressLabel,
            addressFieldKey: "principal_address",
            emailLabel: "Principal's email",
            phoneLabel: "Principal's phone number",
            showsAddress: viewModel.showsPrincipalAddress,
            showsContact: viewModel.showsPrincipalContact,
            person: $viewModel.principal,
            in: proxy
        )
    }

    private func trustBasicInformationStep(in proxy: GeometryProxy) -> some View {
        VStack(alignment: .leading, spacing: scaled(24, in: proxy)) {
            Text("Trust Requirements")
                .font(DARCiFont.maisonNeue(.light, size: 12))
                .foregroundStyle(.white)
                .padding(.bottom, scaled(8, in: proxy))

            VStack(alignment: .leading, spacing: scaled(14, in: proxy)) {
                Text("Jurisdiction")
                    .font(DARCiFont.maisonNeue(.book, size: 14))
                    .foregroundStyle(.white)

                jurisdictionMenu
            }

            intakeField(label: "Trust name", helpText: fieldHelpText(["trust_name"]), tooltipKey: "trust_name") {
                intakeTextField(text: $viewModel.trustName, prompt: "")
                    .accessibilityIdentifier("trust-name-field")
            }

            intakeField(label: "Trust date", helpText: fieldHelpText(["trust_date"]), tooltipKey: "trust_date") {
                intakeDateField(text: $viewModel.trustDate, prompt: "YYYY-MM-DD")
                    .accessibilityIdentifier("trust-date-field")
            }
            .overlay(alignment: .bottomLeading) {
                if viewModel.trustDate.count == 10, IntakeDateFormatting.isValidISODate(viewModel.trustDate) == false {
                    validationText("Enter a valid date.")
                        .offset(y: 15)
                        .zIndex(20)
                } else if viewModel.trustDate.count == 10, IntakeDateFormatting.isFutureISODate(viewModel.trustDate) {
                    validationText("Trust date cannot be in the future.")
                        .offset(y: 15)
                        .zIndex(20)
                }
            }
        }
    }

    private func trustPeopleStep(in proxy: GeometryProxy) -> some View {
        VStack(alignment: .leading, spacing: scaled(24, in: proxy)) {
            Text("Trust Requirements")
                .font(DARCiFont.maisonNeue(.light, size: 12))
                .foregroundStyle(.white)
                .padding(.bottom, scaled(8, in: proxy))

            trustPersonListField(
                label: "Trustmakers",
                roleLabel: "Trustmaker",
                addButtonLabel: "Add trustmaker",
                helpText: fieldHelpText(["grantors"]),
                tooltipKey: "grantors",
                rows: $viewModel.grantors,
                canAdd: viewModel.canAddTrustmaker,
                limitMessage: "A trust package supports up to two Trustmakers.",
                accessibilityPrefix: "trust-grantor",
                showsCurrentTrusteeSelection: true,
                in: proxy
            ) {
                viewModel.addTrustmaker()
            } removeAction: { index in
                viewModel.removeTrustmaker(at: index)
            }

            trustPersonListField(
                label: "Trustees",
                roleLabel: "Acting trustee",
                addButtonLabel: "Add acting trustee",
                helpText: fieldHelpText(["trustees"]),
                tooltipKey: "trustees",
                rows: $viewModel.trustees,
                canAdd: true,
                limitMessage: nil,
                accessibilityPrefix: "trust-trustee",
                showsNamedSignerSelection: viewModel.requiresNamedSigningTrusteeSelection,
                in: proxy
            ) {
                viewModel.addTrustee()
            } removeAction: { index in
                viewModel.removeTrustee(at: index)
            }

            trustPersonListField(
                label: "Successor trustees",
                optionalLabel: "Optional",
                roleLabel: "Successor trustee",
                addButtonLabel: "Add successor trustee",
                helpText: fieldHelpText(["successor_trustees"]),
                tooltipKey: "successor_trustees",
                rows: $viewModel.successorTrustees,
                canAdd: true,
                limitMessage: nil,
                accessibilityPrefix: "trust-successor-trustee",
                in: proxy
            ) {
                viewModel.addSuccessorTrustee()
            } removeAction: { index in
                viewModel.removeSuccessorTrustee(at: index)
            }

        }
    }

    private func trustPersonListField(
        label: String,
        optionalLabel: String? = nil,
        roleLabel: String,
        addButtonLabel: String,
        helpText: String?,
        tooltipKey: String,
        rows: Binding<[IntakePersonListItem]>,
        canAdd: Bool,
        limitMessage: String?,
        accessibilityPrefix: String,
        showsNamedSignerSelection: Bool = false,
        showsCurrentTrusteeSelection: Bool = false,
        in proxy: GeometryProxy,
        addAction: @escaping () -> Void,
        removeAction: @escaping (Int) -> Void
    ) -> some View {
        VStack(alignment: .leading, spacing: scaled(24, in: proxy)) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                fieldLabel(label: label, helpText: helpText, tooltipKey: tooltipKey)

                if let optionalLabel {
                    Text(optionalLabel)
                        .font(DARCiFont.maisonNeue(.light, size: 11))
                        .foregroundStyle(.white.opacity(0.55))
                }
            }

            ForEach(Array(rows.wrappedValue.indices), id: \.self) { index in
                trustPersonRow(
                    item: rows[index],
                    index: index,
                    rowCount: rows.wrappedValue.count,
                    roleLabel: roleLabel,
                    accessibilityPrefix: accessibilityPrefix,
                    showsNamedSignerSelection: showsNamedSignerSelection,
                    showsCurrentTrusteeSelection: showsCurrentTrusteeSelection,
                    in: proxy
                ) {
                    removeAction(index)
                }
            }

            if canAdd {
                Button(action: addAction) {
                    Text(addButtonLabel)
                        .font(DARCiFont.maisonNeue(.book, size: 14))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity, minHeight: scaled(44, in: proxy))
                        .overlay {
                            Rectangle()
                                .stroke(.white.opacity(0.62), lineWidth: 0.8)
                        }
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("\(accessibilityPrefix)-add-button")
            } else if let limitMessage {
                Text(limitMessage)
                    .font(DARCiFont.maisonNeue(.light, size: 11))
                    .foregroundStyle(.white.opacity(0.68))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func trustPersonRow(
        item: Binding<IntakePersonListItem>,
        index: Int,
        rowCount: Int,
        roleLabel: String,
        accessibilityPrefix: String,
        showsNamedSignerSelection: Bool,
        showsCurrentTrusteeSelection: Bool,
        in proxy: GeometryProxy,
        removeAction: @escaping () -> Void
    ) -> some View {
        VStack(alignment: .leading, spacing: scaled(24, in: proxy)) {
            if rowCount > 1 {
                Text("\(roleLabel) \(index + 1)")
                    .font(DARCiFont.maisonNeue(.light, size: 12))
                    .foregroundStyle(.white.opacity(0.72))
            }

            intakeField(label: "\(roleLabel) full name") {
                intakeTextField(text: item.fullName, prompt: "")
                    .accessibilityIdentifier("\(accessibilityPrefix)-\(index)-name-field")
            }

            intakeField(label: "Email") {
                intakeTextField(text: personListEmailBinding(item), prompt: "Email")
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .accessibilityIdentifier("\(accessibilityPrefix)-\(index)-email-field")
            }
            .overlay(alignment: .bottomLeading) {
                if let emailMessage = viewModel.emailValidationMessage(for: personListContact(from: item.wrappedValue)) {
                    validationText(emailMessage)
                        .offset(y: 15)
                        .zIndex(20)
                }
            }

            intakeField(label: "Phone") {
                HStack(spacing: 14) {
                    intakeTextField(text: personListPhoneCountryCodeBinding(item), prompt: "+1")
                        .keyboardType(.phonePad)
                        .frame(width: 92)
                        .accessibilityIdentifier("\(accessibilityPrefix)-\(index)-country-code-field")

                    IntakePhoneTextInput(
                        text: personListPhoneBinding(item),
                        countryIso2: item.wrappedValue.phoneCountryIso2,
                        prompt: "Phone"
                    )
                    .accessibilityIdentifier("\(accessibilityPrefix)-\(index)-phone-field")
                }
            }
            .overlay(alignment: .bottomLeading) {
                if let phoneMessage = viewModel.phoneValidationMessage(for: personListContact(from: item.wrappedValue)) {
                    validationText(phoneMessage)
                        .offset(y: 15)
                        .zIndex(20)
                }
            }

            HStack(alignment: .center, spacing: 14) {
                if showsCurrentTrusteeSelection {
                    Button {
                        viewModel.setTrustmakerCurrentTrustee(at: index, isSelected: item.wrappedValue.isCurrentTrustee == false)
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: item.wrappedValue.isCurrentTrustee ? "checkmark.square.fill" : "square")
                                .font(.system(size: 15, weight: .semibold))

                            Text("Current trustee")
                                .lineLimit(1)
                                .minimumScaleFactor(0.72)
                        }
                        .font(DARCiFont.maisonNeue(.book, size: 11))
                        .foregroundStyle(.white)
                    }
                    .buttonStyle(.plain)
                } else if showsNamedSignerSelection {
                    Button {
                        viewModel.setSigningTrustee(at: index, isSelected: item.wrappedValue.isSigningTrustee == false)
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: item.wrappedValue.isSigningTrustee ? "checkmark.square.fill" : "square")
                                .font(.system(size: 15, weight: .semibold))

                            Text("Named signing trustee")
                                .lineLimit(1)
                                .minimumScaleFactor(0.72)
                        }
                        .font(DARCiFont.maisonNeue(.book, size: 11))
                        .foregroundStyle(.white)
                    }
                    .buttonStyle(.plain)
                }

                Spacer(minLength: 10)

                Button(action: removeAction) {
                    Text("Remove")
                        .font(DARCiFont.maisonNeue(.book, size: 11))
                        .foregroundStyle(.white.opacity(0.76))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("\(accessibilityPrefix)-\(index)-remove-button")
            }
        }
    }

    private func trustAuthorityStep(in proxy: GeometryProxy) -> some View {
        VStack(alignment: .leading, spacing: scaled(24, in: proxy)) {
            VStack(alignment: .leading, spacing: scaled(10, in: proxy)) {
                Text("Trust Requirements")
                    .font(DARCiFont.maisonNeue(.light, size: 12))
                    .foregroundStyle(.white)

                Text("Authority")
                    .font(DARCiFont.maisonNeue(.book, size: 14))
                    .foregroundStyle(.white)
            }

            intakeField(label: "Trustee signature authority", helpText: fieldHelpText(["trustee_signature_authority"]), tooltipKey: "trustee_signature_authority") {
                optionMenu(
                    key: "trustee-signature-authority",
                    selection: $viewModel.selectedTrusteeSignatureAuthority,
                    options: viewModel.trusteeSignatureAuthorityOptions,
                    placeholder: "Select an option"
                )
                .accessibilityIdentifier("trust-trustee-signature-authority-menu")
            }

            if viewModel.selectedTrusteeSignatureAuthority == "custom" {
                intakeField(label: "Custom signing authority instructions", helpText: fieldHelpText(["trustee_signature_authority_custom_text"]), tooltipKey: "trustee_signature_authority_custom_text") {
                    intakeTextEditor(text: $viewModel.trusteeSignatureAuthorityCustomText, prompt: "")
                }
            }

            intakeField(label: "Who can revoke the trust?", helpText: fieldHelpText(["revocation_holders"]), tooltipKey: "revocation_holders") {
                optionMenu(
                    key: "revocation-holders",
                    selection: $viewModel.revocationHolders,
                    options: viewModel.revocationHolderOptions,
                    placeholder: "Select an option"
                )
                .accessibilityIdentifier("trust-revocation-holders-menu")
            }

            if viewModel.revocationHolders == "custom" {
                intakeField(label: "Describe the revocation rule", helpText: fieldHelpText(["revocation_holders_custom_text"]), tooltipKey: "revocation_holders_custom_text") {
                    intakeTextEditor(text: $viewModel.revocationHoldersCustomText, prompt: "")
                }
            }

            intakeField(label: "How is trustee incapacity determined?", helpText: fieldHelpText(["trustee_incapacity_standard"]), tooltipKey: "trustee_incapacity_standard") {
                optionMenu(
                    key: "trustee-incapacity-standard",
                    selection: $viewModel.selectedTrusteeIncapacityStandard,
                    options: viewModel.trusteeIncapacityStandardOptions,
                    placeholder: "Select an option"
                )
                .accessibilityIdentifier("trust-trustee-incapacity-standard-menu")
            }

            intakeField(label: "Primary tax ID owner", optionalLabel: viewModel.requiresTaxIdOwnerSelection ? nil : "Optional", helpText: fieldHelpText(["tax_id_owner"]), tooltipKey: "tax_id_owner") {
                optionMenu(
                    key: "tax-id-owner",
                    selection: $viewModel.selectedTaxIdOwner,
                    options: viewModel.taxIdOwnerOptions,
                    placeholder: "Select primary trustmaker"
                )
            }
            .overlay(alignment: .bottomLeading) {
                if viewModel.requiresTaxIdOwnerSelection, viewModel.selectedTaxIdOwner.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    validationText("Select a primary tax ID owner from the listed Trustmakers.")
                        .offset(y: 15)
                        .zIndex(20)
                }
            }

            intakeField(label: "Asset titling format", optionalLabel: "Optional", helpText: fieldHelpText(["asset_titling_format"]), tooltipKey: "asset_titling_format") {
                intakeTextField(text: $viewModel.assetTitlingFormat, prompt: "")
            }

            VStack(alignment: .leading, spacing: scaled(14, in: proxy)) {
                HStack(alignment: .center, spacing: 10) {
                    fieldLabel(label: "Trustee powers", helpText: fieldHelpText(["trustee_powers"]), tooltipKey: "trustee_powers")
                        .zIndex(activeTooltipKey == "trustee_powers" ? 160 : 0)

                    Spacer(minLength: 10)

                    Button {
                        viewModel.selectAllTrusteePowers()
                    } label: {
                        HStack(spacing: 6) {
                            Text("Select all")

                            Image(systemName: "checkmark")
                                .font(.system(size: 10, weight: .semibold))
                                .opacity(viewModel.areAllTrusteePowersSelected ? 1 : 0.48)
                        }
                        .font(DARCiFont.maisonNeue(.book, size: 12))
                        .foregroundStyle(.white)
                    }
                    .buttonStyle(.plain)
                }

                FlexibleAuthorityGrid(options: viewModel.trusteePowerOptions) { option in
                    AuthorityScopeChip(
                        option: option,
                        isSelected: viewModel.selectedTrusteePowers.contains(option.id)
                    ) {
                        viewModel.toggleTrusteePower(option)
                    }
                }
            }

        }
    }

    private func trustDocumentsStep(in proxy: GeometryProxy) -> some View {
        VStack(alignment: .leading, spacing: scaled(24, in: proxy)) {
            VStack(alignment: .leading, spacing: scaled(10, in: proxy)) {
                Text("Trust Requirements")
                    .font(DARCiFont.maisonNeue(.light, size: 12))
                    .foregroundStyle(.white)

                Text("Documents to include")
                    .font(DARCiFont.maisonNeue(.book, size: 14))
                    .foregroundStyle(.white)

                Text("List the original trust document first, then any amendments or supporting documents in signed-date order.")
                    .font(DARCiFont.maisonNeue(.light, size: 12))
                    .lineSpacing(3.6)
                    .foregroundStyle(.white)
                    .fixedSize(horizontal: false, vertical: true)
            }

            intakeField(label: "Documents to include", helpText: fieldHelpText(["prior_document_items"]), tooltipKey: "prior_document_items") {
                VStack(alignment: .leading, spacing: scaled(16, in: proxy)) {
                    if viewModel.priorDocumentItems.isEmpty {
                        Text("No documents to include listed yet.")
                            .font(DARCiFont.maisonNeue(.light, size: 12))
                            .foregroundStyle(.white.opacity(0.68))
                    }

                    ForEach(viewModel.priorDocumentItems.indices, id: \.self) { index in
                        priorDocumentRow(
                            index: index,
                            item: $viewModel.priorDocumentItems[index],
                            in: proxy
                        )
                    }

                    if viewModel.incompletePriorDocumentRowCount > 0 {
                        validationText("Complete type, date, document label, and recording/attachment reference for each listed document.")
                    }

                    if viewModel.invalidPriorDocumentDateCount > 0 {
                        validationText("Signed dates must be valid dates and cannot be in the future.")
                    }

                    if viewModel.hasMissingOriginatingPriorDocument {
                        validationText("Document 1 must be either a Trust Agreement or Declaration of Trust.")
                    }

                    if viewModel.priorDocumentChronologyOutOfOrderCount > 0 {
                        validationText("Keep document dates in chronological order from oldest to newest.")
                    }

                    Button {
                        priorDocumentFileImporterIndex = viewModel.priorDocumentItems.count
                        isPriorDocumentFileImporterPresented = true
                    } label: {
                        Text("Add document to include")
                            .font(DARCiFont.maisonNeue(.book, size: 12))
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .overlay {
                                Rectangle()
                                    .stroke(.white.opacity(0.36), lineWidth: 1)
                            }
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("trust-add-prior-document-button")
                }
            }

        }
        .fileImporter(
            isPresented: $isPriorDocumentFileImporterPresented,
            allowedContentTypes: [.pdf],
            allowsMultipleSelection: false
        ) { result in
            handlePriorDocumentFileImport(result)
        }
    }

    private func priorDocumentRow(index: Int, item: Binding<IntakePriorDocumentItem>, in proxy: GeometryProxy) -> some View {
        VStack(alignment: .leading, spacing: scaled(16, in: proxy)) {
            HStack(alignment: .center, spacing: 12) {
                Text("Document \(index + 1)")
                    .font(DARCiFont.maisonNeue(.book, size: 11))
                    .foregroundStyle(.white.opacity(0.72))
                    .textCase(.uppercase)

                Spacer(minLength: 10)

                Text(index == 0 ? "Originating document" : "Amendment/supporting")
                    .font(DARCiFont.maisonNeue(.light, size: 11))
                    .foregroundStyle(.white.opacity(0.64))
            }

            intakeField(label: "Type") {
                priorDocumentTypeMenu(index: index, item: item)
                    .accessibilityIdentifier("trust-prior-document-\(index)-type-menu")
            }

            intakeField(label: "Signed date") {
                intakeDateField(text: item.documentDate, prompt: "YYYY-MM-DD")
                    .accessibilityIdentifier("trust-prior-document-\(index)-date-field")
            }
            .overlay(alignment: .bottomLeading) {
                if item.wrappedValue.documentDate.count == 10,
                   IntakeDateFormatting.isValidISODate(item.wrappedValue.documentDate) == false {
                    validationText("Enter a valid date.")
                        .offset(y: 15)
                        .zIndex(20)
                } else if item.wrappedValue.documentDate.count == 10,
                          IntakeDateFormatting.isFutureISODate(item.wrappedValue.documentDate) {
                    validationText("Signed date cannot be in the future.")
                        .offset(y: 15)
                        .zIndex(20)
                }
            }

            intakeField(label: "Document label") {
                intakeTextField(text: item.documentLabel, prompt: "Original trust agreement, amendment, affidavit, etc.")
                    .accessibilityIdentifier("trust-prior-document-\(index)-label-field")
            }

            intakeField(label: "Recording or attachment reference") {
                intakeTextField(text: item.attachmentReference, prompt: "Book 20, Page 104 or agreement-2021.pdf")
                    .accessibilityIdentifier("trust-prior-document-\(index)-reference-field")
            }

            Button {
                priorDocumentFileImporterIndex = index
                isPriorDocumentFileImporterPresented = true
            } label: {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Select PDF attachment")
                        .font(DARCiFont.maisonNeue(.book, size: 13))
                    Text(item.wrappedValue.attachmentReference.isEmpty ? "PDF only" : item.wrappedValue.attachmentReference)
                        .font(DARCiFont.maisonNeue(.light, size: 11))
                        .lineLimit(1)
                        .minimumScaleFactor(0.74)
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, minHeight: 58, alignment: .leading)
                .padding(.horizontal, 14)
                .overlay {
                    Rectangle()
                        .stroke(style: StrokeStyle(lineWidth: 1, dash: [5, 4]))
                        .foregroundStyle(.white.opacity(0.40))
                }
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("trust-prior-document-\(index)-file-button")

            Button {
                viewModel.removePriorDocumentItem(at: index)
            } label: {
                Text("Remove document")
                    .font(DARCiFont.maisonNeue(.book, size: 11))
                    .foregroundStyle(.white.opacity(0.76))
                    .frame(maxWidth: .infinity, minHeight: 38)
                    .overlay {
                        Rectangle()
                            .stroke(.white.opacity(0.22), lineWidth: 1)
                    }
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("trust-prior-document-\(index)-remove-button")
        }
    }

    private func priorDocumentTypeMenu(index: Int, item: Binding<IntakePriorDocumentItem>) -> some View {
        let selectedText = item.wrappedValue.documentType.isEmpty
            ? "Select type"
            : viewModel.priorDocumentTypeLabel(for: item.wrappedValue.documentType)

        return CustomSelectInput(
            key: "prior-document-type-\(index)",
            selectedText: selectedText,
            placeholder: "Select type",
            options: viewModel.priorDocumentTypeOptions.map { CustomSelectOption(id: $0.id, label: $0.label) },
            expandedKey: $expandedSelectKey,
            isDisabled: viewModel.priorDocumentTypeOptions.isEmpty
        ) { selectedId in
            item.wrappedValue.documentType = selectedId
            expandedSelectKey = nil
        }
    }

    private func agentStep(in proxy: GeometryProxy) -> some View {
        VStack(alignment: .leading, spacing: scaled(24, in: proxy)) {
            personStep(
                nameLabel: viewModel.agentFullNameLabel,
                addressLabel: viewModel.agentAddressLabel,
                addressFieldKey: "agent_address",
                emailLabel: "Agent email",
                phoneLabel: "Agent's phone number",
                showsAddress: viewModel.showsAgentAddress,
                showsContact: viewModel.showsAgentContact,
                person: $viewModel.agent,
                in: proxy
            )

            if viewModel.showsSuccessorAgents {
                intakeField(label: viewModel.successorAgentsLabel, optionalLabel: "Optional", helpText: fieldHelpText(["successor_agents", "successor_agent_list"]), tooltipKey: "successor_agents") {
                    intakeTextField(text: $viewModel.successorAgents, prompt: "")
                        .accessibilityIdentifier("poa-successor-agents-field")
                }
            }
        }
    }

    private func authorityStep(in proxy: GeometryProxy) -> some View {
        VStack(alignment: .leading, spacing: scaled(24, in: proxy)) {
            VStack(alignment: .leading, spacing: scaled(10, in: proxy)) {
                Text("POA Requirements")
                    .font(DARCiFont.maisonNeue(.light, size: 12))
                    .foregroundStyle(.white)

                Text("Authority")
                    .font(DARCiFont.maisonNeue(.book, size: 14))
                    .foregroundStyle(.white)

                Text("Confirm who may act, revoke and sign. Trust-specific authority appears first.")
                    .font(DARCiFont.maisonNeue(.light, size: 12))
                    .lineSpacing(3.6)
                    .foregroundStyle(.white)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if viewModel.showsAgentSignatureAuthority {
                intakeField(label: "Multiple-agent signing rule", helpText: fieldHelpText(["agent_signature_authority"]), tooltipKey: "agent_signature_authority") {
                    optionMenu(
                        key: "agent-signature-authority",
                        selection: $viewModel.selectedAgentSignatureAuthority,
                        options: viewModel.agentSignatureAuthorityOptions,
                        placeholder: "Select an option"
                    )
                    .accessibilityIdentifier("poa-agent-signature-authority-menu")
                }
            }

            if viewModel.showsAuthorityScopeSelection {
                VStack(alignment: .leading, spacing: scaled(14, in: proxy)) {
                    HStack(alignment: .center, spacing: 10) {
                        fieldLabel(label: "Authority scope selection", helpText: fieldHelpText(["authority_scope_selection"]), tooltipKey: "authority_scope_selection")
                            .zIndex(activeTooltipKey == "authority_scope_selection" ? 160 : 0)

                        Spacer(minLength: 10)

                        Button {
                            viewModel.selectAllAuthorityScopes()
                        } label: {
                            HStack(spacing: 6) {
                                Text("Select all")

                                Image(systemName: "checkmark")
                                    .font(.system(size: 10, weight: .semibold))
                                    .opacity(viewModel.areAllAuthorityScopesSelected ? 1 : 0.48)
                            }
                            .font(DARCiFont.maisonNeue(.book, size: 12))
                            .foregroundStyle(.white)
                        }
                        .buttonStyle(.plain)
                    }

                    FlexibleAuthorityGrid(options: viewModel.authorityScopeOptions) { option in
                        AuthorityScopeChip(
                            option: option,
                            isSelected: viewModel.selectedAuthorityScopes.contains(option.id)
                        ) {
                            viewModel.toggleAuthorityScope(option)
                        }
                    }
                }
            }

            if viewModel.showsSpecialInstructions {
                intakeField(
                    label: viewModel.specialInstructionsLabel,
                    optionalLabel: "Optional",
                    helpText: viewModel.specialInstructionsHelpText,
                    tooltipKey: "special_instructions_text"
                ) {
                    intakeTextEditor(
                        text: $viewModel.specialInstructions,
                        prompt: "Add any special instructions for this power of attorney."
                    )
                    .accessibilityIdentifier("poa-special-instructions-field")
                }
            }

        }
    }

    private func notarizationStep(in proxy: GeometryProxy) -> some View {
        VStack(alignment: .leading, spacing: scaled(24, in: proxy)) {
            VStack(alignment: .leading, spacing: scaled(10, in: proxy)) {
                Text("Document notarization")
                    .font(DARCiFont.maisonNeue(.light, size: 12))
                    .foregroundStyle(.white)

                Text("Upload a PDF and describe what needs to be notarized.")
                    .font(DARCiFont.maisonNeue(.light, size: 12))
                    .lineSpacing(3.6)
                    .foregroundStyle(.white)
                    .fixedSize(horizontal: false, vertical: true)
            }

            intakeField(label: "Document upload") {
                Button {
                    isFileImporterPresented = true
                } label: {
                    Text(viewModel.notarizationFileName.isEmpty ? "Select PDF" : viewModel.notarizationFileName)
                        .font(DARCiFont.maisonNeue(.book, size: 12))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                        .truncationMode(.middle)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .padding(.horizontal, 14)
                        .overlay {
                            Rectangle()
                                .stroke(.white.opacity(0.36), lineWidth: 1)
                        }
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("notarization-pdf-picker")
            }

            if viewModel.notarizationFileName.isEmpty == false {
                VStack(alignment: .leading, spacing: scaled(24, in: proxy)) {
                    Button("Clear selected file") {
                        viewModel.clearNotarizationFile()
                    }
                    .font(DARCiFont.maisonNeue(.book, size: 15))
                    .foregroundStyle(.white.opacity(0.7))

                    VStack(alignment: .leading, spacing: scaled(14, in: proxy)) {
                        Text("Jurisdiction")
                            .font(DARCiFont.maisonNeue(.book, size: 14))
                            .foregroundStyle(.white)

                        jurisdictionMenu
                    }

                    intakeField(label: "Document description") {
                        intakeTextEditor(text: $viewModel.notarizationDocumentDescription, prompt: "")
                            .frame(minHeight: 120)
                            .accessibilityIdentifier("notarization-description-field")
                    }

                    intakeField(label: "Reason for notarizing document", optionalLabel: "Optional") {
                        intakeTextEditor(text: $viewModel.notarizationReason, prompt: "")
                            .frame(minHeight: 110)
                            .accessibilityIdentifier("notarization-reason-field")
                    }
                }
            }
        }
        .fileImporter(
            isPresented: $isFileImporterPresented,
            allowedContentTypes: [.pdf],
            allowsMultipleSelection: false
        ) { result in
            handleFileImport(result)
        }
    }

    private func personStep(
        nameLabel: String,
        addressLabel: String,
        addressFieldKey: String,
        emailLabel: String,
        phoneLabel: String,
        showsAddress: Bool,
        showsContact: Bool,
        person: Binding<IntakePersonDetails>,
        in proxy: GeometryProxy
    ) -> some View {
        VStack(alignment: .leading, spacing: scaled(24, in: proxy)) {
            Text("POA Requirements")
            .font(DARCiFont.maisonNeue(.light, size: 12))
                .foregroundStyle(.white)
            .padding(.bottom, scaled(10, in: proxy))

            intakeField(label: nameLabel, helpText: fieldHelpText(nameFieldKeys(for: addressFieldKey)), tooltipKey: "\(addressFieldKey)-name") {
                intakeTextField(text: person.fullLegalName, prompt: "")
            }
            .zIndex(0)

            if showsAddress {
                ZStack(alignment: .topLeading) {
                    intakeField(label: addressLabel, helpText: fieldHelpText([addressFieldKey]), tooltipKey: addressFieldKey) {
                        AddressAutocompleteInput(
                            text: person.addressLine1,
                            fieldKey: addressFieldKey,
                            session: session,
                            viewModel: viewModel
                        )
                    }
                }
                .zIndex(viewModel.addressAutocompleteFieldKey == addressFieldKey ? 1_000 : 1)
            }

            if showsContact {
                VStack(alignment: .leading, spacing: scaled(24, in: proxy)) {
                    intakeField(label: emailLabel, helpText: fieldHelpText(contactFieldKeys(for: addressFieldKey)), tooltipKey: "\(addressFieldKey)-email") {
                        intakeTextField(text: emailBinding(person.contact), prompt: "")
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                    }
                    .overlay(alignment: .bottomLeading) {
                        if let emailMessage = viewModel.emailValidationMessage(for: person.wrappedValue.contact) {
                            validationText(emailMessage)
                                .offset(y: 15)
                                .zIndex(20)
                        }
                    }

                    intakeField(label: phoneLabel, helpText: fieldHelpText(contactFieldKeys(for: addressFieldKey)), tooltipKey: "\(addressFieldKey)-phone") {
                        HStack(spacing: 14) {
                            intakeTextField(text: phoneCountryCodeBinding(person.contact), prompt: "+1")
                                .keyboardType(.phonePad)
                                .frame(width: 92)

                            IntakePhoneTextInput(
                                text: phoneBinding(person.contact),
                                countryIso2: person.wrappedValue.contact.phoneCountryIso2,
                                prompt: ""
                            )
                        }
                    }
                    .overlay(alignment: .bottomLeading) {
                        if let phoneMessage = viewModel.phoneValidationMessage(for: person.wrappedValue.contact) {
                            validationText(phoneMessage)
                                .offset(y: 15)
                                .zIndex(20)
                        }
                    }
                }
                .zIndex(0)
            }
        }
    }

    private func emailBinding(_ contact: Binding<IntakePersonContact>) -> Binding<String> {
        Binding(
            get: { contact.wrappedValue.email },
            set: { nextValue in
                contact.wrappedValue.email = IntakeContactFormatting.normalizedEmailInput(nextValue)
            }
        )
    }

    private func phoneCountryCodeBinding(_ contact: Binding<IntakePersonContact>) -> Binding<String> {
        Binding(
            get: { contact.wrappedValue.phoneCountryCode },
            set: { nextValue in
                let formattedCode = IntakeContactFormatting.normalizedPhoneCountryCodeInput(nextValue)
                contact.wrappedValue.phoneCountryCode = formattedCode
                contact.wrappedValue.phoneCountryIso2 = IntakeContactFormatting.phoneCountryIso2(forDialCode: formattedCode)
                contact.wrappedValue.phone = IntakeContactFormatting.formatPhoneInputForEditing(
                    contact.wrappedValue.phone,
                    countryIso2: contact.wrappedValue.phoneCountryIso2
                )
            }
        )
    }

    private func phoneBinding(_ contact: Binding<IntakePersonContact>) -> Binding<String> {
        Binding(
            get: { contact.wrappedValue.phone },
            set: { nextValue in
                contact.wrappedValue.phone = IntakeContactFormatting.formatPhoneInputForEditing(
                    nextValue,
                    countryIso2: contact.wrappedValue.phoneCountryIso2
                )
            }
        )
    }

    private func personListEmailBinding(_ item: Binding<IntakePersonListItem>) -> Binding<String> {
        Binding(
            get: { item.wrappedValue.email },
            set: { nextValue in
                item.wrappedValue.email = IntakeContactFormatting.normalizedEmailInput(nextValue)
            }
        )
    }

    private func personListPhoneCountryCodeBinding(_ item: Binding<IntakePersonListItem>) -> Binding<String> {
        Binding(
            get: { item.wrappedValue.phoneCountryCode },
            set: { nextValue in
                let formattedCode = IntakeContactFormatting.normalizedPhoneCountryCodeInput(nextValue)
                item.wrappedValue.phoneCountryCode = formattedCode
                item.wrappedValue.phoneCountryIso2 = IntakeContactFormatting.phoneCountryIso2(forDialCode: formattedCode)
                item.wrappedValue.phone = IntakeContactFormatting.formatPhoneInputForEditing(
                    item.wrappedValue.phone,
                    countryIso2: item.wrappedValue.phoneCountryIso2
                )
            }
        )
    }

    private func personListPhoneBinding(_ item: Binding<IntakePersonListItem>) -> Binding<String> {
        Binding(
            get: { item.wrappedValue.phone },
            set: { nextValue in
                item.wrappedValue.phone = IntakeContactFormatting.formatPhoneInputForEditing(
                    nextValue,
                    countryIso2: item.wrappedValue.phoneCountryIso2
                )
            }
        )
    }

    private func personListContact(from item: IntakePersonListItem) -> IntakePersonContact {
        IntakePersonContact(
            email: item.email,
            phoneCountryIso2: item.phoneCountryIso2,
            phoneCountryCode: item.phoneCountryCode,
            phone: item.phone
        )
    }

    private func validationText(_ message: String) -> some View {
        Text(message)
            .font(DARCiFont.maisonNeue(.light, size: 10))
            .foregroundStyle(Color(red: 1.0, green: 0.74, blue: 0.34))
            .fixedSize(horizontal: false, vertical: true)
    }

    private func fieldHelpText(_ keys: [String]) -> String? {
        viewModel.helpText(for: keys)
    }

    private func nameFieldKeys(for addressFieldKey: String) -> [String] {
        switch addressFieldKey {
        case "agent_address":
            ["agent_full_legal_name", "agent_full_name"]
        default:
            ["principal_full_legal_name", "principal_full_name"]
        }
    }

    private func contactFieldKeys(for addressFieldKey: String) -> [String] {
        addressFieldKey == "agent_address" ? ["agent_contact"] : ["principal_contact"]
    }

    @ViewBuilder
    private var statusMessages: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let errorMessage = viewModel.errorMessage {
                Text(errorMessage)
                    .font(DARCiFont.maisonNeue(.light, size: 12))
                    .foregroundStyle(Color(red: 1.0, green: 0.45, blue: 0.45))
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("poa-intake-error")
            }

            if let draftNotice = viewModel.draftNotice {
                Text(draftNotice)
                    .font(DARCiFont.maisonNeue(.light, size: 12))
                    .foregroundStyle(.white.opacity(0.68))
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("poa-intake-draft-notice")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func formFooter(in proxy: GeometryProxy) -> some View {
        VStack(alignment: .leading, spacing: scaled(14, in: proxy)) {
            statusMessages

            continueButton(in: proxy)
        }
        .padding(.top, scaled(10, in: proxy))
    }

    private var jurisdictionMenu: some View {
        CustomSelectInput(
            key: "jurisdiction",
            selectedText: viewModel.selectedJurisdictionLabel,
            placeholder: "Select jurisdiction",
            options: viewModel.jurisdictions.map { CustomSelectOption(id: $0.id, label: viewModel.jurisdictionOptionLabel($0)) },
            expandedKey: $expandedSelectKey,
            isDisabled: viewModel.jurisdictions.isEmpty
        ) { selectedId in
            guard let jurisdiction = viewModel.jurisdictions.first(where: { $0.id == selectedId }) else {
                return
            }

            Task {
                expandedSelectKey = nil
                await viewModel.selectJurisdiction(jurisdiction, session: session)
            }
        }
        .accessibilityIdentifier("poa-jurisdiction-menu")
    }

    private func optionMenu(
        key: String,
        selection: Binding<String>,
        options: [IntakeOption],
        placeholder: String
    ) -> some View {
        let selectedLabel = options.first { $0.id == selection.wrappedValue }?.label
        return CustomSelectInput(
            key: key,
            selectedText: selectedLabel ?? placeholder,
            placeholder: placeholder,
            options: options.map { CustomSelectOption(id: $0.id, label: $0.label) },
            expandedKey: $expandedSelectKey,
            isDisabled: options.isEmpty
        ) { selectedId in
            selection.wrappedValue = selectedId
            expandedSelectKey = nil
        }
    }

    private var activeSelectPresentation: SelectDropdownPresentation? {
        guard let expandedSelectKey else {
            return nil
        }

        switch expandedSelectKey {
        case "jurisdiction":
            return SelectDropdownPresentation(
                key: expandedSelectKey,
                selectedText: viewModel.selectedJurisdictionLabel,
                options: viewModel.jurisdictions.map { CustomSelectOption(id: $0.id, label: viewModel.jurisdictionOptionLabel($0)) }
            ) { selectedId in
                guard let jurisdiction = viewModel.jurisdictions.first(where: { $0.id == selectedId }) else {
                    return
                }

                Task {
                    self.expandedSelectKey = nil
                    await viewModel.selectJurisdiction(jurisdiction, session: session)
                }
            }
        case "trustee-signature-authority":
            return selectPresentation(
                key: expandedSelectKey,
                selectedValue: viewModel.selectedTrusteeSignatureAuthority,
                options: viewModel.trusteeSignatureAuthorityOptions
            ) { selectedId in
                viewModel.selectedTrusteeSignatureAuthority = selectedId
            }
        case "tax-id-owner":
            return selectPresentation(
                key: expandedSelectKey,
                selectedValue: viewModel.selectedTaxIdOwner,
                options: viewModel.taxIdOwnerOptions
            ) { selectedId in
                viewModel.selectedTaxIdOwner = selectedId
            }
        case "revocation-holders":
            return selectPresentation(
                key: expandedSelectKey,
                selectedValue: viewModel.revocationHolders,
                options: viewModel.revocationHolderOptions
            ) { selectedId in
                viewModel.revocationHolders = selectedId
            }
        case "trustee-incapacity-standard":
            return selectPresentation(
                key: expandedSelectKey,
                selectedValue: viewModel.selectedTrusteeIncapacityStandard,
                options: viewModel.trusteeIncapacityStandardOptions
            ) { selectedId in
                viewModel.selectedTrusteeIncapacityStandard = selectedId
            }
        case "agent-signature-authority":
            return selectPresentation(
                key: expandedSelectKey,
                selectedValue: viewModel.selectedAgentSignatureAuthority,
                options: viewModel.agentSignatureAuthorityOptions
            ) { selectedId in
                viewModel.selectedAgentSignatureAuthority = selectedId
            }
        case _ where expandedSelectKey.hasPrefix("prior-document-type-"):
            let indexText = expandedSelectKey.replacingOccurrences(of: "prior-document-type-", with: "")
            guard let index = Int(indexText), viewModel.priorDocumentItems.indices.contains(index) else {
                return nil
            }

            return selectPresentation(
                key: expandedSelectKey,
                selectedValue: viewModel.priorDocumentItems[index].documentType,
                options: viewModel.priorDocumentTypeOptions
            ) { selectedId in
                viewModel.priorDocumentItems[index].documentType = selectedId
            }
        default:
            return nil
        }
    }

    private func selectPresentation(
        key: String,
        selectedValue: String,
        options: [IntakeOption],
        onSelect: @escaping (String) -> Void
    ) -> SelectDropdownPresentation {
        let selectedText = options.first { $0.id == selectedValue }?.label ?? ""
        return SelectDropdownPresentation(
            key: key,
            selectedText: selectedText,
            options: options.map { CustomSelectOption(id: $0.id, label: $0.label) }
        ) { selectedId in
            onSelect(selectedId)
            expandedSelectKey = nil
        }
    }

    @ViewBuilder
    private func selectDropdownOverlay(in proxy: GeometryProxy) -> some View {
        if let presentation = activeSelectPresentation,
           let frame = selectInputFrames[presentation.key],
           presentation.options.isEmpty == false {
            let rawHeight = CGFloat(presentation.options.count) * 43
            let maxPanelHeight = min(rawHeight, 258)
            let availableBelow = max(86, proxy.size.height - frame.maxY - scaled(24, in: proxy))
            let panelHeight = min(maxPanelHeight, availableBelow)
            let panelCenterY = min(
                frame.maxY + 4 + (panelHeight / 2),
                proxy.size.height - (panelHeight / 2) - scaled(18, in: proxy)
            )

            ZStack(alignment: .topLeading) {
                Color.black.opacity(0.001)
                    .ignoresSafeArea()
                    .onTapGesture {
                        expandedSelectKey = nil
                    }

                selectDropdownPanel(presentation)
                    .frame(width: frame.width, height: panelHeight)
                    .position(x: frame.midX, y: panelCenterY)
                    .transition(.opacity)
            }
        }
    }

    private func selectDropdownPanel(_ presentation: SelectDropdownPresentation) -> some View {
        ScrollView(showsIndicators: presentation.options.count > 6) {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(presentation.options) { option in
                    Button {
                        presentation.onSelect(option.id)
                    } label: {
                        HStack(spacing: 10) {
                            Text(option.label)
                                .font(DARCiFont.maisonNeue(.book, size: 14))
                                .foregroundStyle(.white)
                                .lineLimit(1)
                                .minimumScaleFactor(0.74)

                            Spacer(minLength: 10)

                            if option.label == presentation.selectedText {
                                Image(systemName: "checkmark")
                                    .font(.system(size: 11, weight: .semibold))
                                    .foregroundStyle(.white)
                            }
                        }
                        .frame(maxWidth: .infinity, minHeight: 43, alignment: .leading)
                        .padding(.horizontal, 14)
                        .background(option.label == presentation.selectedText ? Color.white.opacity(0.10) : Color(red: 0.13, green: 0.13, blue: 0.13))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .background(Color(red: 0.13, green: 0.13, blue: 0.13))
        .overlay {
            Rectangle()
                .stroke(.white.opacity(0.18), lineWidth: 1)
        }
        .shadow(color: .black.opacity(0.48), radius: 24, x: 0, y: 12)
    }

    private func menuLabel(text: String, placeholder: String) -> some View {
        HStack {
            Text(text)
                .font(DARCiFont.maisonNeue(.book, size: text == placeholder ? 14 : 18))
                .foregroundStyle(text == placeholder ? Color(red: 0.19, green: 0.19, blue: 0.19) : .white)
                .lineLimit(1)
                .minimumScaleFactor(0.72)

            Spacer(minLength: 12)

            DARCiArrowRightIcon()
                .stroke(.white, style: StrokeStyle(lineWidth: 2.2, lineCap: .square, lineJoin: .miter))
                .frame(width: 24, height: 24)
        }
        .frame(maxWidth: .infinity, minHeight: 49)
        .padding(.horizontal, 16)
        .background(Color(red: 0.10, green: 0.10, blue: 0.10))
    }

    private func intakeField<Content: View>(
        label: String,
        optionalLabel: String? = nil,
        helpText: String? = nil,
        tooltipKey: String? = nil,
        @ViewBuilder content: () -> Content
    ) -> some View {
        let resolvedTooltipKey = tooltipKey ?? label

        return VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .center) {
                fieldLabel(label: label, helpText: helpText, tooltipKey: resolvedTooltipKey)
                    .zIndex(activeTooltipKey == resolvedTooltipKey ? 160 : 0)

                Spacer(minLength: 12)

                if let optionalLabel {
                    Text(optionalLabel)
                        .font(DARCiFont.maisonNeue(.light, size: 10))
                        .foregroundStyle(Color(red: 0.35, green: 0.35, blue: 0.35))
                }
            }

            content()
                .zIndex(0)
        }
        .padding(.bottom, 6)
        .zIndex(activeTooltipKey == resolvedTooltipKey ? 160 : 0)
    }

    private func fieldLabel(label: String, helpText: String?, tooltipKey: String) -> some View {
        HStack(alignment: .center, spacing: 7) {
            Text(label)
                .font(DARCiFont.maisonNeue(.book, size: 14))
                .foregroundStyle(.white)
                .fixedSize(horizontal: false, vertical: true)

            if let helpText {
                FieldHelpTooltip(
                    key: tooltipKey,
                    content: helpText,
                    activeKey: $activeTooltipKey,
                    activeContent: $activeTooltipContent
                )
            }
        }
    }

    @ViewBuilder
    private func tooltipOverlay(in proxy: GeometryProxy) -> some View {
        if let activeTooltipContent {
            VStack(alignment: .leading, spacing: 0) {
                Text(activeTooltipContent)
                    .font(DARCiFont.maisonNeue(.light, size: 11))
                    .lineSpacing(4)
                    .foregroundStyle(.white)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(Color.black)
                    .overlay {
                        Rectangle()
                            .stroke(.white.opacity(0.22), lineWidth: 1)
                    }
                    .shadow(color: .black.opacity(0.55), radius: 22, x: 0, y: 12)
                    .padding(.top, scaled(142, in: proxy))
                    .padding(.horizontal, scaled(24, in: proxy))
                    .transition(.opacity)

                Spacer(minLength: 0)
            }
            .allowsHitTesting(false)
        }
    }

    private func intakeTextField(text: Binding<String>, prompt: String) -> some View {
        IntakeTextInput(text: text, prompt: prompt)
    }

    private func intakeDateField(text: Binding<String>, prompt: String) -> some View {
        IntakeDateTextInput(text: text, prompt: prompt)
            .frame(minHeight: 49)
    }

    private func intakeTextEditor(text: Binding<String>, prompt: String) -> some View {
        IntakeTextEditorInput(text: text, prompt: prompt)
    }

    private func continueButton(in proxy: GeometryProxy) -> some View {
        Button {
            Task {
                await viewModel.continueTapped(session: session)
            }
        } label: {
            HStack(spacing: 12) {
                Spacer()

                if viewModel.isSaving {
                    ProgressView()
                        .tint(.black)
                }

                Text(viewModel.continueLabel)
                    .font(DARCiFont.maisonNeue(.book, size: 22))
                    .foregroundStyle(.black)

                DARCiArrowCornerIcon()
                    .stroke(.black, style: StrokeStyle(lineWidth: 2.4, lineCap: .square, lineJoin: .miter))
                    .frame(width: 28, height: 28)
            }
            .frame(maxWidth: .infinity, minHeight: scaled(54, in: proxy))
            .padding(.horizontal, scaled(22, in: proxy))
            .background(DARCiTheme.onboardingGreen)
            .opacity(viewModel.canContinue ? 1 : 0.34)
        }
        .buttonStyle(.plain)
        .disabled(viewModel.canContinue == false)
        .accessibilityIdentifier("poa-intake-continue")
    }

    private func progressWidth(in proxy: GeometryProxy) -> CGFloat {
        let availableWidth = proxy.size.width - scaled(48, in: proxy)
        return availableWidth * CGFloat(viewModel.currentStepIndex) / CGFloat(max(viewModel.totalStepCount, 1))
    }

    private func handleFileImport(_ result: Result<[URL], Error>) {
        do {
            guard let url = try result.get().first else {
                return
            }

            let fileName = url.lastPathComponent
            guard fileName.lowercased().hasSuffix(".pdf") else {
                viewModel.errorMessage = "Document upload: select a PDF file."
                return
            }

            let didAccess = url.startAccessingSecurityScopedResource()
            defer {
                if didAccess {
                    url.stopAccessingSecurityScopedResource()
                }
            }

            let data = try Data(contentsOf: url)
            guard data.count <= maxPDFUploadBytes else {
                viewModel.errorMessage = "Document upload: PDFs must be 25 MB or smaller."
                return
            }

            viewModel.selectNotarizationFile(name: fileName, size: data.count, data: data)
        } catch {
            viewModel.errorMessage = "Document upload: failed to read the selected PDF."
        }
    }

    private func handlePriorDocumentFileImport(_ result: Result<[URL], Error>) {
        defer {
            priorDocumentFileImporterIndex = nil
            isPriorDocumentFileImporterPresented = false
        }

        do {
            guard let index = priorDocumentFileImporterIndex,
                  let url = try result.get().first else {
                return
            }

            let fileName = url.lastPathComponent
            guard fileName.lowercased().hasSuffix(".pdf") else {
                viewModel.errorMessage = "Documents to include: select a PDF file."
                return
            }

            if index == viewModel.priorDocumentItems.count {
                let newIndex = viewModel.addPriorDocumentItem()
                viewModel.setPriorDocumentAttachmentReference(at: newIndex, fileName: fileName)
            } else {
                viewModel.setPriorDocumentAttachmentReference(at: index, fileName: fileName)
            }
        } catch {
            viewModel.errorMessage = "Documents to include: failed to read the selected PDF."
        }
    }

    private func scaled(_ value: CGFloat, in proxy: GeometryProxy) -> CGFloat {
        value * min(proxy.size.width / 440, 1.08)
    }
}

private struct FlexibleAuthorityGrid<Content: View>: View {
    let options: [IntakeOption]
    let content: (IntakeOption) -> Content

    var body: some View {
        AuthorityChipFlowLayout(horizontalSpacing: 8, verticalSpacing: 9) {
            ForEach(options) { option in
                content(option)
            }
        }
    }
}

private struct FieldHelpTooltip: View {
    let key: String
    let content: String
    @Binding var activeKey: String?
    @Binding var activeContent: String?

    private var isActive: Bool {
        activeKey == key
    }

    var body: some View {
        Button {
            withAnimation(.easeOut(duration: 0.16)) {
                if isActive {
                    activeKey = nil
                    activeContent = nil
                } else {
                    activeKey = key
                    activeContent = content
                }
            }
        } label: {
            Text("?")
                .font(DARCiFont.maisonNeue(.book, size: 9))
                .foregroundStyle(isActive ? .black : .white)
                .frame(width: 15, height: 15)
                .background(isActive ? Color.white : Color.clear)
                .overlay {
                    Circle()
                        .stroke(.white.opacity(0.78), lineWidth: 0.8)
                }
                .clipShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Explain field")
        .zIndex(isActive ? 180 : 0)
    }
}

private struct CustomSelectOption: Identifiable, Equatable {
    let id: String
    let label: String
}

private struct SelectDropdownPresentation {
    let key: String
    let selectedText: String
    let options: [CustomSelectOption]
    let onSelect: (String) -> Void
}

private struct SelectInputFramePreferenceKey: PreferenceKey {
    static let defaultValue: [String: CGRect] = [:]

    static func reduce(value: inout [String: CGRect], nextValue: () -> [String: CGRect]) {
        value.merge(nextValue(), uniquingKeysWith: { _, newValue in newValue })
    }
}

private struct CustomSelectInput: View {
    let key: String
    let selectedText: String
    let placeholder: String
    let options: [CustomSelectOption]
    @Binding var expandedKey: String?
    let isDisabled: Bool
    let onSelect: (String) -> Void

    private var isExpanded: Bool {
        expandedKey == key
    }

    var body: some View {
        Button {
            guard isDisabled == false else {
                return
            }

            withAnimation(.easeOut(duration: 0.16)) {
                expandedKey = isExpanded ? nil : key
            }
        } label: {
            HStack {
                Text(selectedText)
                    .font(DARCiFont.maisonNeue(.book, size: selectedText == placeholder ? 14 : 18))
                    .foregroundStyle(selectedText == placeholder ? Color(red: 0.19, green: 0.19, blue: 0.19) : .white)
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
        .background {
            GeometryReader { geometry in
                Color.clear.preference(
                    key: SelectInputFramePreferenceKey.self,
                    value: [key: geometry.frame(in: .named(intakeRootCoordinateSpace))]
                )
            }
        }
        .zIndex(isExpanded ? 1_000 : 0)
    }
}

private struct AddressAutocompleteInput: View {
    @Binding var text: String
    let fieldKey: String
    let session: AuthSession?
    @ObservedObject var viewModel: DocumentIntakeViewModel
    @State private var searchTask: Task<Void, Never>?
    @State private var isResolvingSelection = false

    private var isActive: Bool {
        viewModel.addressAutocompleteFieldKey == fieldKey
    }

    private var statusMessage: String? {
        guard isActive else {
            return nil
        }

        if viewModel.isAddressAutocompleteLoading {
            return "Looking up addresses..."
        }

        if viewModel.resolvingAddressFieldKey == fieldKey {
            return "Normalizing address..."
        }

        return viewModel.addressAutocompleteError
    }

    private var isErrorStatus: Bool {
        isActive && viewModel.addressAutocompleteError != nil
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            VStack(alignment: .leading, spacing: 6) {
                IntakeTextInput(text: $text, prompt: "Start typing an address")
                    .textInputAutocapitalization(.words)
                    .autocorrectionDisabled()
                    .onChange(of: text) { _, nextValue in
                        guard isResolvingSelection == false else {
                            return
                        }

                        searchTask?.cancel()
                        searchTask = Task {
                            try? await Task.sleep(for: .milliseconds(260))
                            guard Task.isCancelled == false else {
                                return
                            }

                            await viewModel.searchAddressSuggestions(
                                fieldKey: fieldKey,
                                query: nextValue,
                                session: session
                            )
                        }
                    }
            }

            if let statusMessage {
                Text(statusMessage)
                    .font(DARCiFont.maisonNeue(.light, size: 10))
                    .foregroundStyle(isErrorStatus ? Color(red: 1.0, green: 0.74, blue: 0.34) : .white.opacity(0.64))
                    .fixedSize(horizontal: false, vertical: true)
                    .offset(y: 55)
                    .zIndex(40)
            }

            if isActive, viewModel.addressAutocompleteSuggestions.isEmpty == false {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(viewModel.addressAutocompleteSuggestions) { suggestion in
                        Button {
                            searchTask?.cancel()
                            isResolvingSelection = true
                            viewModel.clearAddressAutocomplete()

                            Task {
                                let normalizedAddress = await viewModel.resolveAddressSuggestion(
                                    suggestion,
                                    fieldKey: fieldKey,
                                    session: session
                                )
                                text = normalizedAddress
                                viewModel.clearAddressAutocomplete()
                                try? await Task.sleep(for: .milliseconds(320))
                                isResolvingSelection = false
                            }
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(suggestion.mainText?.nilIfEmpty ?? suggestion.description)
                                    .font(DARCiFont.maisonNeue(.book, size: 12))
                                    .foregroundStyle(.white)
                                    .lineLimit(1)

                                if let secondaryText = suggestion.secondaryText?.nilIfEmpty {
                                    Text(secondaryText)
                                        .font(DARCiFont.maisonNeue(.light, size: 10))
                                        .foregroundStyle(.white.opacity(0.62))
                                        .lineLimit(1)
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 9)
                            .background(Color(red: 0.13, green: 0.13, blue: 0.13))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .background(Color(red: 0.13, green: 0.13, blue: 0.13))
                .overlay {
                    Rectangle()
                        .stroke(.white.opacity(0.18), lineWidth: 1)
                }
                .shadow(color: .black.opacity(0.36), radius: 22, x: 0, y: 12)
                .offset(y: 53)
                .transition(.opacity)
                .zIndex(700)
            }
        }
        .zIndex(isActive ? 700 : 0)
        .onDisappear {
            searchTask?.cancel()
        }
    }
}

private struct IntakePhoneTextInput: View {
    @Binding var text: String
    let countryIso2: String
    let prompt: String
    @State private var displayText = ""
    @FocusState private var isFocused: Bool

    var body: some View {
        TextField(prompt, text: $displayText, prompt: Text(prompt).foregroundStyle(.white.opacity(0.24)))
            .font(DARCiFont.maisonNeue(.book, size: 18))
            .foregroundStyle(.white)
            .tint(DARCiTheme.onboardingGreen)
            .keyboardType(.phonePad)
            .focused($isFocused)
            .padding(.horizontal, 14)
            .frame(minHeight: 49)
            .background(Color(red: 0.10, green: 0.10, blue: 0.10))
            .overlay(alignment: .bottom) {
                Rectangle()
                    .fill(.white.opacity(isFocused ? 1 : 0))
                    .frame(height: 1)
            }
            .onAppear {
                syncDisplayText(from: text)
            }
            .onChange(of: displayText) { _, nextValue in
                let digits = IntakeContactFormatting.limitedPhoneInput(nextValue, countryIso2: countryIso2)
                let formatted = IntakeContactFormatting.formatPhoneInputForEditing(digits, countryIso2: countryIso2)
                text = formatted

                if displayText != formatted {
                    displayText = formatted
                }
            }
            .onChange(of: text) { _, nextValue in
                syncDisplayText(from: nextValue)
            }
            .onChange(of: countryIso2) { _, _ in
                let formatted = IntakeContactFormatting.formatPhoneInputForEditing(displayText, countryIso2: countryIso2)
                text = formatted
                displayText = formatted
            }
            .animation(.easeOut(duration: 0.18), value: isFocused)
    }

    private func syncDisplayText(from nextValue: String) {
        let formatted = IntakeContactFormatting.formatPhoneInputForEditing(nextValue, countryIso2: countryIso2)
        if displayText != formatted {
            displayText = formatted
        }
    }
}

private struct IntakeDateTextInput: UIViewRepresentable {
    @Binding var text: String
    let prompt: String

    func makeCoordinator() -> Coordinator {
        Coordinator(text: $text)
    }

    func makeUIView(context: Context) -> UITextField {
        let textField = UITextField(frame: .zero)
        textField.delegate = context.coordinator
        textField.keyboardType = .numberPad
        textField.textContentType = .none
        textField.autocorrectionType = .no
        textField.autocapitalizationType = .none
        textField.textColor = .white
        textField.tintColor = UIColor(DARCiTheme.onboardingGreen)
        textField.backgroundColor = UIColor(red: 0.10, green: 0.10, blue: 0.10, alpha: 1)
        textField.font = UIFont(name: DARCiFont.MaisonNeue.book.postScriptName, size: 18) ?? .systemFont(ofSize: 18)
        textField.attributedPlaceholder = NSAttributedString(
            string: prompt,
            attributes: [.foregroundColor: UIColor.white.withAlphaComponent(0.24)]
        )
        textField.leftView = UIView(frame: CGRect(x: 0, y: 0, width: 14, height: 1))
        textField.leftViewMode = .always
        textField.rightView = UIView(frame: CGRect(x: 0, y: 0, width: 14, height: 1))
        textField.rightViewMode = .always
        return textField
    }

    func updateUIView(_ textField: UITextField, context: Context) {
        let formatted = IntakeDateFormatting.formatISODateInput(text)
        if textField.text != formatted {
            textField.text = formatted
        }

        context.coordinator.text = $text
    }

    final class Coordinator: NSObject, UITextFieldDelegate {
        var text: Binding<String>

        init(text: Binding<String>) {
            self.text = text
        }

        func textField(_ textField: UITextField, shouldChangeCharactersIn range: NSRange, replacementString string: String) -> Bool {
            let currentText = textField.text ?? ""
            guard let textRange = Range(range, in: currentText) else {
                return false
            }

            let proposedText = currentText.replacingCharacters(in: textRange, with: string)
            let formatted = IntakeDateFormatting.formatISODateInput(proposedText)
            textField.text = formatted
            text.wrappedValue = formatted
            return false
        }
    }
}

private struct IntakeTextInput: View {
    @Binding var text: String
    let prompt: String
    @FocusState private var isFocused: Bool

    var body: some View {
        TextField(prompt, text: $text, prompt: Text(prompt).foregroundStyle(.white.opacity(0.24)))
            .font(DARCiFont.maisonNeue(.book, size: 18))
            .foregroundStyle(.white)
            .tint(DARCiTheme.onboardingGreen)
            .focused($isFocused)
            .padding(.horizontal, 14)
            .frame(minHeight: 49)
            .background(Color(red: 0.10, green: 0.10, blue: 0.10))
            .overlay(alignment: .bottom) {
                Rectangle()
                    .fill(.white.opacity(isFocused ? 1 : 0))
                    .frame(height: 1)
            }
            .animation(.easeOut(duration: 0.18), value: isFocused)
    }
}

private struct IntakeTextEditorInput: View {
    @Binding var text: String
    let prompt: String
    @FocusState private var isFocused: Bool

    var body: some View {
        ZStack(alignment: .topLeading) {
            if text.isEmpty, prompt.isEmpty == false {
                Text(prompt)
                    .font(DARCiFont.maisonNeue(.book, size: 14))
                    .foregroundStyle(Color(red: 0.19, green: 0.19, blue: 0.19))
                    .padding(.horizontal, 14)
                    .padding(.top, 14)
            }

            TextEditor(text: $text)
                .font(DARCiFont.maisonNeue(.book, size: 14))
                .foregroundStyle(.white)
                .tint(DARCiTheme.onboardingGreen)
                .focused($isFocused)
                .scrollContentBackground(.hidden)
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                .frame(minHeight: 98)
                .background(Color.clear)
        }
        .background(Color(red: 0.10, green: 0.10, blue: 0.10))
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(.white.opacity(isFocused ? 1 : 0))
                .frame(height: 1)
        }
        .animation(.easeOut(duration: 0.18), value: isFocused)
    }
}

private extension String {
    var nilIfEmpty: String? {
        isEmpty ? nil : self
    }
}

private struct AuthorityChipFlowLayout: Layout {
    let horizontalSpacing: CGFloat
    let verticalSpacing: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? 0
        var lineWidth: CGFloat = 0
        var lineHeight: CGFloat = 0
        var totalHeight: CGFloat = 0
        var widestLine: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            let proposedWidth = lineWidth == 0 ? size.width : lineWidth + horizontalSpacing + size.width

            if maxWidth > 0, proposedWidth > maxWidth, lineWidth > 0 {
                widestLine = max(widestLine, lineWidth)
                totalHeight += lineHeight + verticalSpacing
                lineWidth = size.width
                lineHeight = size.height
            } else {
                lineWidth = proposedWidth
                lineHeight = max(lineHeight, size.height)
            }
        }

        widestLine = max(widestLine, lineWidth)
        totalHeight += lineHeight
        return CGSize(width: maxWidth > 0 ? maxWidth : widestLine, height: totalHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var origin = bounds.origin
        var lineHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if origin.x > bounds.minX, origin.x + size.width > bounds.maxX {
                origin.x = bounds.minX
                origin.y += lineHeight + verticalSpacing
                lineHeight = 0
            }

            subview.place(at: origin, proposal: ProposedViewSize(size))
            origin.x += size.width + horizontalSpacing
            lineHeight = max(lineHeight, size.height)
        }
    }
}

private struct AuthorityScopeChip: View {
    let option: IntakeOption
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(option.label)
                .font(DARCiFont.maisonNeue(.book, size: 14))
                .foregroundStyle(isSelected ? .black : .white)
                .lineLimit(1)
                .minimumScaleFactor(0.72)
                .padding(.horizontal, 11)
                .frame(height: 32)
                .background(isSelected ? Color.white : Color.clear)
                .overlay {
                    Rectangle()
                        .stroke(.white, lineWidth: 0.5)
                }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("poa-authority-scope-\(option.id)")
        .accessibilityValue(isSelected ? "Selected" : "")
    }
}

#Preview {
    NavigationStack {
        ProductIntakeFlowView(
            session: nil,
            productModeKey: "poa_only",
            apiClient: MockDocumentIntakeAPIClient()
        )
    }
}
