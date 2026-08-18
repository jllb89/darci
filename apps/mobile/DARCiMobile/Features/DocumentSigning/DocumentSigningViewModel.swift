import Foundation

@MainActor
final class DocumentSigningViewModel: ObservableObject {
    @Published private(set) var payload: DocumentSigningResponse?
    @Published private(set) var savedSignatures: [SavedDocumentSignature] = []
    @Published private(set) var isLoading = false
    @Published private(set) var isSavingCapture = false
    @Published private(set) var isConfirming = false
    @Published private(set) var isLoadingAvailableNotaries = false
    @Published private(set) var isSubmittingNotarization = false
    @Published private(set) var errorMessage: String?
    @Published private(set) var availableNotaryErrorMessage: String?
    @Published private(set) var inviteDispatchSummary: SigningInviteDispatchSummary?
    @Published private(set) var availableNotariesPayload: AvailableNotariesResponse?
    @Published var selectedNotaryUserId: String?
    @Published var isSkippingSignatureForNotarization = false

    let documentId: String

    private let apiClient: DocumentIntakeAPIProviding
    private var pollTask: Task<Void, Never>?

    init(documentId: String, apiClient: DocumentIntakeAPIProviding = DocumentIntakeAPIClient()) {
        self.documentId = documentId
        self.apiClient = apiClient
    }

    var signing: DocumentSigningState? {
        payload?.signing
    }

    var primarySelfSignature: DocumentSigningSignature? {
        signing?.signatures.first { $0.partyRole == "principal" }
            ?? signing?.signatures.first { $0.partyRole == "grantor" }
            ?? signing?.signatures.first
    }

    var visibleSignatures: [DocumentSigningSignature] {
        guard let signing else { return [] }
        let memberVisibleSignatures = signing.signatures.filter(Self.isMemberVisibleSignature)
        guard let primarySignerName = Self.normalizedPartyName(primarySelfSignature?.partyName), primarySignerName.isEmpty == false else {
            return memberVisibleSignatures
        }

        return memberVisibleSignatures.filter { Self.normalizedPartyName($0.partyName) == primarySignerName }
    }

    var activeSignature: DocumentSigningSignature? {
        visibleSignatures.first { Self.isActionableSignature($0) }
            ?? visibleSignatures.first
    }

    var selectedOutput: DocumentReviewOutput? {
        guard let signing else { return nil }
        if let activeSignature,
           let matchingOutput = signing.outputs.first(where: { $0.outputKey == activeSignature.outputKey }) {
            return matchingOutput
        }

        return signing.outputs.first
    }

    var canConfirm: Bool {
        signing?.completion.canConfirm == true && isConfirming == false
    }

    var isReadyForSignatureMutations: Bool {
        payload?.document?.status == "pending_signature" && signing?.state != "confirmed"
    }

    var hasPendingVisibleActionableSignatures: Bool {
        visibleSignatures.contains { Self.isActionableSignature($0) }
    }

    var shouldShowCaptureControls: Bool {
        isReadyForSignatureMutations && hasPendingVisibleActionableSignatures
    }

    var shouldShowCompletionActions: Bool {
        isReadyForSignatureMutations && signing?.completion.canConfirm == true
    }

    var shouldShowNotarySelection: Bool {
        signing?.viewerAccess?.kind != "invited_signer"
            && (payload?.document?.status == "pending_notary" || canContinueWithoutSignature)
    }

    var canContinueWithoutSignature: Bool {
        isSkippingSignatureForNotarization
            && isDocumentNotarization
            && payload?.document?.status == "pending_signature"
            && signing?.state != "confirmed"
    }

    private var isDocumentNotarization: Bool {
        payload?.document?.productFlowMode == "notarize_document"
            || payload?.document?.documentType == "notarize_document"
            || payload?.document?.documentType == "uploaded_document"
    }

    var availableNotaries: [AvailableNotary] {
        availableNotariesPayload?.notaries ?? []
    }

