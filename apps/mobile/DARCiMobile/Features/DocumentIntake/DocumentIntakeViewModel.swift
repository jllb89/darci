import Foundation
import OSLog

@MainActor
final class DocumentIntakeViewModel: ObservableObject {
    static let rulesSnapshotVersion = "member_form_rules_contract_v1"
    private static let notarizationMaxUploadBytes = 25 * 1024 * 1024
    private static let logger = Logger(subsystem: "com.illuminote.darci", category: "document-intake")

    @Published private(set) var step: POAIntakeStep = .productInfo
    @Published private(set) var jurisdictions: [IntakeJurisdictionOption] = []
    @Published private(set) var isLoading = false
    @Published private(set) var isSaving = false
    @Published private(set) var isSubmitted = false
    @Published private(set) var submittedDocumentId: String?
    @Published private(set) var trustmakerPrincipalIndex = 0
    @Published private(set) var draftUpdatedAt: String?
    @Published var errorMessage: String?
    @Published var draftNotice: String?
    @Published var selectedJurisdiction = "CA"
    @Published var principal = IntakePersonDetails()
    @Published var agent = IntakePersonDetails()
    @Published var successorAgents = ""
    @Published var selectedAgentSignatureAuthority = ""
    @Published var selectedAuthorityScopes: Set<String> = []
    @Published var trustName = ""
    @Published var trustDate = "" {
        didSet {
            let formatted = IntakeDateFormatting.formatISODateInput(trustDate)
            if trustDate != formatted {
                trustDate = formatted
            }
        }
    }
    @Published var grantors = [IntakePersonListItem()] {
        didSet {
            syncTrusteesFromCurrentTrustmakers()
        }
    }
    @Published var trustees = [IntakePersonListItem()]
    @Published var successorTrustees = [IntakePersonListItem()]
    @Published var revocationHolders = ""
    @Published var selectedTrusteeSignatureAuthority = ""
    @Published var trusteeSignatureAuthorityCustomText = ""
    @Published var selectedTrusteeIncapacityStandard = ""
    @Published var selectedTaxIdOwner = ""
    @Published var assetTitlingFormat = ""
    @Published var selectedTrusteePowers: Set<String> = []
    @Published var revocationHoldersCustomText = ""
    @Published var priorDocumentItems = [IntakePriorDocumentItem]()
    @Published var notarizationFileName = ""
    @Published var notarizationFileSize = 0
    @Published var notarizationFileData: Data?
    @Published var notarizationDocumentDescription = ""
    @Published var notarizationReason = ""
    @Published private(set) var addressAutocompleteFieldKey: String?
    @Published private(set) var addressAutocompleteSuggestions: [AddressAutocompleteSuggestion] = []
    @Published private(set) var isAddressAutocompleteLoading = false
    @Published private(set) var resolvingAddressFieldKey: String?
    @Published var addressAutocompleteError: String?

    private let apiClient: DocumentIntakeAPIProviding
    private var productModeKey: String?
    private var resumedDocumentId: String?
    private var memberForm: MemberFormRulesContract?
    private var fieldsByKey: [String: MemberFacingField] = [:]
    private var documentId: String?
    private var draftRevision: Int?
    private var lastServerDraftSignature: String?
    private var autosaveTask: Task<Void, Never>?
    private var addressSessionTokens: [String: String] = [:]

    init(apiClient: DocumentIntakeAPIProviding = DocumentIntakeAPIClient()) {
        self.apiClient = apiClient
    }

    var selectedJurisdictionLabel: String {
        jurisdictionOptionLabel(jurisdictions.first { $0.code == selectedJurisdiction })
    }

    func jurisdictionOptionLabel(_ jurisdiction: IntakeJurisdictionOption?) -> String {
        let rawCode = jurisdiction?.code ?? selectedJurisdiction
        let compactCode = rawCode.replacingOccurrences(of: "US-", with: "")
        return compactCode.isEmpty ? rawCode : compactCode
    }

    var agentSignatureAuthorityOptions: [IntakeOption] {
        field(for: ["agent_signature_authority"])?.allowedOptions ?? []
    }

    var authorityScopeOptions: [IntakeOption] {
        field(for: ["authority_scope_selection"])?.allowedOptions ?? []
    }

    var principalFullNameLabel: String {
        field(for: ["principal_full_legal_name", "principal_full_name"])?.label ?? "Principal full legal name"
    }

    var agentFullNameLabel: String {
        field(for: ["agent_full_legal_name", "agent_full_name"])?.label ?? "Agent full legal name"
    }

    var principalAddressLabel: String {
        field(for: ["principal_address"])?.label ?? "Principal address"
    }

    var agentAddressLabel: String {
        field(for: ["agent_address"])?.label ?? "Agent address"
    }

    var successorAgentsLabel: String {
        field(for: ["successor_agents", "successor_agent_list"])?.label ?? "Successor agents"
    }

    func helpText(for keys: [String]) -> String? {
        field(for: keys)?.helpText?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
    }

    var showsPrincipalAddress: Bool {
        hasField(for: ["principal_address"])
    }

    var showsPrincipalContact: Bool {
        hasField(for: ["principal_contact"])
    }

    var showsAgentAddress: Bool {
        hasField(for: ["agent_address"])
    }

    var showsAgentContact: Bool {
        hasField(for: ["agent_contact"])
    }

    var showsSuccessorAgents: Bool {
        hasField(for: ["successor_agents", "successor_agent_list"])
    }

    var showsAgentSignatureAuthority: Bool {
        hasField(for: ["agent_signature_authority"])
    }

    var showsAuthorityScopeSelection: Bool {
        hasField(for: ["authority_scope_selection"])
    }

    var continueLabel: String {
        isSubmitted ? "Submitted" : "Continue"
    }

    var canContinue: Bool {
        guard isLoading == false, isSaving == false, isSubmitted == false else {
            return false
        }

        switch step {
        case .productInfo:
            return hasText(selectedJurisdiction)
        case .trustBasicInformation:
            return hasText(selectedJurisdiction) && hasText(trustName) && IntakeDateFormatting.isValidPastOrTodayISODate(trustDate)
        case .trustPeople:
            return hasValidRequiredPersonRows(grantors)
                && hasValidRequiredPersonRows(trustees)
                && hasValidOptionalPersonRows(successorTrustees)
                && filledPersonRows(grantors).count <= 2
        case .trustAuthority:
            guard hasText(selectedTrusteeSignatureAuthority), hasText(revocationHolders), hasText(selectedTrusteeIncapacityStandard) else {
                return false
            }

            return (selectedTrusteeSignatureAuthority != "custom" || hasText(trusteeSignatureAuthorityCustomText))
                && (revocationHolders != "custom" || hasText(revocationHoldersCustomText))
                && (requiresNamedSigningTrusteeSelection == false || signingTrusteeCount == 1)
                && (requiresTaxIdOwnerSelection == false || hasText(selectedTaxIdOwner))
        case .trustDocuments:
            return hasValidPriorDocuments
        case .principal:
            if productModeKey == "trust_bundle" {
                return hasValidCurrentTrustmakerPrincipal
            }

            return isComplete(
                person: principal,
                requiresAddress: showsPrincipalAddress,
                requiresContact: showsPrincipalContact
            )
        case .agent:
            return isComplete(
                person: agent,
                requiresAddress: showsAgentAddress,
                requiresContact: showsAgentContact
            )
        case .authority:
            return (showsAgentSignatureAuthority == false || hasText(selectedAgentSignatureAuthority))
                && (showsAuthorityScopeSelection == false || selectedAuthorityScopes.isEmpty == false)
        case .notarization:
            return hasText(selectedJurisdiction)
                && hasText(notarizationFileName)
                && notarizationFileData != nil
                && hasText(notarizationDocumentDescription)
        }
    }

    var documentTitle: String {
        switch productModeKey {
        case "trust_bundle":
            "New trust package."
        case "notarize_document":
            "New document notarization."
        default:
            "New power of attorney."
        }
    }

    var productCaption: String {
        switch productModeKey {
        case "trust_bundle":
            "Trust Requirements"
        case "notarize_document":
            "Document notarization"
        default:
            "POA Requirements"
        }
    }

