import Foundation

@MainActor
final class DocumentIntakeViewModel: ObservableObject {
    static let rulesSnapshotVersion = "member_form_rules_contract_v1"
    private static let notarizationMaxUploadBytes = 25 * 1024 * 1024

    @Published private(set) var step: POAIntakeStep = .productInfo
    @Published private(set) var jurisdictions: [IntakeJurisdictionOption] = []
    @Published private(set) var isLoading = false
    @Published private(set) var isSaving = false
    @Published private(set) var isSubmitted = false
    @Published var errorMessage: String?
    @Published var draftNotice: String?
    @Published var selectedJurisdiction = "CA"
    @Published var principal = IntakePersonDetails()
    @Published var agent = IntakePersonDetails()
    @Published var successorAgents = ""
    @Published var selectedAgentSignatureAuthority = ""
    @Published var selectedAuthorityScopes: Set<String> = []
    @Published var trustName = ""
    @Published var trustDate = ""
    @Published var grantors = ""
    @Published var trustees = ""
    @Published var successorTrustees = ""
    @Published var revocationHolders = ""
    @Published var selectedTrusteeSignatureAuthority = ""
    @Published var trusteeSignatureAuthorityCustomText = ""
    @Published var selectedTaxIdOwner = ""
    @Published var assetTitlingFormat = ""
    @Published var selectedTrusteePowers: Set<String> = []
    @Published var revocationHoldersCustomText = ""
    @Published var priorDocumentItems = ""
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
    private var memberForm: MemberFormRulesContract?
    private var fieldsByKey: [String: MemberFacingField] = [:]
    private var documentId: String?
    private var draftRevision: Int?
    private var addressSessionTokens: [String: String] = [:]

    init(apiClient: DocumentIntakeAPIProviding = DocumentIntakeAPIClient()) {
        self.apiClient = apiClient
    }