    var activeNotarizationRequestId: String? {
        availableNotariesPayload?.notarization?.activeRequestId
    }

    var selectedAvailableNotary: AvailableNotary? {
        availableNotaries.first { $0.userId == selectedNotaryUserId }
    }

    var canSubmitSelectedNotary: Bool {
        selectedAvailableNotary != nil
            && activeNotarizationRequestId == nil
            && isLoadingAvailableNotaries == false
            && isSubmittingNotarization == false
    }

    func load(session: AuthSession?) async {
        await fetchSigning(session: session, silent: false)
    }

    func stop() {
        pollTask?.cancel()
        pollTask = nil
    }

    func fetchSavedSignatures(session: AuthSession?) async {
        guard let accessToken = session?.accessToken else {
            errorMessage = "Sign in again to load saved signatures."
            return
        }

        do {
            let response = try await apiClient.listSavedSignatures(documentId: documentId, accessToken: accessToken)
            savedSignatures = response.savedSignatures ?? []
            errorMessage = nil
        } catch {
            errorMessage = displayMessage(for: error, fallback: "Failed to load saved signatures.")
        }
    }

    func fetchAvailableNotaries(session: AuthSession?) async {
        guard let accessToken = session?.accessToken else {
            availableNotaryErrorMessage = "Sign in again to load available notaries."
            return
        }

        isLoadingAvailableNotaries = true
        defer { isLoadingAvailableNotaries = false }

        do {
            let response = try await apiClient.listAvailableNotaries(documentId: documentId, accessToken: accessToken)
            availableNotariesPayload = response
            availableNotaryErrorMessage = nil
            if let selectedNotaryUserId, (response.notaries ?? []).contains(where: { $0.userId == selectedNotaryUserId }) == false {
                self.selectedNotaryUserId = nil
            }
            if self.selectedNotaryUserId == nil, let firstNotary = response.notaries?.first {
                self.selectedNotaryUserId = firstNotary.userId
            }
        } catch {
            availableNotariesPayload = nil
            availableNotaryErrorMessage = displayMessage(for: error, fallback: "Failed to load available notaries.")
        }
    }

    func captureTypedSignature(
        _ signature: DocumentSigningSignature,
        typedValue: String,
        typedKind: String,
        session: AuthSession?
    ) async -> Bool {
        let trimmedValue = typedValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmedValue.isEmpty == false else {
            errorMessage = "Enter the typed signature first."
            return false
        }

        return await captureSignature(
            signature,
            request: DocumentSignatureCaptureRequest(
                generationRunId: signature.generationRunId,
                outputSignerId: signature.outputSignerId,
                captureMethod: "type",
                typedValue: trimmedValue,
                typedKind: typedKind,
                imageDataUrl: nil,
                savedSignatureId: nil,
                reuseSourceSignatureId: nil
            ),
            session: session,
            fallback: "Failed to save typed signature."
        )
    }

    func captureTypedSignatureForRequiredDocuments(
        from signature: DocumentSigningSignature,
        typedValue: String,
        typedKind: String,
        session: AuthSession?
    ) async -> Bool {
        let trimmedValue = typedValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmedValue.isEmpty == false else {
            errorMessage = "Enter the typed signature first."
            return false
        }

        return await captureRequiredSignatures(
            from: signature,
            session: session,
            fallback: "Failed to save typed signature."
        ) { targetSignature, reuseSourceSignatureId in
            DocumentSignatureCaptureRequest(
                generationRunId: targetSignature.generationRunId,
                outputSignerId: targetSignature.outputSignerId,
                captureMethod: "type",
                typedValue: trimmedValue,
                typedKind: typedKind,
                imageDataUrl: nil,
                savedSignatureId: nil,
                reuseSourceSignatureId: reuseSourceSignatureId
            )
        }
    }