    var totalStepCount: Int {
        stepOrder.count
    }

    var currentStepIndex: Int {
        (stepOrder.firstIndex(of: step) ?? 0) + 1
    }

    var scrollResetKey: String {
        "\(step.rawValue)-\(trustmakerPrincipalIndex)"
    }

    var autosaveSignature: String {
        guard canAutosaveDraft else {
            return ""
        }

        return draftSignature()
    }

    var trusteeSignatureAuthorityOptions: [IntakeOption] {
        field(for: ["trustee_signature_authority"])?.allowedOptions ?? []
    }

    var trusteePowerOptions: [IntakeOption] {
        field(for: ["trustee_powers"])?.allowedOptions ?? []
    }

    var revocationHolderOptions: [IntakeOption] {
        let options = field(for: ["revocation_holders"])?.allowedOptions ?? []
        guard options.isEmpty else {
            return options
        }

        return [
            IntakeOption(id: "trustmaker_only", label: "Trustmaker only"),
            IntakeOption(id: "all_trustmakers_jointly", label: "All Trustmakers jointly"),
            IntakeOption(id: "each_trustmaker_as_to_own_property", label: "Each Trustmaker as to own property"),
            IntakeOption(id: "trustee_controlled", label: "Trustee controlled"),
            IntakeOption(id: "custom", label: "Custom revocation rule"),
            IntakeOption(id: "unsure", label: "Unsure")
        ]
    }

    var trusteeIncapacityStandardOptions: [IntakeOption] {
        let options = field(for: ["trustee_incapacity_standard"])?.allowedOptions ?? []
        guard options.isEmpty else {
            return options
        }

        return [
            IntakeOption(id: "licensed_physician_determination", label: "Licensed physician determination"),
            IntakeOption(id: "two_physician_determination", label: "Two physician determination"),
            IntakeOption(id: "court_determination", label: "Court determination"),
            IntakeOption(id: "written_resignation", label: "Written resignation"),
            IntakeOption(id: "unanimous_trustee_determination", label: "Unanimous trustee determination"),
            IntakeOption(id: "unable_to_manage_financial_affairs", label: "Unable to manage financial affairs"),
            IntakeOption(id: "other", label: "Other"),
            IntakeOption(id: "unsure", label: "Unsure")
        ]
    }

    var areAllTrusteePowersSelected: Bool {
        trusteePowerOptions.isEmpty == false
            && Set(trusteePowerOptions.map(\.id)).isSubset(of: selectedTrusteePowers)
    }

    var taxIdOwnerOptions: [IntakeOption] {
        let grantorNames = personListNames(from: grantors)
        if grantorNames.isEmpty == false {
            return grantorNames.map { IntakeOption(id: $0, label: $0) }
        }

        return field(for: ["tax_id_owner"])?.allowedOptions ?? []
    }

    var canAddTrustmaker: Bool {
        grantors.count < 2
    }

    var requiresNamedSigningTrusteeSelection: Bool {
        selectedTrusteeSignatureAuthority == "named_signing_trustee"
    }

    var requiresTaxIdOwnerSelection: Bool {
        trustmakerPrincipalRows.count > 1
    }

    var signingTrusteeCount: Int {
        filledPersonRows(trustees).filter { $0.fullName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false && $0.isSigningTrustee }.count
    }

    var trustmakerPrincipalRows: [IntakePersonListItem] {
        filledPersonRows(grantors)
    }

    var trustmakerPrincipalCount: Int {
        trustmakerPrincipalRows.count
    }

    var currentTrustmakerPrincipal: IntakePersonListItem? {
        guard let index = currentTrustmakerPrincipalGrantorIndex else {
            return nil
        }

        return grantors[index]
    }

    var currentTrustmakerPrincipalGrantorIndex: Int? {
        let indices = grantors.indices.filter { hasAnyPersonRowValue(grantors[$0]) }
        guard indices.isEmpty == false else {
            return nil
        }

        guard indices.indices.contains(trustmakerPrincipalIndex) else {
            return indices.first
        }

        return indices[trustmakerPrincipalIndex]
    }

    var trustmakerPrincipalProgressLabel: String {
        let count = max(trustmakerPrincipalCount, 1)
        let index = min(trustmakerPrincipalIndex + 1, count)
        return "Principal \(index) of \(count)"
    }

    var priorDocumentTypeOptions: [IntakeOption] {
        [
            "trust_agreement",
            "declaration_of_trust",
            "amendment",
            "restatement",
            "schedule_of_assets",
            "affidavit",
            "incapacity_letter",
            "trust_certification",
            "change_of_trustee",
            "power_of_attorney",
            "other",
        ].map { IntakeOption(id: $0, label: Self.formattedPriorDocumentTypeLabel($0)) }
    }

    var incompletePriorDocumentRowCount: Int {
        filledPriorDocumentRows.filter { hasCompletePriorDocumentRow($0) == false }.count
    }

    var hasMissingOriginatingPriorDocument: Bool {
        guard let firstFilledRow = filledPriorDocumentRows.first else {
            return false
        }

        return Self.originatingPriorDocumentTypes.contains(firstFilledRow.documentType.trimmingCharacters(in: .whitespacesAndNewlines)) == false
    }

    var priorDocumentChronologyOutOfOrderCount: Int {
        var previousDate = ""
        var outOfOrderCount = 0

        for item in filledPriorDocumentRows where hasCompletePriorDocumentRow(item) && hasValidPriorDocumentDate(item) {
            let currentDate = item.documentDate.trimmingCharacters(in: .whitespacesAndNewlines)
            if previousDate.isEmpty == false, currentDate < previousDate {
                outOfOrderCount += 1
            }

            previousDate = currentDate
        }

        return outOfOrderCount
    }

    var invalidPriorDocumentDateCount: Int {
        filledPriorDocumentRows.filter { item in
            let date = item.documentDate.trimmingCharacters(in: .whitespacesAndNewlines)
            return date.isEmpty == false && IntakeDateFormatting.isValidPastOrTodayISODate(date) == false
        }.count
    }

    var hasValidPriorDocuments: Bool {
        incompletePriorDocumentRowCount == 0
            && hasMissingOriginatingPriorDocument == false
            && invalidPriorDocumentDateCount == 0
            && priorDocumentChronologyOutOfOrderCount == 0
    }

    private var stepOrder: [POAIntakeStep] {
        switch productModeKey {
        case "trust_bundle":
            [.trustBasicInformation, .trustPeople, .trustAuthority, .trustDocuments, .principal, .agent, .authority]
        case "notarize_document":
            [.notarization]
        default:
            [.productInfo, .principal, .agent, .authority]
        }
    }

    func start(modeKey: String, resumingDocumentId: String? = nil, session: AuthSession?) async {
        let draftDocumentId = resumingDocumentId?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
        if productModeKey == modeKey, resumedDocumentId == draftDocumentId, memberForm != nil {
            return
        }

        productModeKey = modeKey
        resumedDocumentId = draftDocumentId
        step = initialStep(for: modeKey)
        resetTrustmakerPrincipalProgress()
        isSubmitted = false
        submittedDocumentId = nil

        guard let accessToken = session?.accessToken, accessToken.isEmpty == false else {
            errorMessage = "Sign in again to start document intake."
            return
        }

        isLoading = true
        errorMessage = nil
        draftNotice = nil
        cancelPendingAutosave()
        defer { isLoading = false }

        do {
            if let draftDocumentId {
                try await loadExistingDraft(documentId: draftDocumentId, fallbackModeKey: modeKey, accessToken: accessToken)
            } else {
                let jurisdictionResponse = try await apiClient.listMemberFormJurisdictions(modeKey: modeKey, accessToken: accessToken)
                let nextJurisdictions = jurisdictionResponse.jurisdictions ?? []
                jurisdictions = nextJurisdictions
                selectedJurisdiction = preferredJurisdiction(from: nextJurisdictions)

                guard selectedJurisdiction.isEmpty == false else {
                    throw IntakeError.missingJurisdiction
                }

                if modeKey == "notarize_document" {
                    memberForm = nil
                    fieldsByKey = [:]
                } else {
                    try await loadContract(modeKey: modeKey, accessToken: accessToken)
                }
            }
        } catch {
            errorMessage = displayMessage(for: error, fallback: "Failed to start document intake.")
        }
    }

