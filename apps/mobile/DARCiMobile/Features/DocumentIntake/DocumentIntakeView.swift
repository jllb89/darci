import SwiftUI
import UniformTypeIdentifiers

struct ProductIntakeRoute: Identifiable, Hashable {
    let modeKey: String

    var id: String { modeKey }
}

struct ProductIntakeFlowView: View {
    private let session: AuthSession?
    private let productModeKey: String

    @Environment(\.dismiss) private var dismiss
    @StateObject private var viewModel: DocumentIntakeViewModel
    @State private var isFileImporterPresented = false
    @State private var hasAppeared = false
    @State private var expandedSelectKey: String?
    @State private var activeTooltipKey: String?
    @State private var activeTooltipContent: String?

    init(
        session: AuthSession?,
        productModeKey: String,
        apiClient: DocumentIntakeAPIProviding = DocumentIntakeAPIClient()
    ) {
        self.session = session
        self.productModeKey = productModeKey
        _viewModel = StateObject(wrappedValue: DocumentIntakeViewModel(apiClient: apiClient))
    }

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .bottom) {
                Color.black.ignoresSafeArea()

                ScrollView(showsIndicators: false) {
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
                    .padding(.top, scaled(170, in: proxy))
                    .padding(.horizontal, scaled(24, in: proxy))
                    .padding(.bottom, scaled(96, in: proxy))
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

                if usesInlineContinueButton == false {
                    continueButton(in: proxy)
                        .padding(.horizontal, scaled(22, in: proxy))
                        .padding(.bottom, scaled(28, in: proxy))
                        .opacity(hasAppeared ? 1 : 0)
                        .offset(y: hasAppeared ? 0 : 20)
                }

                tooltipOverlay(in: proxy)
                    .zIndex(240)
            }
        }
        .navigationBarBackButtonHidden(true)
        .toolbar(.hidden, for: .navigationBar)
        .task(id: session?.accessToken) {
            await viewModel.start(modeKey: productModeKey, session: session)
        }
        .onAppear {
            withAnimation(.easeOut(duration: 0.42)) {
                hasAppeared = true
            }
        }
        .onChange(of: viewModel.step) { _, _ in
            activeTooltipKey = nil
            activeTooltipContent = nil
        }
        .animation(.easeOut(duration: 0.28), value: viewModel.canContinue)
    }

    private var usesInlineContinueButton: Bool {
        viewModel.step == .authority
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
            }
            .overlay(alignment: .bottomLeading) {
                statusMessages
                    .offset(y: 24)
                    .zIndex(30)
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

    private func principalStep(in proxy: GeometryProxy) -> some View {
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
                intakeTextField(text: $viewModel.trustDate, prompt: "YYYY-MM-DD")
                    .keyboardType(.numbersAndPunctuation)
                    .accessibilityIdentifier("trust-date-field")
            }
        }
    }

    private func trustPeopleStep(in proxy: GeometryProxy) -> some View {
        VStack(alignment: .leading, spacing: scaled(24, in: proxy)) {
            Text("Trust Requirements")
                .font(DARCiFont.maisonNeue(.light, size: 12))
                .foregroundStyle(.white)
                .padding(.bottom, scaled(8, in: proxy))

            intakeField(label: "Trustmakers", helpText: fieldHelpText(["grantors"]), tooltipKey: "grantors") {
                intakeTextEditor(text: $viewModel.grantors, prompt: "One trustmaker per line")
                    .accessibilityIdentifier("trust-grantors-field")
            }

            intakeField(label: "Trustees", helpText: fieldHelpText(["trustees"]), tooltipKey: "trustees") {
                intakeTextEditor(text: $viewModel.trustees, prompt: "One trustee per line")
                    .accessibilityIdentifier("trust-trustees-field")
            }

            intakeField(label: "Successor trustees", optionalLabel: "Optional", helpText: fieldHelpText(["successor_trustees"]), tooltipKey: "successor_trustees") {
                intakeTextEditor(text: $viewModel.successorTrustees, prompt: "One successor trustee per line")
            }

            intakeField(label: "Revocation holders", optionalLabel: "Optional", helpText: fieldHelpText(["revocation_holders"]), tooltipKey: "revocation_holders") {
                intakeTextEditor(text: $viewModel.revocationHolders, prompt: "One holder per line")
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
            .zIndex(expandedSelectKey == "trustee-signature-authority" ? 40 : 0)

            if viewModel.selectedTrusteeSignatureAuthority == "custom" {
                intakeField(label: "Custom signing authority instructions", helpText: fieldHelpText(["trustee_signature_authority_custom_text"]), tooltipKey: "trustee_signature_authority_custom_text") {
                    intakeTextEditor(text: $viewModel.trusteeSignatureAuthorityCustomText, prompt: "")
                }
            }

            intakeField(label: "Primary tax ID owner", optionalLabel: "Optional", helpText: fieldHelpText(["tax_id_owner"]), tooltipKey: "tax_id_owner") {
                optionMenu(
                    key: "tax-id-owner",
                    selection: $viewModel.selectedTaxIdOwner,
                    options: viewModel.taxIdOwnerOptions,
                    placeholder: "Select primary trustmaker"
                )
            }
            .zIndex(expandedSelectKey == "tax-id-owner" ? 40 : 0)

            intakeField(label: "Asset titling format", optionalLabel: "Optional", helpText: fieldHelpText(["asset_titling_format"]), tooltipKey: "asset_titling_format") {
                intakeTextField(text: $viewModel.assetTitlingFormat, prompt: "")
            }

            VStack(alignment: .leading, spacing: scaled(14, in: proxy)) {
                fieldLabel(label: "Trustee powers", helpText: fieldHelpText(["trustee_powers"]), tooltipKey: "trustee_powers")
                    .zIndex(activeTooltipKey == "trustee_powers" ? 160 : 0)

                FlexibleAuthorityGrid(options: viewModel.trusteePowerOptions) { option in
                    AuthorityScopeChip(
                        option: option,
                        isSelected: viewModel.selectedTrusteePowers.contains(option.id)
                    ) {
                        viewModel.toggleTrusteePower(option)
                    }
                }
            }

            intakeField(label: "Revocation custom language", optionalLabel: "Optional", helpText: fieldHelpText(["revocation_holders_custom_text"]), tooltipKey: "revocation_holders_custom_text") {
                intakeTextEditor(text: $viewModel.revocationHoldersCustomText, prompt: "")
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

                Text("Enter one document per line as title | type | YYYY-MM-DD | recording or attachment reference.")
                    .font(DARCiFont.maisonNeue(.light, size: 12))
                    .lineSpacing(3.6)
                    .foregroundStyle(.white)
                    .fixedSize(horizontal: false, vertical: true)
            }

            intakeField(label: "Documents to include", helpText: fieldHelpText(["prior_document_items"]), tooltipKey: "prior_document_items") {
                intakeTextEditor(text: $viewModel.priorDocumentItems, prompt: "Original trust agreement | trust_agreement | 2021-04-05 | agreement.pdf")
                    .frame(minHeight: 132)
                    .accessibilityIdentifier("trust-prior-documents-field")
            }
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
                .zIndex(expandedSelectKey == "agent-signature-authority" ? 1_000 : 0)
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
                .zIndex(expandedSelectKey == "agent-signature-authority" ? -1 : 0)
            }

            continueButton(in: proxy)
                .padding(.top, scaled(8, in: proxy))
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

            VStack(alignment: .leading, spacing: scaled(14, in: proxy)) {
                Text("Jurisdiction")
                    .font(DARCiFont.maisonNeue(.book, size: 14))
                    .foregroundStyle(.white)

                jurisdictionMenu
            }

            intakeField(label: "Document upload") {
                Button {
                    isFileImporterPresented = true
                } label: {
                    menuLabel(
                        text: viewModel.notarizationFileName.isEmpty ? "Select PDF" : viewModel.notarizationFileName,
                        placeholder: "Select PDF"
                    )
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("notarization-pdf-picker")
            }

            if viewModel.notarizationFileName.isEmpty == false {
                Button("Clear selected file") {
                    viewModel.clearNotarizationFile()
                }
                .font(DARCiFont.maisonNeue(.book, size: 15))
                .foregroundStyle(.white.opacity(0.7))
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

    private var jurisdictionMenu: some View {
        CustomSelectInput(
            key: "jurisdiction",
            selectedText: viewModel.selectedJurisdictionLabel,
            placeholder: "Select jurisdiction",
            options: viewModel.jurisdictions.map { CustomSelectOption(id: $0.id, label: $0.label) },
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
        .zIndex(expandedSelectKey == "jurisdiction" ? 40 : 0)
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

        return VStack(alignment: .leading, spacing: 10) {
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

            let didAccess = url.startAccessingSecurityScopedResource()
            defer {
                if didAccess {
                    url.stopAccessingSecurityScopedResource()
                }
            }

            let data = try Data(contentsOf: url)
            viewModel.selectNotarizationFile(name: url.lastPathComponent, size: data.count, data: data)
        } catch {
            viewModel.errorMessage = "Document upload: failed to read the selected PDF."
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
        .overlay(alignment: .topLeading) {
            if isExpanded {
                dropdownPanel
                    .offset(y: 53)
                    .transition(.opacity)
                    .zIndex(1_000)
            }
        }
        .zIndex(isExpanded ? 1_000 : 0)
    }

    private var dropdownPanel: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(options) { option in
                Button {
                    onSelect(option.id)
                } label: {
                    HStack(spacing: 10) {
                        Text(option.label)
                            .font(DARCiFont.maisonNeue(.book, size: 14))
                            .foregroundStyle(.white)
                            .lineLimit(1)
                            .minimumScaleFactor(0.74)

                        Spacer(minLength: 10)

                        if option.label == selectedText {
                            Image(systemName: "checkmark")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundStyle(.white)
                        }
                    }
                    .frame(maxWidth: .infinity, minHeight: 43, alignment: .leading)
                    .padding(.horizontal, 14)
                    .background(option.label == selectedText ? Color.white.opacity(0.10) : Color(red: 0.13, green: 0.13, blue: 0.13))
                }
                .buttonStyle(.plain)
            }
        }
        .frame(height: CGFloat(options.count) * 43)
        .background(Color(red: 0.13, green: 0.13, blue: 0.13))
        .overlay {
            Rectangle()
                .stroke(.white.opacity(0.18), lineWidth: 1)
        }
        .shadow(color: .black.opacity(0.36), radius: 22, x: 0, y: 12)
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