    func captureDrawnSignature(
        _ signature: DocumentSigningSignature,
        imageDataUrl: String,
        session: AuthSession?
    ) async -> Bool {
        guard imageDataUrl.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false else {
            errorMessage = "Draw the signature before saving it."
            return false
        }

        return await captureSignature(
            signature,
            request: DocumentSignatureCaptureRequest(
                generationRunId: signature.generationRunId,
                outputSignerId: signature.outputSignerId,
                captureMethod: "draw",
                typedValue: nil,
                typedKind: nil,
                imageDataUrl: imageDataUrl,
                savedSignatureId: nil,
                reuseSourceSignatureId: nil
            ),
            session: session,
            fallback: "Failed to save drawn signature."
        )
    }

    func captureDrawnSignatureForRequiredDocuments(
        from signature: DocumentSigningSignature,
        imageDataUrl: String,
        session: AuthSession?
    ) async -> Bool {
        guard imageDataUrl.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false else {
            errorMessage = "Draw the signature before saving it."
            return false
        }

        return await captureRequiredSignatures(
            from: signature,
            session: session,
            fallback: "Failed to save drawn signature."
        ) { targetSignature, reuseSourceSignatureId in
            DocumentSignatureCaptureRequest(
                generationRunId: targetSignature.generationRunId,
                outputSignerId: targetSignature.outputSignerId,
                captureMethod: "draw",
                typedValue: nil,
                typedKind: nil,
                imageDataUrl: imageDataUrl,
                savedSignatureId: nil,
                reuseSourceSignatureId: reuseSourceSignatureId
            )
        }
    }

    func applySavedSignature(
        _ signature: DocumentSigningSignature,
        savedSignatureId: String,
        session: AuthSession?
    ) async -> Bool {
        await captureSignature(
            signature,
            request: DocumentSignatureCaptureRequest(
                generationRunId: signature.generationRunId,
                outputSignerId: signature.outputSignerId,
                captureMethod: "saved",
                typedValue: nil,
                typedKind: nil,
                imageDataUrl: nil,
                savedSignatureId: savedSignatureId,
                reuseSourceSignatureId: nil
            ),
            session: session,
            fallback: "Failed to apply saved signature."
        )
    }

    func applySavedSignatureForRequiredDocuments(
        from signature: DocumentSigningSignature,
        savedSignatureId: String,
        session: AuthSession?
    ) async -> Bool {
        await captureRequiredSignatures(
            from: signature,
            session: session,
            fallback: "Failed to apply saved signature."
        ) { targetSignature, _ in
            DocumentSignatureCaptureRequest(
                generationRunId: targetSignature.generationRunId,
                outputSignerId: targetSignature.outputSignerId,
                captureMethod: "saved",
                typedValue: nil,
                typedKind: nil,
                imageDataUrl: nil,
                savedSignatureId: savedSignatureId,
                reuseSourceSignatureId: nil
            )
        }
    }

    func uploadSignatureAsset(
        _ signature: DocumentSigningSignature,
        fileName: String,
        data: Data,
        mimeType: String,
        session: AuthSession?
    ) async -> Bool {
        guard let accessToken = session?.accessToken else {
            errorMessage = "Sign in again to upload this signature."
            return false
        }

        isSavingCapture = true
        defer { isSavingCapture = false }

        do {
            let requestResponse = try await apiClient.requestSignatureUpload(
                documentId: documentId,
                request: DocumentSignatureUploadRequest(
                    generationRunId: signature.generationRunId,
                    outputSignerId: signature.outputSignerId,
                    fileName: fileName,
                    fileSize: data.count,
                    mimeType: mimeType,
                    reuseSourceSignatureId: nil
                ),
                accessToken: accessToken
            )

            guard let signatureId = requestResponse.signature?.id,
                  let signedUrlString = requestResponse.upload?.signedUrl,
                  let signedUrl = URL(string: signedUrlString) else {
                throw SigningError.missingUploadTarget
            }

            try await apiClient.uploadSignatureAsset(data: data, mimeType: mimeType, to: signedUrl)
            let finalizeResponse = try await apiClient.finalizeSignatureUpload(
                documentId: documentId,
                request: DocumentSignatureFinalizeRequest(
                    signatureId: signatureId,
                    generationRunId: signature.generationRunId,
                    outputSignerId: signature.outputSignerId
                ),
                accessToken: accessToken
            )

            applyRemainingSignerInviteDispatchSummary(finalizeResponse.remainingSignerInvites)
            await fetchSigning(session: session, silent: true)
            await fetchSavedSignatures(session: session)
            errorMessage = nil
            return true
        } catch {
            errorMessage = displayMessage(for: error, fallback: "Failed to upload signature image.")
            return false
        }
    }