    func selectJurisdiction(_ jurisdiction: IntakeJurisdictionOption, session: AuthSession?) async {
        guard selectedJurisdiction != jurisdiction.code else {
            return
        }

        selectedJurisdiction = jurisdiction.code
        resetDraftState()

        guard let modeKey = productModeKey else {
            return
        }

        guard let accessToken = session?.accessToken, accessToken.isEmpty == false else {
            errorMessage = "Sign in again to change jurisdiction."
            return
        }

        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            if modeKey == "notarize_document" {
                memberForm = nil
                fieldsByKey = [:]
            } else {
                try await loadContract(modeKey: modeKey, accessToken: accessToken)
            }
        } catch {
            errorMessage = displayMessage(for: error, fallback: "Failed to load jurisdiction requirements.")
        }
    }

    func goBack() -> Bool {
        if productModeKey == "trust_bundle", step == .principal, trustmakerPrincipalIndex > 0 {
            trustmakerPrincipalIndex -= 1
            return true
        }

        if let previous = previousStep() {
            if productModeKey == "trust_bundle", previous == .principal {
                trustmakerPrincipalIndex = max(trustmakerPrincipalRows.count - 1, 0)
            } else {
                trustmakerPrincipalIndex = 0
            }

            step = previous
            return true
        }

        return false
    }

    func continueTapped(session: AuthSession?) async {
        guard canContinue else {
            return
        }

        guard let accessToken = session?.accessToken, accessToken.isEmpty == false else {
            errorMessage = "Sign in again to save this intake."
            return
        }

        errorMessage = nil
        draftNotice = nil

        if productModeKey == "notarize_document" {
            await submitNotarizationUpload(session: session, accessToken: accessToken)
            return
        }

        if isFinalStep {
            await submit(accessToken: accessToken)
            return
        }

        if hasMeaningfulDraftInput {
            await saveCurrentDraft(accessToken: accessToken)
        }

        if errorMessage == nil, productModeKey == "trust_bundle", step == .principal, advanceTrustmakerPrincipal() {
            return
        }

        if errorMessage == nil, let next = nextStep() {
            if productModeKey == "trust_bundle", step == .trustDocuments, next == .principal {
                seedPrincipalFromTrustmaker()
                resetTrustmakerPrincipalProgress()
            }
            step = next
        }
    }

    func scheduleAutosave(session: AuthSession?) {
        guard canAutosaveDraft,
              let accessToken = session?.accessToken,
              accessToken.isEmpty == false else {
            cancelPendingAutosave()
            return
        }

        let signature = autosaveSignature
        guard signature.isEmpty == false, signature != lastServerDraftSignature else {
            cancelPendingAutosave()
            return
        }

        cancelPendingAutosave()
        autosaveTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(750))
            guard Task.isCancelled == false else {
                return
            }

            await self?.performAutosave(accessToken: accessToken, expectedSignature: signature)
        }
    }

    func flushAutosave(session: AuthSession?) async {
        guard canAutosaveDraft,
              let accessToken = session?.accessToken,
              accessToken.isEmpty == false else {
            cancelPendingAutosave()
            return
        }

        let signature = autosaveSignature
        cancelPendingAutosave()

        guard signature.isEmpty == false, signature != lastServerDraftSignature else {
            return
        }

        await performAutosave(accessToken: accessToken, expectedSignature: signature)
    }

    func toggleAuthorityScope(_ option: IntakeOption) {
        if selectedAuthorityScopes.contains(option.id) {
            selectedAuthorityScopes.remove(option.id)
        } else {
            selectedAuthorityScopes.insert(option.id)
        }
    }

    var areAllAuthorityScopesSelected: Bool {
        authorityScopeOptions.isEmpty == false
            && Set(authorityScopeOptions.map(\.id)).isSubset(of: selectedAuthorityScopes)
    }

    func selectAllAuthorityScopes() {
        let allScopeIds = authorityScopeOptions.map(\.id)
        if allScopeIds.isEmpty == false, Set(allScopeIds).isSubset(of: selectedAuthorityScopes) {
            selectedAuthorityScopes.subtract(allScopeIds)
        } else {
            selectedAuthorityScopes.formUnion(allScopeIds)
        }
    }

    func toggleTrusteePower(_ option: IntakeOption) {
        if selectedTrusteePowers.contains(option.id) {
            selectedTrusteePowers.remove(option.id)
        } else {
            selectedTrusteePowers.insert(option.id)
        }
    }

    func selectAllTrusteePowers() {
        let allPowerIds = trusteePowerOptions.map(\.id)
        if allPowerIds.isEmpty == false, Set(allPowerIds).isSubset(of: selectedTrusteePowers) {
            selectedTrusteePowers.subtract(allPowerIds)
        } else {
            selectedTrusteePowers.formUnion(allPowerIds)
        }
    }

    func addTrustmaker() {
        guard canAddTrustmaker else {
            return
        }

        grantors.append(IntakePersonListItem())
    }

    func removeTrustmaker(at index: Int) {
        removePersonRow(from: &grantors, at: index)
        trustmakerPrincipalIndex = min(trustmakerPrincipalIndex, max(trustmakerPrincipalRows.count - 1, 0))
    }

    func setTrustmakerCurrentTrustee(at index: Int, isSelected: Bool) {
        guard grantors.indices.contains(index) else {
            return
        }

        grantors[index].isCurrentTrustee = isSelected
    }

    func addTrustee() {
        trustees.append(IntakePersonListItem())
    }

    func removeTrustee(at index: Int) {
        removePersonRow(from: &trustees, at: index)
    }

    func addSuccessorTrustee() {
        successorTrustees.append(IntakePersonListItem())
    }

    func removeSuccessorTrustee(at index: Int) {
        removePersonRow(from: &successorTrustees, at: index)
    }

    @discardableResult
    func addPriorDocumentItem() -> Int {
        let index = priorDocumentItems.count
        priorDocumentItems.append(
            IntakePriorDocumentItem(
                chronologyOrder: index + 1,
                documentType: priorDocumentItems.isEmpty ? "trust_agreement" : "amendment"
            )
        )
        return index
    }

    func removePriorDocumentItem(at index: Int) {
        guard priorDocumentItems.indices.contains(index) else {
            return
        }

        priorDocumentItems.remove(at: index)
        reindexPriorDocumentItems()
    }

    func setPriorDocumentAttachmentReference(at index: Int, fileName: String) {
        guard priorDocumentItems.indices.contains(index) else {
            return
        }

        priorDocumentItems[index].attachmentReference = fileName
    }

    func priorDocumentTypeLabel(for id: String) -> String {
        Self.formattedPriorDocumentTypeLabel(id)
    }

    func setSigningTrustee(at index: Int, isSelected: Bool) {
        guard trustees.indices.contains(index) else {
            return
        }

        for trusteeIndex in trustees.indices {
            trustees[trusteeIndex].isSigningTrustee = trusteeIndex == index ? isSelected : false
        }
    }

    func selectNotarizationFile(name: String, size: Int, data: Data) {
        notarizationFileName = name
        notarizationFileSize = size
        notarizationFileData = data
    }

    func clearNotarizationFile() {
        notarizationFileName = ""
        notarizationFileSize = 0
        notarizationFileData = nil
    }

    func emailValidationMessage(for contact: IntakePersonContact) -> String? {
        guard hasText(contact.email), IntakeContactFormatting.isValidEmail(contact.email) == false else {
            return nil
        }

        return "Enter a valid email address."
    }

    func phoneValidationMessage(for contact: IntakePersonContact) -> String? {
        if hasText(contact.phoneCountryCode), IntakeContactFormatting.isValidPhoneCountryCode(contact.phoneCountryCode) == false {
            return "Enter a valid phone country code."
        }

        guard hasText(contact.phone), IntakeContactFormatting.isValidPhone(contact.phone, countryIso2: contact.phoneCountryIso2) == false else {
            return nil
        }

        return "Enter a valid phone number."
    }

    func searchAddressSuggestions(fieldKey: String, query: String, session: AuthSession?) async {
        let trimmedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
        addressAutocompleteFieldKey = fieldKey

        guard trimmedQuery.count >= 3 else {
            addressAutocompleteSuggestions = []
            isAddressAutocompleteLoading = false
            addressAutocompleteError = nil
            return
        }

        guard let accessToken = session?.accessToken, accessToken.isEmpty == false else {
            addressAutocompleteSuggestions = []
            isAddressAutocompleteLoading = false
            addressAutocompleteError = "Sign in again to look up addresses."
            return
        }

        isAddressAutocompleteLoading = true
        addressAutocompleteError = nil

        do {
            let response = try await apiClient.autocompleteAddress(
                jurisdiction: selectedJurisdiction,
                request: AddressAutocompleteRequest(
                    input: trimmedQuery,
                    sessionToken: addressSessionToken(for: fieldKey)
                ),
                accessToken: accessToken
            )

            guard addressAutocompleteFieldKey == fieldKey else {
                return
            }

            addressAutocompleteSuggestions = (response.suggestions ?? []).filter(Self.isAddressSuggestion)
            isAddressAutocompleteLoading = false
        } catch {
            guard addressAutocompleteFieldKey == fieldKey else {
                return
            }

            addressAutocompleteSuggestions = []
            isAddressAutocompleteLoading = false
            addressAutocompleteError = "Address lookup is unavailable. You can keep typing manually."
        }
    }

    func resolveAddressSuggestion(_ suggestion: AddressAutocompleteSuggestion, fieldKey: String, session: AuthSession?) async -> String {
        guard let accessToken = session?.accessToken, accessToken.isEmpty == false else {
            clearAddressAutocomplete()
            return suggestion.description
        }

        resolvingAddressFieldKey = fieldKey
        addressAutocompleteFieldKey = fieldKey
        addressAutocompleteSuggestions = []
        addressAutocompleteError = nil

        defer {
            resolvingAddressFieldKey = nil
        }

        do {
            let response = try await apiClient.resolveAddressDetails(
                jurisdiction: selectedJurisdiction,
                request: AddressDetailsRequest(
                    placeId: suggestion.placeId,
                    sessionToken: addressSessionToken(for: fieldKey)
                ),
                accessToken: accessToken
            )
            addressSessionTokens[fieldKey] = nil
            clearAddressAutocomplete()
            return response.address?.normalizedAddress?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
                ?? response.address?.formattedAddress?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
                ?? suggestion.description
        } catch {
            addressAutocompleteError = "Address normalization failed. You can keep typing manually."
            return suggestion.description
        }
    }

    func clearAddressAutocomplete() {
        addressAutocompleteFieldKey = nil
        addressAutocompleteSuggestions = []
        isAddressAutocompleteLoading = false
        addressAutocompleteError = nil
    }

    private func loadExistingDraft(documentId: String, fallbackModeKey: String, accessToken: String) async throws {
        let draftResponse = try await apiClient.getDocumentIntakeDraft(documentId: documentId, accessToken: accessToken)
        guard let draft = draftResponse.draft else {
            throw IntakeError.missingDraft
        }

        let modeKey = draft.productFlowMode.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty ?? fallbackModeKey
        productModeKey = modeKey
        step = initialStep(for: modeKey)
        resetTrustmakerPrincipalProgress()

        let jurisdictionResponse = try await apiClient.listMemberFormJurisdictions(modeKey: modeKey, accessToken: accessToken)
        jurisdictions = jurisdictionResponse.jurisdictions ?? []
        selectedJurisdiction = draft.jurisdiction.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty ?? preferredJurisdiction(from: jurisdictions)

        guard selectedJurisdiction.isEmpty == false else {
            throw IntakeError.missingJurisdiction
        }

        if modeKey == "notarize_document" {
            memberForm = nil
            fieldsByKey = [:]
        } else {
            let formResponse = try await apiClient.getMemberForm(
                jurisdiction: selectedJurisdiction,
                modeKey: modeKey,
                accessToken: accessToken
            )

            guard let memberForm = formResponse.memberForm else {
                throw IntakeError.missingMemberForm
            }

            self.memberForm = memberForm
            fieldsByKey = Dictionary(
                uniqueKeysWithValues: memberForm.aggregatedForm.sections
                    .flatMap(\.fields)
                    .map { ($0.canonicalKey, $0) }
            )
        }

        applyDraft(draft, restoreStep: true)
    }

    private func loadContract(modeKey: String, accessToken: String) async throws {
        let formResponse = try await apiClient.getMemberForm(
            jurisdiction: selectedJurisdiction,
            modeKey: modeKey,
            accessToken: accessToken
        )

        guard let memberForm = formResponse.memberForm else {
            throw IntakeError.missingMemberForm
        }

        self.memberForm = memberForm
        fieldsByKey = Dictionary(
            uniqueKeysWithValues: memberForm.aggregatedForm.sections
                .flatMap(\.fields)
                .map { ($0.canonicalKey, $0) }
        )
    }

    private static func isAddressSuggestion(_ suggestion: AddressAutocompleteSuggestion) -> Bool {
        let addressOnlyTypes = Set(["street_address", "premise", "subpremise"])
        let nonAddressTypes = Set([
            "administrative_area_level_1",
            "administrative_area_level_2",
            "administrative_area_level_3",
            "country",
            "locality",
            "political"
        ])
        let types = suggestion.types ?? []

        if types.contains(where: { addressOnlyTypes.contains($0) }) {
            return true
        }

        if types.contains(where: { nonAddressTypes.contains($0) }) {
            return false
        }

        return suggestion.description.contains(",")
    }

    private func saveCurrentDraft(accessToken: String, retryingAfterConflict: Bool = false, isAutosave: Bool = false) async {
        guard hasMeaningfulDraftInput else {
            return
        }

        guard let modeKey = productModeKey else {
            errorMessage = "Document draft is not ready yet."
            return
        }

        let draftStep = step
        let draftAnswers = buildAnswers()
        let signature = draftSignature(stepKey: draftStep.persistedStepKey, answers: draftAnswers)

        isSaving = true
        defer { isSaving = false }

        let existingDocumentId = documentId ?? "pending"
        Self.logger.debug("Saving intake draft documentId=\(existingDocumentId, privacy: .public) step=\(draftStep.persistedStepKey, privacy: .public) revision=\(String(describing: self.draftRevision), privacy: .public) autosave=\(isAutosave, privacy: .public)")

        do {
            let documentId = try await ensureDraftDocument(modeKey: modeKey, accessToken: accessToken)
            let response = try await apiClient.saveDocumentIntakeDraft(
                documentId: documentId,
                request: DocumentIntakeDraftUpsertRequest(
                    currentStep: draftStep.persistedStepKey,
                    rulesSnapshotVersion: Self.rulesSnapshotVersion,
                    answers: draftAnswers,
                    expectedRevision: draftRevision
                ),
                accessToken: accessToken
            )
            applyDraft(response.draft, restoreStep: false)
            lastServerDraftSignature = signature
            errorMessage = nil
            if isAutosave {
                draftNotice = nil
            }
            Self.logger.info("Saved intake draft documentId=\(documentId, privacy: .public) step=\(draftStep.persistedStepKey, privacy: .public) revision=\(String(describing: self.draftRevision), privacy: .public) autosave=\(isAutosave, privacy: .public)")
        } catch AuthAPIError.unexpectedStatus(let statusCode, _) where statusCode == 409 {
            let conflictDocumentId = documentId ?? existingDocumentId
            Self.logger.warning("Intake draft revision conflict documentId=\(conflictDocumentId, privacy: .public) step=\(draftStep.persistedStepKey, privacy: .public) revision=\(String(describing: self.draftRevision), privacy: .public) autosave=\(isAutosave, privacy: .public) status=\(statusCode, privacy: .public)")
            if let documentId {
                await reloadDraftAfterConflict(
                    documentId: documentId,
                    accessToken: accessToken,
                    preservingAnswers: draftAnswers,
                    preferredStep: draftStep,
                    showsNotice: isAutosave == false
                )
            }
            if retryingAfterConflict == false, errorMessage == nil, isSubmitted == false {
                await saveCurrentDraft(accessToken: accessToken, retryingAfterConflict: true, isAutosave: isAutosave)
            }
        } catch {
            let message = displayMessage(for: error, fallback: "Failed to save this draft.")
            Self.logger.error("Intake draft save failed documentId=\(self.documentId ?? existingDocumentId, privacy: .public) step=\(draftStep.persistedStepKey, privacy: .public) revision=\(String(describing: self.draftRevision), privacy: .public) autosave=\(isAutosave, privacy: .public) error=\(String(describing: error), privacy: .public)")
            if isAutosave {
                errorMessage = nil
                draftNotice = nil
            } else {
                errorMessage = message
            }
        }
    }

    private func submit(accessToken: String) async {
        guard let modeKey = productModeKey else {
            errorMessage = "Document draft is not ready yet."
            return
        }

        cancelPendingAutosave()

        let submitStep = step
        let submitAnswers = buildAnswers()

        isSaving = true
        defer { isSaving = false }

        do {
            let documentId = try await ensureDraftDocument(modeKey: modeKey, accessToken: accessToken)
            let response = try await apiClient.submitDocumentIntakeDraft(
                documentId: documentId,
                request: DocumentIntakeSubmitRequest(
                    currentStep: submitStep.persistedStepKey,
                    rulesSnapshotVersion: Self.rulesSnapshotVersion,
                    answers: submitAnswers,
                    expectedRevision: draftRevision
                ),
                accessToken: accessToken
            )
            applyDraft(response.draft, restoreStep: false)
            lastServerDraftSignature = draftSignature(stepKey: submitStep.persistedStepKey, answers: submitAnswers)
            isSubmitted = true
            submittedDocumentId = documentId
            draftNotice = "Intake submitted. Review is next."
        } catch AuthAPIError.unexpectedStatus(let statusCode, _) where statusCode == 409 {
            if let documentId {
                await reloadDraftAfterConflict(documentId: documentId, accessToken: accessToken)
            } else {
                errorMessage = "Draft changed elsewhere. Try continuing again."
            }
        } catch {
            errorMessage = displayMessage(for: error, fallback: "Failed to submit this intake.")
        }
    }

    private func reloadDraftAfterConflict(
        documentId: String,
        accessToken: String,
        preservingAnswers: [String: JSONValue]? = nil,
        preferredStep: POAIntakeStep? = nil,
        showsNotice: Bool = true
    ) async {
        do {
            let response = try await apiClient.getDocumentIntakeDraft(documentId: documentId, accessToken: accessToken)
            applyDraft(response.draft, restoreStep: preservingAnswers == nil)

            if let preservingAnswers {
                var mergedAnswers = response.draft?.answers ?? [:]
                preservingAnswers.forEach { key, value in
                    mergedAnswers[key] = value
                }
                applyAnswers(mergedAnswers)
                if let preferredStep {
                    step = preferredStep
                }
                lastServerDraftSignature = draftSignature()
                if showsNotice {
                    draftNotice = "Synced latest draft without overriding your current edits."
                } else {
                    draftNotice = nil
                }
            } else {
                if showsNotice {
                    draftNotice = "Synced the latest saved draft."
                } else {
                    draftNotice = nil
                }
            }
        } catch {
            let message = displayMessage(for: error, fallback: "Draft changed elsewhere and could not be reloaded.")
            Self.logger.error("Intake draft reload after conflict failed documentId=\(documentId, privacy: .public) preferredStep=\(preferredStep?.persistedStepKey ?? "none", privacy: .public) showsNotice=\(showsNotice, privacy: .public) error=\(String(describing: error), privacy: .public)")
            if showsNotice {
                errorMessage = message
            } else {
                errorMessage = nil
                draftNotice = nil
            }
        }
    }

    private func applyDraft(_ draft: DocumentIntakeDraft?, restoreStep: Bool) {
        guard let draft else {
            return
        }

        documentId = draft.documentId
        draftRevision = draft.revision
        draftUpdatedAt = draft.updatedAt
        applyAnswers(draft.answers)
        if restoreStep, let restoredStep = restoredStep(from: draft.currentStep, productModeKey: draft.productFlowMode) {
            step = restoredStep
            resetTrustmakerPrincipalProgress()
        }
        lastServerDraftSignature = draftSignature()
    }

    private func applyAnswers(_ answers: [String: JSONValue]) {
        principal.fullLegalName = stringAnswer(answers, keys: ["principal_full_legal_name", "principal_full_name"])
        applyAddress(stringAnswer(answers, keys: ["principal_address"]), to: &principal)
        principal.contact = parseContact(stringAnswer(answers, keys: ["principal_contact"]))

        agent.fullLegalName = stringAnswer(answers, keys: ["agent_full_legal_name", "agent_full_name"])
        applyAddress(stringAnswer(answers, keys: ["agent_address"]), to: &agent)
        agent.contact = parseContact(stringAnswer(answers, keys: ["agent_contact"]))

        successorAgents = (answers["successor_agent_list"]?.stringArrayValue ?? []).joined(separator: "\n")
        selectedAgentSignatureAuthority = answers["agent_signature_authority"]?.stringValue ?? ""
        selectedAuthorityScopes = Set(answers["authority_scope_selection"]?.stringArrayValue ?? [])
        trustName = answers["trust_name"]?.stringValue ?? ""
        trustDate = answers["trust_date"]?.stringValue ?? ""
        grantors = personListDisplay(answers["grantors"]?.stringArrayValue ?? [])
        trustees = personListDisplay(answers["trustees"]?.stringArrayValue ?? [])
        successorTrustees = personListDisplay(answers["successor_trustees"]?.stringArrayValue ?? [])
        revocationHolders = answers["revocation_holders"]?.stringValue
            ?? legacyPersonListDisplay(answers["revocation_holders"]?.stringArrayValue ?? [])
        selectedTrusteeSignatureAuthority = answers["trustee_signature_authority"]?.stringValue ?? ""
        trusteeSignatureAuthorityCustomText = answers["trustee_signature_authority_custom_text"]?.stringValue ?? ""
        selectedTrusteeIncapacityStandard = answers["trustee_incapacity_standard"]?.stringValue ?? ""
        selectedTaxIdOwner = answers["tax_id_owner"]?.stringValue ?? ""
        assetTitlingFormat = answers["asset_titling_format"]?.stringValue ?? ""
        selectedTrusteePowers = Set(answers["trustee_powers"]?.stringArrayValue ?? [])
        revocationHoldersCustomText = answers["revocation_holders_custom_text"]?.stringValue ?? ""
        priorDocumentItems = priorDocumentDisplay(answers["prior_document_items"]?.stringArrayValue ?? [])
    }

    private func buildAnswers() -> [String: JSONValue] {
        var answers: [String: JSONValue] = [:]
        let answerPrincipal = trustBundlePrimaryPrincipalForAnswers() ?? principal
        if productModeKey == "trust_bundle" {
            answers["trust_name"] = .string(trustName)
            answers["trust_date"] = .string(trustDate)
            answers["grantors"] = .array(serializedPersonListValues(from: grantors).map(JSONValue.string))
            answers["trustees"] = .array(serializedPersonListValues(from: trustees).map(JSONValue.string))
            answers["successor_trustees"] = .array(serializedPersonListValues(from: successorTrustees).map(JSONValue.string))
            answers["revocation_holders"] = .string(revocationHolders)
            answers["trustee_signature_authority"] = .string(selectedTrusteeSignatureAuthority)
            answers["trustee_signature_authority_custom_text"] = .string(trusteeSignatureAuthorityCustomText)
            answers["trustee_incapacity_standard"] = .string(selectedTrusteeIncapacityStandard)
            answers["tax_id_owner"] = .string(selectedTaxIdOwner)
            answers["asset_titling_format"] = .string(assetTitlingFormat)
            answers["trustee_powers"] = .array(selectedTrusteePowers.sorted().map(JSONValue.string))
            answers["revocation_holders_custom_text"] = .string(revocationHoldersCustomText)
            answers["prior_document_items"] = .array(priorDocumentValues().map(JSONValue.string))
        }

        answers[nameKey(preferred: ["principal_full_legal_name", "principal_full_name"])] = .string(answerPrincipal.fullLegalName)
        answers["principal_address"] = .string(answerPrincipal.address)
        answers["principal_contact"] = .string(serializeContact(answerPrincipal.contact))
        answers[nameKey(preferred: ["agent_full_legal_name", "agent_full_name"])] = .string(agent.fullLegalName)
        answers["agent_address"] = .string(agent.address)
        answers["agent_contact"] = .string(serializeContact(agent.contact))
        answers["successor_agent_list"] = .array(successorAgentValues().map(JSONValue.string))
        answers["agent_signature_authority"] = .string(selectedAgentSignatureAuthority)
        answers["authority_scope_selection"] = .array(
            selectedAuthorityScopes.sorted().map(JSONValue.string)
        )
        return answers
    }

    private var isFinalStep: Bool {
        step == stepOrder.last
    }

    private var canAutosaveDraft: Bool {
        productModeKey != "notarize_document"
            && memberForm != nil
            && isLoading == false
            && isSubmitted == false
            && hasMeaningfulDraftInput
    }

    private var hasMeaningfulDraftInput: Bool {
        buildAnswers().values.contains(where: Self.isMeaningfulDraftValue)
    }

    private static func isMeaningfulDraftValue(_ value: JSONValue) -> Bool {
        switch value {
        case .string(let string):
            return string.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
        case .number:
            return true
        case .bool(let bool):
            return bool
        case .object(let object):
            return object.values.contains(where: isMeaningfulDraftValue)
        case .array(let array):
            return array.contains(where: isMeaningfulDraftValue)
        case .null:
            return false
        }
    }

    private struct DraftSignaturePayload: Encodable {
        let currentStep: String
        let answers: [String: JSONValue]
    }

    private func draftSignature(stepKey: String? = nil, answers: [String: JSONValue]? = nil) -> String {
        let payload = DraftSignaturePayload(
            currentStep: stepKey ?? step.persistedStepKey,
            answers: answers ?? buildAnswers()
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        guard let data = try? encoder.encode(payload) else {
            return UUID().uuidString
        }

        return String(data: data, encoding: .utf8) ?? UUID().uuidString
    }

    private func performAutosave(accessToken: String, expectedSignature: String) async {
        guard canAutosaveDraft,
              isSaving == false,
              expectedSignature == autosaveSignature,
              expectedSignature != lastServerDraftSignature else {
            return
        }

        await saveCurrentDraft(accessToken: accessToken, isAutosave: true)
    }

    private func ensureDraftDocument(modeKey: String, accessToken: String) async throws -> String {
        if let documentId {
            return documentId
        }

        let bootstrapResponse = try await apiClient.bootstrapDocumentIntake(
            DocumentIntakeBootstrapRequest(
                productFlowMode: modeKey,
                jurisdiction: selectedJurisdiction,
                rulesSnapshotVersion: Self.rulesSnapshotVersion,
                resumeLatestDraft: false
            ),
            accessToken: accessToken
        )

        guard let nextDocumentId = bootstrapResponse.document?.id ?? bootstrapResponse.draft?.documentId else {
            throw IntakeError.missingDraft
        }

        documentId = nextDocumentId
        draftRevision = bootstrapResponse.draft?.revision
        draftUpdatedAt = bootstrapResponse.draft?.updatedAt
        return nextDocumentId
    }

    private func cancelPendingAutosave() {
        autosaveTask?.cancel()
        autosaveTask = nil
    }

    private func nextStep() -> POAIntakeStep? {
        guard let index = stepOrder.firstIndex(of: step), index < stepOrder.count - 1 else {
            return nil
        }

        return stepOrder[index + 1]
    }

    private func previousStep() -> POAIntakeStep? {
        guard let index = stepOrder.firstIndex(of: step), index > 0 else {
            return nil
        }

        return stepOrder[index - 1]
    }

    private func initialStep(for modeKey: String) -> POAIntakeStep {
        switch modeKey {
        case "trust_bundle":
            .trustBasicInformation
        case "notarize_document":
            .notarization
        default:
            .productInfo
        }
    }

    private func restoredStep(from currentStep: String?, productModeKey: String) -> POAIntakeStep? {
        let normalizedStep = currentStep?.trimmingCharacters(in: .whitespacesAndNewlines)
        switch productModeKey {
        case "trust_bundle":
            switch normalizedStep {
            case "poa_requirements":
                return .principal
            default:
                return .trustBasicInformation
            }
        case "notarize_document":
            return .notarization
        default:
            switch normalizedStep {
            case "poa_requirements":
                return .principal
            default:
                return .productInfo
            }
        }
    }

    private func submitNotarizationUpload(session: AuthSession?, accessToken: String) async {
        let trimmedJurisdiction = selectedJurisdiction.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmedJurisdiction.isEmpty == false else {
            errorMessage = "Jurisdiction: choose where this notarization will be completed."
            return
        }

        guard let fileData = notarizationFileData, notarizationFileName.isEmpty == false else {
            errorMessage = "Document upload: upload the PDF that needs notarization."
            return
        }

        guard notarizationFileName.lowercased().hasSuffix(".pdf") else {
            errorMessage = "Document upload: select a PDF file."
            return
        }

        guard fileData.count <= Self.notarizationMaxUploadBytes else {
            errorMessage = "Document upload: PDFs must be 25 MB or smaller."
            return
        }

        guard notarizationDocumentDescription.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false else {
            errorMessage = "Document description: describe the document being notarized."
            return
        }

        let requesterName = requesterDisplayName(from: session)
        let requesterEmail = session?.user.email.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let requesterPhone = session?.user.phone?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard requesterName != "Document owner", requesterName.isEmpty == false else {
            errorMessage = "Requester name: complete your profile before notarizing a document."
            return
        }

        guard requesterEmail.contains("@") else {
            errorMessage = "Requester email: add a valid email before notarizing a document."
            return
        }

        guard requesterPhone.isEmpty == false else {
            errorMessage = "Requester phone: add a phone number before notarizing a document."
            return
        }

        isSaving = true
        defer { isSaving = false }

        do {
            let createResponse = try await apiClient.createDocumentUpload(
                DocumentUploadCreateRequest(
                    productFlowMode: "notarize_document",
                    documentType: "notarize_document",
                    jurisdiction: trimmedJurisdiction,
                    fileName: notarizationFileName,
                    fileSize: notarizationFileSize,
                    mimeType: "application/pdf",
                    documentDescription: notarizationDocumentDescription.trimmingCharacters(in: .whitespacesAndNewlines),
                    notarizationReason: notarizationReason.trimmingCharacters(in: .whitespacesAndNewlines),
                    requesterName: requesterName,
                    requesterEmail: requesterEmail,
                    requesterPhone: requesterPhone,
                    requesterPhoneCountryCode: "+1"
                ),
                accessToken: accessToken
            )

            guard let documentId = createResponse.document?.id,
                  let versionId = createResponse.version?.id,
                  let signedUrlString = createResponse.upload?.signedUrl,
                  let signedUrl = URL(string: signedUrlString) else {
                throw IntakeError.missingUploadTarget
            }

            try await apiClient.uploadDocument(data: fileData, mimeType: "application/pdf", to: signedUrl)
            _ = try await apiClient.finalizeDocumentUpload(
                documentId: documentId,
                request: DocumentUploadFinalizeRequest(documentVersionId: versionId),
                accessToken: accessToken
            )
            isSubmitted = true
            submittedDocumentId = documentId
            draftNotice = "Document uploaded for review."
        } catch {
            errorMessage = displayMessage(for: error, fallback: "Failed to upload this document for notarization.")
        }
    }

    private func successorAgentValues() -> [String] {
        successorAgents
            .split(whereSeparator: \.isNewline)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { $0.isEmpty == false }
    }

    private func hasText(_ value: String) -> Bool {
        value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
    }

    private func isComplete(person: IntakePersonDetails, requiresAddress: Bool, requiresContact: Bool) -> Bool {
        guard hasText(person.fullLegalName) else {
            return false
        }

        if requiresAddress, hasText(person.addressLine1) == false {
            return false
        }

        if requiresContact {
            return hasText(person.contact.email)
                && IntakeContactFormatting.isValidEmail(person.contact.email)
                && hasText(person.contact.phoneCountryCode)
                && IntakeContactFormatting.isValidPhoneCountryCode(person.contact.phoneCountryCode)
                && hasText(person.contact.phone)
                && IntakeContactFormatting.isValidPhone(person.contact.phone, countryIso2: person.contact.phoneCountryIso2)
        }

        return true
    }

    private func addressSessionToken(for fieldKey: String) -> String {
        if let token = addressSessionTokens[fieldKey] {
            return token
        }

        let token = UUID().uuidString
        addressSessionTokens[fieldKey] = token
        return token
    }

    private func hasField(for keys: [String]) -> Bool {
        field(for: keys) != nil
    }

    private func personListNames(from value: [IntakePersonListItem]) -> [String] {
        filledPersonRows(value)
            .map { $0.fullName.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { $0.isEmpty == false }
    }

    private func personListItems(from value: String) -> [IntakePersonListItem] {
        value
            .split(whereSeparator: \.isNewline)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { $0.isEmpty == false }
            .map { IntakePersonListItem(fullName: $0) }
    }

    private func serializePersonListItem(_ item: IntakePersonListItem) -> String {
        (try? String(data: JSONEncoder().encode(item), encoding: .utf8)) ?? ""
    }

    private func personListDisplay(_ values: [String]) -> [IntakePersonListItem] {
        let items = values.compactMap { value in
            guard let data = value.data(using: .utf8),
                  let item = try? JSONDecoder().decode(IntakePersonListItem.self, from: data) else {
                let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
                return trimmed.isEmpty ? nil : IntakePersonListItem(fullName: trimmed)
            }

            return item
        }

        return items.isEmpty ? [IntakePersonListItem()] : items
    }

    private func legacyPersonListDisplay(_ values: [String]) -> String {
        values.compactMap { value in
            guard let data = value.data(using: .utf8),
                  let item = try? JSONDecoder().decode(IntakePersonListItem.self, from: data) else {
                return value
            }

            return item.fullName
        }
        .filter { $0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false }
        .joined(separator: "\n")
    }

    private func serializedPersonListValues(from items: [IntakePersonListItem]) -> [String] {
        filledPersonRows(items).map(serializePersonListItem)
    }

    private func filledPersonRows(_ items: [IntakePersonListItem]) -> [IntakePersonListItem] {
        items.filter(hasAnyPersonRowValue)
    }

    private func syncTrusteesFromCurrentTrustmakers() {
        let currentTrustmakers = filledPersonRows(grantors).filter(\.isCurrentTrustee)
        var nextTrustees = trustees.filter { $0.isCurrentTrustee == false && hasAnyPersonRowValue($0) }

        for trustmaker in currentTrustmakers where nextTrustees.contains(where: { personListItemsMatch($0, trustmaker) }) == false {
            nextTrustees.append(trusteeRow(from: trustmaker))
        }

        if nextTrustees.isEmpty {
            nextTrustees = [IntakePersonListItem()]
        }

        if nextTrustees != trustees {
            trustees = nextTrustees
        }
    }

    private func trusteeRow(from trustmaker: IntakePersonListItem) -> IntakePersonListItem {
        IntakePersonListItem(
            fullName: trustmaker.fullName,
            email: trustmaker.email,
            address: trustmaker.address,
            phoneCountryIso2: trustmaker.phoneCountryIso2,
            phoneCountryCode: trustmaker.phoneCountryCode,
            phone: trustmaker.phone,
            isSigningTrustee: false,
            isCurrentTrustee: true
        )
    }

    private func personListItemsMatch(_ lhs: IntakePersonListItem, _ rhs: IntakePersonListItem) -> Bool {
        let lhsEmail = lhs.email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let rhsEmail = rhs.email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if lhsEmail.isEmpty == false, rhsEmail.isEmpty == false, lhsEmail == rhsEmail {
            return true
        }

        let lhsPhone = lhs.phone.filter(\.isNumber)
        let rhsPhone = rhs.phone.filter(\.isNumber)
        if lhsPhone.isEmpty == false, rhsPhone.isEmpty == false, lhsPhone == rhsPhone {
            return true
        }

        let lhsName = normalizedPersonToken(lhs.fullName)
        let rhsName = normalizedPersonToken(rhs.fullName)
        return lhsName.isEmpty == false && rhsName.isEmpty == false && lhsName == rhsName
    }

    private func normalizedPersonToken(_ value: String) -> String {
        value.lowercased().filter { $0.isLetter || $0.isNumber }
    }

    private func hasAnyPersonRowValue(_ item: IntakePersonListItem) -> Bool {
        hasText(item.fullName) || hasText(item.email) || hasText(item.address) || hasText(item.phone)
    }

    private func hasValidRequiredPersonRows(_ items: [IntakePersonListItem]) -> Bool {
        let filledRows = filledPersonRows(items)
        guard filledRows.isEmpty == false else {
            return false
        }

        return filledRows.allSatisfy(isCompletePersonRow)
    }

    private func hasValidOptionalPersonRows(_ items: [IntakePersonListItem]) -> Bool {
        filledPersonRows(items).allSatisfy(isCompletePersonRow)
    }

    private func isCompletePersonRow(_ item: IntakePersonListItem) -> Bool {
        hasText(item.fullName)
            && hasText(item.email)
            && IntakeContactFormatting.isValidEmail(item.email)
            && hasText(item.phoneCountryCode)
            && IntakeContactFormatting.isValidPhoneCountryCode(item.phoneCountryCode)
            && hasText(item.phone)
            && IntakeContactFormatting.isValidPhone(item.phone, countryIso2: item.phoneCountryIso2)
    }

    private var hasValidCurrentTrustmakerPrincipal: Bool {
        guard let trustmaker = currentTrustmakerPrincipal else {
            return false
        }

        return hasText(trustmaker.address)
    }

    private func removePersonRow(from items: inout [IntakePersonListItem], at index: Int) {
        guard items.indices.contains(index) else {
            return
        }

        items.remove(at: index)
        if items.isEmpty {
            items.append(IntakePersonListItem())
        }
    }

    private func priorDocumentValues() -> [String] {
        priorDocumentItems
            .enumerated()
            .compactMap { index, item in
                guard hasPriorDocumentRowValue(item) else {
                    return nil
                }

                return serializedPriorDocumentValue(item, index: index)
            }
    }

    private func priorDocumentDisplay(_ values: [String]) -> [IntakePriorDocumentItem] {
        values.enumerated().compactMap { index, value -> IntakePriorDocumentItem? in
            let trimmedValue = value.trimmingCharacters(in: .whitespacesAndNewlines)
            guard trimmedValue.isEmpty == false else {
                return nil
            }

            if let item = parsePriorDocumentValue(trimmedValue, fallbackOrder: index + 1) {
                return item
            }

            return IntakePriorDocumentItem(
                chronologyOrder: index + 1,
                documentType: "",
                documentLabel: trimmedValue,
                documentDate: "",
                attachmentReference: ""
            )
        }
        .sorted { $0.chronologyOrder < $1.chronologyOrder }
        .enumerated()
        .map { index, item in
            var reindexedItem = item
            reindexedItem.chronologyOrder = index + 1
            return reindexedItem
        }
    }

    private var filledPriorDocumentRows: [IntakePriorDocumentItem] {
        priorDocumentItems.filter(hasPriorDocumentRowValue)
    }

    private func hasPriorDocumentRowValue(_ item: IntakePriorDocumentItem) -> Bool {
        item.documentType.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
            || item.documentLabel.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
            || item.documentDate.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
            || item.attachmentReference.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
    }

    private func hasCompletePriorDocumentRow(_ item: IntakePriorDocumentItem) -> Bool {
        item.documentType.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
            && item.documentLabel.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
            && item.documentDate.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
            && item.attachmentReference.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
    }

    private func hasValidPriorDocumentDate(_ item: IntakePriorDocumentItem) -> Bool {
        IntakeDateFormatting.isValidPastOrTodayISODate(item.documentDate.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    private func advanceTrustmakerPrincipal() -> Bool {
        let nextIndex = trustmakerPrincipalIndex + 1
        guard nextIndex < trustmakerPrincipalRows.count else {
            return false
        }

        trustmakerPrincipalIndex = nextIndex
        return true
    }

    private func resetTrustmakerPrincipalProgress() {
        trustmakerPrincipalIndex = 0
    }

    private func reindexPriorDocumentItems() {
        priorDocumentItems = priorDocumentItems.enumerated().map { index, item in
            var reindexedItem = item
            reindexedItem.chronologyOrder = index + 1
            return reindexedItem
        }
    }

    private func serializedPriorDocumentValue(_ item: IntakePriorDocumentItem, index: Int) -> String? {
        let documentType = item.documentType.trimmingCharacters(in: .whitespacesAndNewlines)
        let documentLabel = item.documentLabel
        let documentDate = item.documentDate
        let attachmentReference = item.attachmentReference
        let object: [String: Any] = [
            "chronology_order": index + 1,
            "document_type": documentType,
            "title": documentLabel,
            "date": documentDate,
            "recording_reference": attachmentReference,
            "documentType": documentType,
            "documentLabel": documentLabel,
            "documentDate": documentDate,
            "attachmentReference": attachmentReference,
        ]

        guard let data = try? JSONSerialization.data(withJSONObject: object, options: []),
              let value = String(data: data, encoding: .utf8) else {
            return nil
        }

        return value
    }

    private func parsePriorDocumentValue(_ value: String, fallbackOrder: Int) -> IntakePriorDocumentItem? {
        guard let data = value.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }

        let chronologyOrder = object["chronologyOrder"] as? Int
            ?? object["chronology_order"] as? Int
            ?? fallbackOrder

        return IntakePriorDocumentItem(
            chronologyOrder: max(1, chronologyOrder),
            documentType: object["documentType"] as? String
                ?? object["document_type"] as? String
                ?? "",
            documentLabel: object["documentLabel"] as? String
                ?? object["title"] as? String
                ?? "",
            documentDate: object["documentDate"] as? String
                ?? object["date"] as? String
                ?? "",
            attachmentReference: object["attachmentReference"] as? String
                ?? object["attachment_reference"] as? String
                ?? object["recording_reference"] as? String
                ?? ""
        )
    }

    private static let originatingPriorDocumentTypes: Set<String> = [
        "trust_agreement",
        "declaration_of_trust",
    ]

    private static func formattedPriorDocumentTypeLabel(_ value: String) -> String {
        value
            .split(separator: "_")
            .map { word in
                word.prefix(1).uppercased() + word.dropFirst()
            }
            .joined(separator: " ")
    }

    private func seedPrincipalFromTrustmaker() {
        guard let trustmaker = filledPersonRows(grantors).first else {
            return
        }

        if principal.fullLegalName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            principal.fullLegalName = trustmaker.fullName
        }

        if principal.contact.email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
           principal.contact.phone.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            principal.contact = IntakePersonContact(
                email: trustmaker.email,
                phoneCountryIso2: trustmaker.phoneCountryIso2,
                phoneCountryCode: trustmaker.phoneCountryCode,
                phone: trustmaker.phone
            )
        }

        if principal.addressLine1.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            principal.addressLine1 = trustmaker.address
        }
    }

    private func trustBundlePrimaryPrincipalForAnswers() -> IntakePersonDetails? {
        guard productModeKey == "trust_bundle", let trustmaker = trustmakerPrincipalRows.first else {
            return nil
        }

        return IntakePersonDetails(
            fullLegalName: trustmaker.fullName,
            addressLine1: trustmaker.address,
            addressLine2: "",
            contact: IntakePersonContact(
                email: trustmaker.email,
                phoneCountryIso2: trustmaker.phoneCountryIso2,
                phoneCountryCode: trustmaker.phoneCountryCode,
                phone: trustmaker.phone
            )
        )
    }

    private func requesterDisplayName(from session: AuthSession?) -> String {
        let name = [session?.user.firstName, session?.user.lastName]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { $0.isEmpty == false }
            .joined(separator: " ")

        if name.isEmpty == false {
            return name
        }

        return session?.user.email ?? session?.user.phone ?? "Document owner"
    }

    private func field(for keys: [String]) -> MemberFacingField? {
        keys.lazy.compactMap { self.fieldsByKey[$0] }.first
    }

    private func nameKey(preferred keys: [String]) -> String {
        keys.first { fieldsByKey[$0] != nil } ?? keys[0]
    }

    private func stringAnswer(_ answers: [String: JSONValue], keys: [String]) -> String {
        keys.lazy.compactMap { answers[$0]?.stringValue }.first ?? ""
    }

    private func applyAddress(_ address: String, to person: inout IntakePersonDetails) {
        let lines = address.components(separatedBy: .newlines)
        person.addressLine1 = lines.first ?? ""
        person.addressLine2 = lines.dropFirst().joined(separator: " ")
    }

    private func parseContact(_ value: String) -> IntakePersonContact {
        guard let data = value.data(using: .utf8), value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false else {
            return IntakePersonContact()
        }

        return (try? JSONDecoder().decode(IntakePersonContact.self, from: data)) ?? IntakePersonContact()
    }

    private func serializeContact(_ contact: IntakePersonContact) -> String {
        if contact.email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
           contact.phone.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return ""
        }

        let normalized = IntakePersonContact(
            email: contact.email,
            phoneCountryIso2: contact.phoneCountryCode == "+1" ? "US" : contact.phoneCountryIso2,
            phoneCountryCode: contact.phoneCountryCode,
            phone: contact.phone
        )

        guard let data = try? JSONEncoder().encode(normalized) else {
            return ""
        }

        return String(data: data, encoding: .utf8) ?? ""
    }

    private func preferredJurisdiction(from jurisdictions: [IntakeJurisdictionOption]) -> String {
        if jurisdictions.contains(where: { $0.code == selectedJurisdiction }) {
            return selectedJurisdiction
        }

        return jurisdictions.first { $0.code == "CA" }?.code ?? jurisdictions.first?.code ?? ""
    }

    private func resetDraftState() {
        memberForm = nil
        fieldsByKey = [:]
        documentId = nil
        draftRevision = nil
        draftUpdatedAt = nil
        lastServerDraftSignature = nil
        cancelPendingAutosave()
        principal = IntakePersonDetails()
        agent = IntakePersonDetails()
        successorAgents = ""
        selectedAgentSignatureAuthority = ""
        selectedAuthorityScopes = []
        trustName = ""
        trustDate = ""
        grantors = [IntakePersonListItem()]
        trustees = [IntakePersonListItem()]
        successorTrustees = [IntakePersonListItem()]
        revocationHolders = ""
        selectedTrusteeSignatureAuthority = ""
        trusteeSignatureAuthorityCustomText = ""
        selectedTrusteeIncapacityStandard = ""
        selectedTaxIdOwner = ""
        assetTitlingFormat = ""
        selectedTrusteePowers = []
        revocationHoldersCustomText = ""
        priorDocumentItems = []
        trustmakerPrincipalIndex = 0
        clearNotarizationFile()
        notarizationDocumentDescription = ""
        notarizationReason = ""
        clearAddressAutocomplete()
        addressSessionTokens = [:]
        isSubmitted = false
        submittedDocumentId = nil
        draftNotice = nil
    }

    private func displayMessage(for error: Error, fallback: String) -> String {
        if case AuthAPIError.validation(let message) = error, let message {
            return message
        }

        if case AuthAPIError.unexpectedStatus(_, let message) = error, let message {
            return message
        }

        if case AuthAPIError.server(_, let message) = error, let message {
            return message
        }

        return error.localizedDescription == "The operation couldn't be completed. (DARCiMobile.IntakeError error 0.)"
            ? fallback
            : fallback
    }
}

private enum IntakeError: Error {
    case missingJurisdiction
    case missingMemberForm
    case missingDraft
    case missingUploadTarget
}

private extension String {
    var nilIfEmpty: String? {
        isEmpty ? nil : self
    }
}