    var selectedJurisdictionLabel: String {
        jurisdictions.first { $0.code == selectedJurisdiction }?.label ?? selectedJurisdiction
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
            return hasText(selectedJurisdiction) && hasText(trustName) && hasText(trustDate)
        case .trustPeople:
            return hasText(grantors) && hasText(trustees)
        case .trustAuthority:
            guard hasText(selectedTrusteeSignatureAuthority) else {
                return false
            }

            return selectedTrusteeSignatureAuthority != "custom" || hasText(trusteeSignatureAuthorityCustomText)
        case .trustDocuments:
            return true
        case .principal:
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

    var trusteeSignatureAuthorityOptions: [IntakeOption] {
        field(for: ["trustee_signature_authority"])?.allowedOptions ?? []
    }

    var trusteePowerOptions: [IntakeOption] {
        field(for: ["trustee_powers"])?.allowedOptions ?? []
    }

    var taxIdOwnerOptions: [IntakeOption] {
        let grantorNames = personListNames(from: grantors)
        if grantorNames.isEmpty == false {
            return grantorNames.map { IntakeOption(id: $0, label: $0) }
        }

        return field(for: ["tax_id_owner"])?.allowedOptions ?? []
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

    func start(modeKey: String, session: AuthSession?) async {
        if productModeKey == modeKey, memberForm != nil {
            return
        }

        productModeKey = modeKey
        step = initialStep(for: modeKey)
        isSubmitted = false

        guard let accessToken = session?.accessToken, accessToken.isEmpty == false else {
            errorMessage = "Sign in again to start document intake."
            return
        }

        isLoading = true
        errorMessage = nil
        draftNotice = nil
        defer { isLoading = false }

        do {
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
                try await loadContractAndBootstrap(modeKey: modeKey, accessToken: accessToken)
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
                try await loadContractAndBootstrap(modeKey: modeKey, accessToken: accessToken)
            }
        } catch {
            errorMessage = displayMessage(for: error, fallback: "Failed to load jurisdiction requirements.")
        }
    }

    func goBack() -> Bool {
        if let previous = previousStep() {
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

        await saveCurrentDraft(accessToken: accessToken)

        if errorMessage == nil, let next = nextStep() {
            if productModeKey == "trust_bundle", step == .trustDocuments, next == .principal {
                seedPrincipalFromTrustmaker()
            }
            step = next
        }
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

    private func loadContractAndBootstrap(modeKey: String, accessToken: String) async throws {
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

        let bootstrapResponse = try await apiClient.bootstrapDocumentIntake(
            DocumentIntakeBootstrapRequest(
                productFlowMode: modeKey,
                jurisdiction: selectedJurisdiction,
                rulesSnapshotVersion: Self.rulesSnapshotVersion,
                resumeLatestDraft: false
            ),
            accessToken: accessToken
        )

        documentId = bootstrapResponse.document?.id ?? bootstrapResponse.draft?.documentId
        applyDraft(bootstrapResponse.draft)
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

    private func saveCurrentDraft(accessToken: String) async {
        guard let documentId else {
            errorMessage = "Document draft is not ready yet."
            return
        }

        isSaving = true
        defer { isSaving = false }

        do {
            let response = try await apiClient.saveDocumentIntakeDraft(
                documentId: documentId,
                request: DocumentIntakeDraftUpsertRequest(
                    currentStep: step.persistedStepKey,
                    rulesSnapshotVersion: Self.rulesSnapshotVersion,
                    answers: buildAnswers(),
                    expectedRevision: draftRevision
                ),
                accessToken: accessToken
            )
            applyDraft(response.draft)
        } catch AuthAPIError.unexpectedStatus(let statusCode, _) where statusCode == 409 {
            await reloadDraftAfterConflict(documentId: documentId, accessToken: accessToken)
        } catch {
            errorMessage = displayMessage(for: error, fallback: "Failed to save this draft.")
        }
    }

    private func submit(accessToken: String) async {
        guard let documentId else {
            errorMessage = "Document draft is not ready yet."
            return
        }

        isSaving = true
        defer { isSaving = false }

        do {
            let response = try await apiClient.submitDocumentIntakeDraft(
                documentId: documentId,
                request: DocumentIntakeSubmitRequest(
                    currentStep: step.persistedStepKey,
                    rulesSnapshotVersion: Self.rulesSnapshotVersion,
                    answers: buildAnswers(),
                    expectedRevision: draftRevision
                ),
                accessToken: accessToken
            )
            applyDraft(response.draft)
            isSubmitted = true
            draftNotice = "Intake submitted. Review is next."
        } catch AuthAPIError.unexpectedStatus(let statusCode, _) where statusCode == 409 {
            await reloadDraftAfterConflict(documentId: documentId, accessToken: accessToken)
        } catch {
            errorMessage = displayMessage(for: error, fallback: "Failed to submit this intake.")
        }
    }

    private func reloadDraftAfterConflict(documentId: String, accessToken: String) async {
        do {
            let response = try await apiClient.getDocumentIntakeDraft(documentId: documentId, accessToken: accessToken)
            applyDraft(response.draft)
            draftNotice = "Draft changed elsewhere. Synced the latest saved draft."
        } catch {
            errorMessage = displayMessage(for: error, fallback: "Draft changed elsewhere and could not be reloaded.")
        }
    }

    private func applyDraft(_ draft: DocumentIntakeDraft?) {
        guard let draft else {
            return
        }

        documentId = draft.documentId
        draftRevision = draft.revision
        applyAnswers(draft.answers)
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
        revocationHolders = personListDisplay(answers["revocation_holders"]?.stringArrayValue ?? [])
        selectedTrusteeSignatureAuthority = answers["trustee_signature_authority"]?.stringValue ?? ""
        trusteeSignatureAuthorityCustomText = answers["trustee_signature_authority_custom_text"]?.stringValue ?? ""
        selectedTaxIdOwner = answers["tax_id_owner"]?.stringValue ?? ""
        assetTitlingFormat = answers["asset_titling_format"]?.stringValue ?? ""
        selectedTrusteePowers = Set(answers["trustee_powers"]?.stringArrayValue ?? [])
        revocationHoldersCustomText = answers["revocation_holders_custom_text"]?.stringValue ?? ""
        priorDocumentItems = priorDocumentDisplay(answers["prior_document_items"]?.stringArrayValue ?? [])
    }

    private func buildAnswers() -> [String: JSONValue] {
        var answers: [String: JSONValue] = [:]
        if productModeKey == "trust_bundle" {
            answers["trust_name"] = .string(trustName)
            answers["trust_date"] = .string(trustDate)
            answers["grantors"] = .array(personListItems(from: grantors).map { .string(serializePersonListItem($0)) })
            answers["trustees"] = .array(personListItems(from: trustees).map { .string(serializePersonListItem($0)) })
            answers["successor_trustees"] = .array(personListItems(from: successorTrustees).map { .string(serializePersonListItem($0)) })
            answers["revocation_holders"] = .array(personListItems(from: revocationHolders).map { .string(serializePersonListItem($0)) })
            answers["trustee_signature_authority"] = .string(selectedTrusteeSignatureAuthority)
            answers["trustee_signature_authority_custom_text"] = .string(trusteeSignatureAuthorityCustomText)
            answers["tax_id_owner"] = .string(selectedTaxIdOwner)
            answers["asset_titling_format"] = .string(assetTitlingFormat)
            answers["trustee_powers"] = .array(selectedTrusteePowers.sorted().map(JSONValue.string))
            answers["revocation_holders_custom_text"] = .string(revocationHoldersCustomText)
            answers["prior_document_items"] = .array(priorDocumentValues().map(JSONValue.string))
        }

        answers[nameKey(preferred: ["principal_full_legal_name", "principal_full_name"])] = .string(principal.fullLegalName)
        answers["principal_address"] = .string(principal.address)
        answers["principal_contact"] = .string(serializeContact(principal.contact))
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

    private func personListNames(from value: String) -> [String] {
        value
            .split(whereSeparator: \.isNewline)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { $0.isEmpty == false }
    }

    private func personListItems(from value: String) -> [IntakePersonListItem] {
        personListNames(from: value).map { IntakePersonListItem(fullName: $0) }
    }

    private func serializePersonListItem(_ item: IntakePersonListItem) -> String {
        (try? String(data: JSONEncoder().encode(item), encoding: .utf8)) ?? ""
    }

    private func personListDisplay(_ values: [String]) -> String {
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

    private func priorDocumentValues() -> [String] {
        priorDocumentItems
            .split(whereSeparator: \.isNewline)
            .enumerated()
            .compactMap { index, line in
                let parts = line.split(separator: "|").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                let title = parts.indices.contains(0) ? parts[0] : ""
                guard title.isEmpty == false else {
                    return nil
                }

                let item = IntakePriorDocumentItem(
                    chronologyOrder: index + 1,
                    documentType: parts.indices.contains(1) ? parts[1] : "other",
                    documentLabel: title,
                    documentDate: parts.indices.contains(2) ? parts[2] : "",
                    attachmentReference: parts.indices.contains(3) ? parts[3] : ""
                )
                return (try? String(data: JSONEncoder().encode(item), encoding: .utf8)) ?? ""
            }
    }

    private func priorDocumentDisplay(_ values: [String]) -> String {
        values.compactMap { value in
            guard let data = value.data(using: .utf8),
                  let item = try? JSONDecoder().decode(IntakePriorDocumentItem.self, from: data) else {
                return value
            }

            return [item.documentLabel, item.documentType, item.documentDate, item.attachmentReference]
                .filter { $0.isEmpty == false }
                .joined(separator: " | ")
        }
        .joined(separator: "\n")
    }

    private func seedPrincipalFromTrustmaker() {
        guard let trustmaker = personListItems(from: grantors).first else {
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
        principal = IntakePersonDetails()
        agent = IntakePersonDetails()
        successorAgents = ""
        selectedAgentSignatureAuthority = ""
        selectedAuthorityScopes = []
        trustName = ""
        trustDate = ""
        grantors = ""
        trustees = ""
        successorTrustees = ""
        revocationHolders = ""
        selectedTrusteeSignatureAuthority = ""
        trusteeSignatureAuthorityCustomText = ""
        selectedTaxIdOwner = ""
        assetTitlingFormat = ""
        selectedTrusteePowers = []
        revocationHoldersCustomText = ""
        priorDocumentItems = ""
        clearNotarizationFile()
        notarizationDocumentDescription = ""
        notarizationReason = ""
        clearAddressAutocomplete()
        addressSessionTokens = [:]
        isSubmitted = false
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
    case missingUploadTarget
}

private extension String {
    var nilIfEmpty: String? {
        isEmpty ? nil : self
    }
}