    func uploadSignatureAssetForRequiredDocuments(
        from signature: DocumentSigningSignature,
        fileName: String,
        data: Data,
        mimeType: String,
        session: AuthSession?
    ) async -> Bool {
        guard let accessToken = session?.accessToken else {
            errorMessage = "Sign in again to upload this signature."
            return false
        }

        let targetSignatures = targetSignaturesForSharedCapture(from: signature)
        isSavingCapture = true
        defer { isSavingCapture = false }

        do {
            var latestInviteDispatch: RemainingSignerInviteDispatchResponse?
            var reuseSourceSignatureId: String?
            for targetSignature in targetSignatures {
                let requestResponse = try await apiClient.requestSignatureUpload(
                    documentId: documentId,
                    request: DocumentSignatureUploadRequest(
                        generationRunId: targetSignature.generationRunId,
                        outputSignerId: targetSignature.outputSignerId,
                        fileName: fileName,
                        fileSize: data.count,
                        mimeType: mimeType,
                        reuseSourceSignatureId: reuseSourceSignatureId
                    ),
                    accessToken: accessToken
                )

                guard let signatureId = requestResponse.signature?.id,
                      let signedUrlString = requestResponse.upload?.signedUrl,
                      let signedUrl = URL(string: signedUrlString) else {
                    throw SigningError.missingUploadTarget
                }

                try await apiClient.uploadSignatureAsset(data: data, mimeType: mimeType, to: signedUrl)
                let finalizeResponse = try await apiClient.finalizeSignatureUpload(
                    documentId: documentId,
                    request: DocumentSignatureFinalizeRequest(
                        signatureId: signatureId,
                        generationRunId: targetSignature.generationRunId,
                        outputSignerId: targetSignature.outputSignerId
                    ),
                    accessToken: accessToken
                )
                latestInviteDispatch = finalizeResponse.remainingSignerInvites
                if reuseSourceSignatureId == nil {
                    reuseSourceSignatureId = signatureId
                }
            }

            applyRemainingSignerInviteDispatchSummary(latestInviteDispatch)
            await fetchSigning(session: session, silent: true)
            await fetchSavedSignatures(session: session)
            errorMessage = nil
            return true
        } catch {
            errorMessage = displayMessage(for: error, fallback: "Failed to upload signature image.")
            return false
        }
    }

    func deleteSavedSignature(_ signatureId: String, session: AuthSession?) async -> Bool {
        guard let accessToken = session?.accessToken else {
            errorMessage = "Sign in again to delete this saved signature."
            return false
        }

        do {
            _ = try await apiClient.deleteSavedSignature(documentId: documentId, signatureId: signatureId, accessToken: accessToken)
            savedSignatures.removeAll { $0.id == signatureId }
            errorMessage = nil
            return true
        } catch {
            errorMessage = displayMessage(for: error, fallback: "Failed to delete saved signature.")
            return false
        }
    }

    func confirmSigning(session: AuthSession?) async -> Bool {
        guard let accessToken = session?.accessToken else {
            errorMessage = "Sign in again to confirm signatures."
            return false
        }

        guard signing?.completion.canConfirm == true else {
            errorMessage = "Complete required signatures before confirming."
            return false
        }

        isConfirming = true
        defer { isConfirming = false }

        do {
            _ = try await apiClient.confirmDocumentSigning(
                documentId: documentId,
                request: DocumentSignConfirmRequest(confirmed: true),
                accessToken: accessToken
            )
            await fetchSigning(session: session, silent: true)
            errorMessage = nil
            return true
        } catch {
            errorMessage = displayMessage(for: error, fallback: "Failed to confirm signatures.")
            return false
        }
    }

    func submitToSelectedNotary(session: AuthSession?) async -> Bool {
        guard let accessToken = session?.accessToken else {
            errorMessage = "Sign in again to send this document to a notary."
            return false
        }

        guard let selectedAvailableNotary else {
            errorMessage = "Choose a notary before sending the document."
            return false
        }

        guard activeNotarizationRequestId == nil else {
            errorMessage = "This document already has a notarization request."
            return false
        }

        isSubmittingNotarization = true
        defer { isSubmittingNotarization = false }

        do {
            _ = try await apiClient.submitNotarization(
                documentId: documentId,
                request: SubmitNotarizationRequest(
                    selectedNotaryUserId: selectedAvailableNotary.userId,
                    signatureSkipped: canContinueWithoutSignature ? true : nil,
                    signatureSkipReason: canContinueWithoutSignature ? "member_selected_no_signature" : nil
                ),
                accessToken: accessToken
            )
            await fetchSigning(session: session, silent: true)
            await fetchAvailableNotaries(session: session)
            errorMessage = nil
            return true
        } catch {
            errorMessage = displayMessage(for: error, fallback: "Failed to send document to the selected notary.")
            return false
        }
    }

    private func fetchSigning(session: AuthSession?, silent: Bool) async {
        guard let accessToken = session?.accessToken else {
            errorMessage = "Sign in again to load signing workspace."
            return
        }

        if silent == false {
            isLoading = true
        }

        do {
            let response = try await apiClient.getDocumentSigning(documentId: documentId, accessToken: accessToken)
            guard response.document != nil, response.signing != nil else {
                throw SigningError.missingSigningWorkspace
            }

            payload = response
            errorMessage = nil
            schedulePollIfNeeded(session: session)
        } catch {
            errorMessage = displayMessage(for: error, fallback: "Failed to load signing workspace.")
        }

        if silent == false {
            isLoading = false
        }
    }

    private func captureSignature(
        _ signature: DocumentSigningSignature,
        request: DocumentSignatureCaptureRequest,
        session: AuthSession?,
        fallback: String
    ) async -> Bool {
        guard let accessToken = session?.accessToken else {
            errorMessage = "Sign in again to save this signature."
            return false
        }

        isSavingCapture = true
        defer { isSavingCapture = false }

        do {
            let response = try await apiClient.captureSignature(documentId: documentId, request: request, accessToken: accessToken)
            applyRemainingSignerInviteDispatchSummary(response.remainingSignerInvites)
            await fetchSigning(session: session, silent: true)
            await fetchSavedSignatures(session: session)
            errorMessage = nil
            return true
        } catch {
            errorMessage = displayMessage(for: error, fallback: fallback)
            return false
        }
    }

    private func captureRequiredSignatures(
        from signature: DocumentSigningSignature,
        session: AuthSession?,
        fallback: String,
        makeRequest: (DocumentSigningSignature, String?) -> DocumentSignatureCaptureRequest
    ) async -> Bool {
        guard isReadyForSignatureMutations else {
            errorMessage = nil
            return false
        }

        guard let accessToken = session?.accessToken else {
            errorMessage = "Sign in again to save this signature."
            return false
        }

        let targetSignatures = targetSignaturesForSharedCapture(from: signature)
        isSavingCapture = true
        defer { isSavingCapture = false }

        do {
            var latestInviteDispatch: RemainingSignerInviteDispatchResponse?
            var reuseSourceSignatureId: String?
            for targetSignature in targetSignatures {
                let request = makeRequest(targetSignature, reuseSourceSignatureId)
                let response = try await apiClient.captureSignature(documentId: documentId, request: request, accessToken: accessToken)
                latestInviteDispatch = response.remainingSignerInvites
                if reuseSourceSignatureId == nil, let signatureId = response.signature?.id {
                    reuseSourceSignatureId = signatureId
                }
            }

            applyRemainingSignerInviteDispatchSummary(latestInviteDispatch)
            await fetchSigning(session: session, silent: true)
            await fetchSavedSignatures(session: session)
            errorMessage = nil
            return true
        } catch {
            errorMessage = displayMessage(for: error, fallback: fallback)
            return false
        }
    }

    private func targetSignaturesForSharedCapture(from signature: DocumentSigningSignature) -> [DocumentSigningSignature] {
        let signerName = Self.normalizedPartyName(signature.partyName)
        let pendingRequiredSignatures = visibleSignatures.filter { candidate in
            Self.isActionableSignature(candidate)
                && Self.normalizedPartyName(candidate.partyName) == signerName
        }

        if pendingRequiredSignatures.isEmpty == false {
            return pendingRequiredSignatures
        }

        return [signature]
    }

    private static func isActionableSignature(_ signature: DocumentSigningSignature) -> Bool {
        guard signature.status != "captured" else { return false }
        if signature.isRequired { return true }
        return signature.signingGroup != nil && signature.groupMinimumRequired != nil && signature.groupSatisfied == false
    }

    private static func isMemberVisibleSignature(_ signature: DocumentSigningSignature) -> Bool {
        normalizedDocumentKey(signature.outputKey) != "trust_certificate"
            && normalizedDocumentKey(signature.documentKey) != "trust_certificate"
    }

    private static func normalizedDocumentKey(_ value: String?) -> String {
        value?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .replacingOccurrences(of: " ", with: "_")
            .replacingOccurrences(of: "-", with: "_") ?? ""
    }

    private func schedulePollIfNeeded(session: AuthSession?) {
        pollTask?.cancel()

        guard signing?.state == "preparing" else {
            pollTask = nil
            return
        }

        pollTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(4))
            guard Task.isCancelled == false else { return }
            await self?.fetchSigning(session: session, silent: true)
        }
    }

    private func applyRemainingSignerInviteDispatchSummary(_ response: RemainingSignerInviteDispatchResponse?) {
        guard let response else {
            inviteDispatchSummary = nil
            return
        }

        let invitedCount = response.invited?.count ?? 0
        let failureCount = response.failures?.count ?? 0
        let skippedCount = response.skipped?.filter { $0.reason != "recipient_already_completed" }.count ?? 0

        if failureCount > 0 {
            inviteDispatchSummary = SigningInviteDispatchSummary(status: "partial", message: "Some signer invites could not be sent.")
        } else if invitedCount > 0 {
            inviteDispatchSummary = SigningInviteDispatchSummary(status: "done", message: "Remaining signer invites sent.")
        } else if skippedCount > 0 {
            inviteDispatchSummary = SigningInviteDispatchSummary(status: "done", message: "No additional signer invites were needed.")
        } else {
            inviteDispatchSummary = SigningInviteDispatchSummary(status: "idle", message: nil)
        }
    }

    private func displayMessage(for error: Error, fallback: String) -> String {
        if case AuthAPIError.validation(let message) = error {
            return message ?? fallback
        }

        if case AuthAPIError.unauthorized(let message) = error {
            return message ?? "Sign in again to continue."
        }

        if case AuthAPIError.server(_, let message) = error {
            return message ?? fallback
        }

        if case AuthAPIError.unexpectedStatus(_, let message) = error {
            return message ?? fallback
        }

        return fallback
    }

    private static func normalizedPartyName(_ value: String?) -> String? {
        value?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
    }
}

struct SigningInviteDispatchSummary: Equatable, Sendable {
    let status: String
    let message: String?
}

private enum SigningError: Error {
    case missingSigningWorkspace
    case missingUploadTarget
}