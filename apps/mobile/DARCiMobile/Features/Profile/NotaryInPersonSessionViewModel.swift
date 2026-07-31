import Foundation

enum NotaryInPersonSessionStep: String, Equatable, Sendable {
    case start
    case samePlace
    case identity
    case venue
    case seal
    case complete
    case finalize
    case done

    var title: String {
        switch self {
        case .start:
            "Start session"
        case .samePlace:
            "Same-place check"
        case .identity:
            "ID verification"
        case .venue:
            "Acknowledgment venue"
        case .seal:
            "Seal acknowledgment"
        case .complete:
            "Complete session"
        case .finalize:
            "Final package"
        case .done:
            "Verification ready"
        }
    }
}

struct NotarySessionTimelineItem: Identifiable, Equatable, Sendable {
    let id: String
    let label: String
    let isComplete: Bool
}

@MainActor
final class NotaryInPersonSessionViewModel: ObservableObject {
    @Published private(set) var context: NotaryRequestReviewContext?
    @Published private(set) var notaryProfile: EditableNotaryProfile?
    @Published private(set) var selectedDocument: NotaryReviewDocumentFile?
    @Published private(set) var pdfData: Data?
    @Published private(set) var isLoading = false
    @Published private(set) var isLoadingPreview = false
    @Published private(set) var activeAction: String?
    @Published private(set) var errorMessage: String?
    @Published private(set) var noticeMessage: String?
    @Published private(set) var identityDocumentTypes: [NotaryIdentityDocumentTypeOption] = []
    @Published private(set) var identityFields: [NotaryIdentityDocumentField] = []
    @Published private(set) var isLoadingIdentitySchema = false
    @Published var identitySubjectName = ""
    @Published var identityDocumentType = "state_driver_license"
    @Published var identityIssuingJurisdiction = ""
    @Published var identityDocumentExpirationDate = ""
    @Published var identityDocumentNumberTail = ""
    @Published var identityMaskedIdentifier = ""
    @Published var venueState = ""
    @Published var venueCounty = ""
    @Published var venueCity = ""
    @Published var venueAddressLine1 = ""
    @Published var venueLocationLabel = ""
    @Published private(set) var venuePrefillMessage: String?
    @Published var notarialNotes = ""

    let requestId: String

    private let apiClient: NotaryProfileAPIProviding
    private let locationProvider: NotarySessionLocationProviding
    private let urlSession: URLSession
    private var previewTask: Task<Void, Never>?
    private var pollTask: Task<Void, Never>?
    private var loadedPreviewURL: String?
    private var hasLoadedProfile = false
    private var didAttemptVenuePrefill = false
    private var venuePrefillLatitude: Double?
    private var venuePrefillLongitude: Double?
    private var venuePrefillFormattedAddress: String?
    private var venuePrefillSource = "manual"
    private var preferLatestDocumentOnNextRefresh = false

    init(
        requestId: String,
        apiClient: NotaryProfileAPIProviding = NotaryProfileAPIClient(),
        locationProvider: NotarySessionLocationProviding = CoreLocationNotarySessionProvider(),
        urlSession: URLSession = .shared
    ) {
        self.requestId = requestId
        self.apiClient = apiClient
        self.locationProvider = locationProvider
        self.urlSession = urlSession
    }

    var step: NotaryInPersonSessionStep {
        Self.resolveStep(context: context)
    }

    var reviewDocuments: [NotaryReviewDocumentFile] {
        context?.document.reviewDocuments ?? []
    }

    var memberName: String {
        Self.firstNonempty([
            context?.owner?.displayName,
            context?.owner?.fullName,
            context?.owner?.email,
        ]) ?? "Member"
    }

    var screenTitle: String {
        "IN-PERSON SESSION - \(memberName.uppercased())"
    }

    var documentTypeLabel: String {
        Self.documentTypeLabel(context?.document.documentTypeLabel ?? context?.document.documentType)
    }

    var jurisdictionLabel: String {
        context?.document.jurisdiction?
            .replacingOccurrences(of: "-", with: "/")
            .uppercased() ?? ""
    }

    var documentCode: String {
        Self.firstNonempty([context?.document.idn, context?.document.id]) ?? "PENDING"
    }

    var canStartSession: Bool {
        context?.capabilities?.canManageMeeting == true
            && missingSessionAssets.isEmpty
            && hasRunningAction == false
    }

    var missingSessionAssets: [String] {
        var fields: [String] = []
        if notaryProfile?.signatureDataUrl?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty != false {
            fields.append("signature")
        }
        if notaryProfile?.sealDataUrl?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty != false {
            fields.append("seal")
        }
        return fields
    }

    var missingCompletionProfileFields: [String] {
        var fields: [String] = []
        if notaryProfile?.jurisdiction?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty != false {
            fields.append("jurisdiction")
        }
        if notaryProfile?.serviceAreaName?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty != false {
            fields.append("service area")
        }
        if notaryProfile?.commissionNumber?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty != false {
            fields.append("commission number")
        }
        if Self.isCurrentCommission(notaryProfile?.commissionExpiresAt) == false {
            fields.append("current commission expiration")
        }
        fields.append(contentsOf: missingSessionAssets)
        return fields
    }

    var canSealAcknowledgment: Bool {
        missingCompletionProfileFields.isEmpty && hasRunningAction == false
    }

    var hasRunningAction: Bool {
        activeAction != nil
    }

    var hasSessionStart: Bool {
        guard let context else { return false }
        return context.meeting?.status == "in_progress"
            || context.meeting?.status == "completed"
            || (context.evidence?.checkins.contains {
                $0.participantRole == "notary" && $0.checkinKind == "meeting_start"
            } ?? false)
    }

    var hasMemberCheckIn: Bool {
        context?.evidence?.checkins.contains { $0.participantRole == "member" } ?? false
    }

    var hasPassedSamePlace: Bool {
        context?.meeting?.samePlaceStatus == "passed"
            || (context?.evidence?.proximityEvaluations.contains { $0.status == "passed" } ?? false)
    }

    var hasVerifiedIdentity: Bool {
        context?.evidence?.identityVerifications.contains { $0.status == "verified" } ?? false
    }

    var hasVenue: Bool {
        latestVenue != nil
    }

    var hasAcknowledgment: Bool {
        context?.finalization?.history.contains { $0.status == "acknowledgment_appended" } ?? false
    }

    var isMeetingCompleted: Bool {
        context?.meeting?.status == "completed"
    }

    var isAnchored: Bool {
        context?.finalization?.isAnchored == true
    }

    var latestDistanceLabel: String {
        guard let distance = context?.evidence?.proximityEvaluations.last?.observedDistanceMeters else {
            return "Waiting"
        }
        return distance < 10 ? String(format: "%.1f m", distance) : "\(Int(distance.rounded())) m"
    }

    var samePlaceMessage: String {
        if hasPassedSamePlace {
            return "Member and Illuminotary locations are within the required 100-meter threshold."
        }
        if hasMemberCheckIn == false {
            return "Waiting for the member to open the email, sign in, and share their location. This screen updates automatically."
        }
        return "Member location received. DARCi is confirming both live locations."
    }

    var identityValidationMessage: String? {
        for field in identityFields.sorted(by: { $0.sortOrder < $1.sortOrder }) {
            let value = identityValue(for: field.fieldKey).trimmingCharacters(in: .whitespacesAndNewlines)
            if field.required && value.isEmpty {
                return "\(field.label) is required."
            }
            if value.isEmpty { continue }
            if field.inputKind == "date" && Self.isISODate(value) == false {
                return "\(field.label) must use YYYY-MM-DD."
            }
            if let minLength = field.minLength, value.count < minLength {
                return "\(field.label) must be at least \(minLength) characters."
            }
            if let maxLength = field.maxLength, value.count > maxLength {
                return "\(field.label) must be \(maxLength) characters or fewer."
            }
            if let pattern = field.pattern,
               let expression = try? NSRegularExpression(pattern: pattern),
               expression.firstMatch(in: value, range: NSRange(value.startIndex..., in: value))?.range != NSRange(value.startIndex..., in: value) {
                return "\(field.label) format is invalid."
            }
        }
        return nil
    }

    var canRecordIdentity: Bool {
        identityDocumentType.isEmpty == false
            && identityFields.isEmpty == false
            && identityValidationMessage == nil
            && hasRunningAction == false
    }

    var canRecordVenue: Bool {
        venueState.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
            && venueCounty.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
            && hasRunningAction == false
    }

    var timeline: [NotarySessionTimelineItem] {
        [
            NotarySessionTimelineItem(id: "start", label: "Session", isComplete: hasSessionStart),
            NotarySessionTimelineItem(id: "member", label: "Member", isComplete: hasMemberCheckIn),
            NotarySessionTimelineItem(id: "place", label: "Same place", isComplete: hasPassedSamePlace),
            NotarySessionTimelineItem(id: "identity", label: "Identity", isComplete: hasVerifiedIdentity),
            NotarySessionTimelineItem(id: "venue", label: "Venue", isComplete: hasVenue),
            NotarySessionTimelineItem(id: "seal", label: "Seal", isComplete: hasAcknowledgment),
            NotarySessionTimelineItem(id: "complete", label: "Complete", isComplete: isMeetingCompleted),
            NotarySessionTimelineItem(id: "anchor", label: "Anchored", isComplete: isAnchored),
        ]
    }

    var identityIssuingOptions: [String] {
        let field = identityFields.first { $0.fieldKey == "issuingJurisdiction" }
        let descriptor = [field?.label, field?.placeholder].compactMap { $0 }.joined(separator: " ").lowercased()
        if descriptor.contains("country") {
            return NotaryIdentitySelectContent.countries
        }
        if descriptor.contains("state") {
            return NotaryIdentitySelectContent.usStates
        }
        return []
    }

    var identityIssuingPlaceholder: String {
        let field = identityFields.first { $0.fieldKey == "issuingJurisdiction" }
        return field?.placeholder ?? field?.label ?? "Issuing jurisdiction"
    }

    var finalizationStatusLabel: String {
        Self.formatStatus(context?.finalization?.latestStatus ?? context?.finalization?.verificationStatus ?? "pending")
    }

    var hasLedgerFailure: Bool {
        context?.finalization?.anchorAttempt?.status == "failed"
            || context?.finalization?.latestStatus == "failed"
    }

    var publicVerificationURL: URL? {
        guard let path = context?.finalization?.publicVerifyPath, path.isEmpty == false else {
            return nil
        }
        if let absoluteURL = URL(string: path), absoluteURL.scheme != nil {
            return absoluteURL
        }
        return URL(string: "https://app.staging.darciregistry.dev\(path.hasPrefix("/") ? path : "/\(path)")")
    }

    func load(session: AuthSession?) async {
        await refresh(session: session, silent: false)
    }

    func stop() {
        pollTask?.cancel()
        pollTask = nil
        previewTask?.cancel()
        previewTask = nil
    }

    func selectDocument(_ document: NotaryReviewDocumentFile) {
        selectedDocument = document
        loadPreview(for: document)
    }

    func selectIdentityDocumentType(_ documentType: String, session: AuthSession?) async {
        guard identityDocumentType != documentType else { return }
        identityDocumentType = documentType
        identityIssuingJurisdiction = ""
        identityDocumentExpirationDate = ""
        identityDocumentNumberTail = ""
        identityMaskedIdentifier = ""
        await loadIdentitySchema(session: session)
    }

    func markVenueEdited() {
        venuePrefillSource = "manual"
        venuePrefillLatitude = nil
        venuePrefillLongitude = nil
        venuePrefillFormattedAddress = nil
    }

    func startSession(session: AuthSession?) async {
        guard let accessToken = session?.accessToken else {
            errorMessage = "Sign in again to start the in-person session."
            return
        }

        await runAction("start") {
            let geolocation = try await locationProvider.currentGeolocation(captureStage: "meeting_start")
            _ = try await apiClient.startInPersonSession(
                requestId: requestId,
                request: NotarySessionStartRequest(
                    recordedAt: Self.isoTimestamp(),
                    notes: "In-person session started from the DARCi iOS app.",
                    geolocation: geolocation
                ),
                accessToken: accessToken
            )
            noticeMessage = "Session started. The member has been emailed to sign in and share their location."
            await refresh(session: session, silent: true)
        }
    }

    func refreshSamePlace(session: AuthSession?) async {
        guard let accessToken = session?.accessToken else {
            errorMessage = "Sign in again to refresh your location."
            return
        }

        await runAction("same-place") {
            let geolocation = try await locationProvider.currentGeolocation(captureStage: "proximity_validation")
            _ = try await apiClient.recordNotaryCheckIn(
                requestId: requestId,
                request: NotaryMeetingCheckInRequest(
                    checkinKind: "proximity",
                    recordedAt: Self.isoTimestamp(),
                    notes: "Illuminotary proximity location refreshed from the DARCi iOS app.",
                    geolocation: geolocation
                ),
                accessToken: accessToken
            )
            await refresh(session: session, silent: true)
            if hasMemberCheckIn && hasPassedSamePlace == false {
                _ = try await apiClient.recordProximityEvaluation(
                    requestId: requestId,
                    request: NotaryProximityEvaluationRequest(
                        thresholdMeters: 100,
                        evaluatedAt: Self.isoTimestamp(),
                        notes: "Same-place evaluation requested after iOS location refresh."
                    ),
                    accessToken: accessToken
                )
                await refresh(session: session, silent: true)
            }
        }
    }

    func recordIdentity(session: AuthSession?) async {
        guard let accessToken = session?.accessToken else {
            errorMessage = "Sign in again to record identity verification."
            return
        }
        guard canRecordIdentity else {
            errorMessage = identityValidationMessage ?? "Complete the identity verification fields."
            return
        }

        await runAction("identity") {
            _ = try await apiClient.recordIdentityVerification(
                requestId: requestId,
                request: NotaryIdentityVerificationRequest(
                    verifiedAt: Self.isoTimestamp(),
                    subjectName: identitySubjectName.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
                    documentType: identityDocumentType,
                    issuingJurisdiction: identityIssuingJurisdiction.trimmingCharacters(in: .whitespacesAndNewlines),
                    documentExpirationDate: identityDocumentExpirationDate.trimmingCharacters(in: .whitespacesAndNewlines),
                    documentNumberTail: identityDocumentNumberTail.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
                    maskedIdentifier: identityMaskedIdentifier.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
                ),
                accessToken: accessToken
            )
            noticeMessage = "Member identity verified."
            await refresh(session: session, silent: true)
        }
    }

    func prefillVenue(session: AuthSession?) async {
        guard let accessToken = session?.accessToken else {
            errorMessage = "Sign in again to load the acknowledgment venue."
            return
        }

        await runAction("venue-prefill", clearsNotice: false) {
            venuePrefillMessage = "Finding the acknowledgment venue from your current location..."
            let geolocation = try await locationProvider.currentGeolocation(captureStage: "proximity_validation")
            let response = try await apiClient.reverseGeocodeVenue(
                requestId: requestId,
                request: NotaryReverseGeocodeRequest(
                    latitude: geolocation.latitude,
                    longitude: geolocation.longitude
                ),
                accessToken: accessToken
            )
            guard let venue = response.venue else {
                throw NotaryInPersonSessionError.missingVenue
            }
            venueState = venue.state
            venueCounty = venue.county
            venueCity = venue.city ?? ""
            venueAddressLine1 = venue.addressLine1 ?? ""
            venueLocationLabel = venue.locationLabel ?? ""
            venuePrefillSource = "gps_reverse_geocode"
            venuePrefillLatitude = geolocation.latitude
            venuePrefillLongitude = geolocation.longitude
            venuePrefillFormattedAddress = response.formattedAddress
            venuePrefillMessage = "Venue prefilled from your current location. Confirm the details before continuing."
        }
    }

    func recordVenue(session: AuthSession?) async {
        guard let accessToken = session?.accessToken else {
            errorMessage = "Sign in again to record the acknowledgment venue."
            return
        }
        guard canRecordVenue else {
            errorMessage = "State and county are required to capture the venue."
            return
        }

        await runAction("venue") {
            let timestamp = Self.isoTimestamp()
            _ = try await apiClient.recordVenue(
                requestId: requestId,
                request: NotaryVenueCaptureRequest(
                    venue: NotaryVenue(
                        state: venueState.trimmingCharacters(in: .whitespacesAndNewlines),
                        county: venueCounty.trimmingCharacters(in: .whitespacesAndNewlines),
                        city: venueCity.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
                        addressLine1: venueAddressLine1.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
                        locationLabel: venueLocationLabel.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
                        completedAt: timestamp
                    ),
                    capturedAt: timestamp,
                    notes: "Acknowledgment venue confirmed from the DARCi iOS app.",
                    prefillMetadata: NotaryVenuePrefillMetadata(
                        prefillSource: venuePrefillSource,
                        formattedAddress: venuePrefillFormattedAddress,
                        prefillLat: venuePrefillLatitude,
                        prefillLng: venuePrefillLongitude
                    )
                ),
                accessToken: accessToken
            )
            noticeMessage = "Acknowledgment venue captured."
            await refresh(session: session, silent: true)
        }
    }

    func sealAcknowledgment(session: AuthSession?) async {
        guard let accessToken = session?.accessToken else {
            errorMessage = "Sign in again to seal the acknowledgment."
            return
        }

        await runAction("seal") {
            let jurisdiction = notaryProfile?.jurisdiction?.trimmingCharacters(in: .whitespacesAndNewlines)
            let notaryName = Self.firstNonempty([
                context?.notary?.displayName,
                context?.notary?.fullName,
            ]) ?? "Illuminotary signature"
            _ = try await apiClient.signAcknowledgment(
                requestId: requestId,
                request: NotarySignRequest(
                    acknowledgment: NotaryAcknowledgmentConfirmation(
                        signerAppeared: true,
                        signerAcknowledged: true
                    ),
                    sealLabel: jurisdiction.map { "\($0) notary seal" } ?? "DARCi illuminotary seal",
                    signatureLabel: notaryName,
                    notes: notarialNotes.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
                ),
                accessToken: accessToken
            )
            preferLatestDocumentOnNextRefresh = true
            noticeMessage = "Seal and signature appended to the acknowledgment page."
            await refresh(session: session, silent: true)
        }
    }

    func completeSession(session: AuthSession?) async {
        guard let accessToken = session?.accessToken else {
            errorMessage = "Sign in again to complete the session."
            return
        }

        await runAction("complete") {
            do {
                _ = try await apiClient.advanceSession(
                    requestId: requestId,
                    request: NotarySessionAdvanceRequest(
                        advancedAt: Self.isoTimestamp(),
                        notes: notarialNotes.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
                    ),
                    accessToken: accessToken
                )
            } catch {
                await refresh(session: session, silent: true)
                throw error
            }
            preferLatestDocumentOnNextRefresh = true
            await refresh(session: session, silent: true)
            noticeMessage = isAnchored
                ? "Session complete. The final package is hashed and anchored."
                : "Session complete. Final package processing is still underway."
        }
    }

    func submitFinalPackage(session: AuthSession?) async {
        guard let accessToken = session?.accessToken else {
            errorMessage = "Sign in again to submit the final package."
            return
        }

        await runAction("finalize") {
            do {
                _ = try await apiClient.submitFinalPackage(
                    requestId: requestId,
                    request: NotaryFinalPackageSubmitRequest(
                        notes: notarialNotes.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
                    ),
                    accessToken: accessToken
                )
            } catch {
                await refresh(session: session, silent: true)
                throw error
            }
            preferLatestDocumentOnNextRefresh = true
            await refresh(session: session, silent: true)
            noticeMessage = "Final package hashed and anchored."
        }
    }

    func identityValue(for fieldKey: String) -> String {
        switch fieldKey {
        case "issuingJurisdiction":
            identityIssuingJurisdiction
        case "documentExpirationDate":
            identityDocumentExpirationDate
        case "documentNumberTail":
            identityDocumentNumberTail
        case "maskedIdentifier":
            identityMaskedIdentifier
        default:
            ""
        }
    }

    func updateIdentityValue(_ value: String, for fieldKey: String) {
        switch fieldKey {
        case "issuingJurisdiction":
            identityIssuingJurisdiction = value
        case "documentExpirationDate":
            identityDocumentExpirationDate = value
        case "documentNumberTail":
            identityDocumentNumberTail = value
        case "maskedIdentifier":
            identityMaskedIdentifier = value
        default:
            break
        }
    }

    nonisolated static func resolveStep(context: NotaryRequestReviewContext?) -> NotaryInPersonSessionStep {
        guard let context else { return .start }
        let evidence = context.evidence
        let hasPassedSamePlace = context.meeting?.samePlaceStatus == "passed"
            || (evidence?.proximityEvaluations.contains { $0.status == "passed" } ?? false)
        let hasVerifiedIdentity = evidence?.identityVerifications.contains { $0.status == "verified" } ?? false
        let hasVenue = evidence?.artifacts.contains {
            $0.artifactKind == "venue_capture" && $0.status == "active" && $0.metadata?.venue != nil
        } ?? false
        let hasAcknowledgment = context.finalization?.history.contains { $0.status == "acknowledgment_appended" } ?? false

        if context.finalization?.isAnchored == true { return .done }
        if context.meeting?.status == "completed" { return .finalize }
        if context.meeting?.status != "in_progress" { return .start }
        if hasPassedSamePlace == false { return .samePlace }
        if hasVerifiedIdentity == false { return .identity }
        if hasVenue == false { return .venue }
        if hasAcknowledgment == false { return .seal }
        return .complete
    }

    private var latestVenue: NotaryVenue? {
        context?.evidence?.artifacts
            .last { $0.artifactKind == "venue_capture" && $0.status == "active" && $0.metadata?.venue != nil }?
            .metadata?.venue
    }

    private var shouldPoll: Bool {
        context != nil && step != .done
    }

    private func refresh(session: AuthSession?, silent: Bool) async {
        guard let accessToken = session?.accessToken else {
            errorMessage = "Sign in again to load this in-person session."
            return
        }

        if silent == false { isLoading = true }
        defer {
            if silent == false { isLoading = false }
        }

        do {
            let response = try await apiClient.getNotaryRequestContext(requestId: requestId, accessToken: accessToken)
            guard let nextContext = response.context else {
                throw NotaryInPersonSessionError.missingContext
            }
            context = nextContext
            applyContextDefaults(nextContext)
            selectDocumentAfterRefresh(nextContext.document.reviewDocuments)
            errorMessage = nil

            if hasLoadedProfile == false {
                let response = try await apiClient.getMyNotaryProfile(accessToken: accessToken)
                notaryProfile = response.profile
                hasLoadedProfile = true
            }

            if step == .identity && identityFields.isEmpty {
                await loadIdentitySchema(session: session)
            }

            if step == .venue && hasVenue == false && didAttemptVenuePrefill == false {
                didAttemptVenuePrefill = true
                await prefillVenue(session: session)
            }
        } catch {
            errorMessage = Self.displayMessage(for: error, fallback: "Unable to load this in-person session.")
        }

        schedulePoll(session: session)
    }

    private func loadIdentitySchema(session: AuthSession?) async {
        guard let accessToken = session?.accessToken else { return }
        isLoadingIdentitySchema = true
        defer { isLoadingIdentitySchema = false }

        do {
            let response = try await apiClient.getIdentityDocumentSchema(
                documentType: identityDocumentType,
                accessToken: accessToken
            )
            identityDocumentTypes = response.documentTypes.sorted { $0.sortOrder < $1.sortOrder }
            identityDocumentType = response.selectedType.value
            identityFields = response.selectedType.fields.sorted { $0.sortOrder < $1.sortOrder }
        } catch {
            errorMessage = Self.displayMessage(for: error, fallback: "Unable to load identity document options.")
        }
    }

    private func applyContextDefaults(_ context: NotaryRequestReviewContext) {
        if identitySubjectName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            identitySubjectName = Self.firstNonempty([
                context.owner?.displayName,
                context.owner?.fullName,
                context.owner?.email,
            ]) ?? ""
        }

        if let latestVenue {
            if venueState.isEmpty { venueState = latestVenue.state }
            if venueCounty.isEmpty { venueCounty = latestVenue.county }
            if venueCity.isEmpty { venueCity = latestVenue.city ?? "" }
            if venueAddressLine1.isEmpty { venueAddressLine1 = latestVenue.addressLine1 ?? "" }
            if venueLocationLabel.isEmpty { venueLocationLabel = latestVenue.locationLabel ?? "" }
        }
    }

    private func selectDocumentAfterRefresh(_ documents: [NotaryReviewDocumentFile]) {
        guard documents.isEmpty == false else {
            selectedDocument = nil
            pdfData = nil
            loadedPreviewURL = nil
            return
        }

        let nextDocument: NotaryReviewDocumentFile
        if preferLatestDocumentOnNextRefresh {
            nextDocument = documents.last(where: { $0.downloadUrl != nil }) ?? documents[0]
            preferLatestDocumentOnNextRefresh = false
        } else if let selectedDocument,
                  let preserved = documents.first(where: { $0.id == selectedDocument.id }) {
            nextDocument = preserved
        } else {
            nextDocument = documents.last(where: { $0.isFinal && $0.downloadUrl != nil })
                ?? documents.first(where: { $0.downloadUrl != nil })
                ?? documents[0]
        }

        selectedDocument = nextDocument
        loadPreview(for: nextDocument)
    }

    private func loadPreview(for document: NotaryReviewDocumentFile) {
        guard let downloadURL = document.downloadUrl,
              let url = URL(string: downloadURL) else {
            pdfData = nil
            loadedPreviewURL = nil
            return
        }
        guard loadedPreviewURL != downloadURL else { return }

        previewTask?.cancel()
        isLoadingPreview = true
        previewTask = Task { [weak self] in
            guard let self else { return }
            defer { isLoadingPreview = false }
            do {
                let (data, response) = try await urlSession.data(from: url)
                guard let response = response as? HTTPURLResponse,
                      (200..<300).contains(response.statusCode) else {
                    throw NotaryInPersonSessionError.previewUnavailable
                }
                guard Task.isCancelled == false else { return }
                pdfData = data
                loadedPreviewURL = downloadURL
            } catch {
                guard Task.isCancelled == false else { return }
                pdfData = nil
                errorMessage = "Unable to load the session document preview."
            }
        }
    }

    private func schedulePoll(session: AuthSession?) {
        pollTask?.cancel()
        guard shouldPoll else {
            pollTask = nil
            return
        }

        pollTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(4))
            guard Task.isCancelled == false else { return }
            await self?.refresh(session: session, silent: true)
        }
    }

    private func runAction(
        _ action: String,
        clearsNotice: Bool = true,
        operation: () async throws -> Void
    ) async {
        guard activeAction == nil else { return }
        activeAction = action
        errorMessage = nil
        if clearsNotice { noticeMessage = nil }
        pollTask?.cancel()

        do {
            try await operation()
        } catch {
            if action == "venue-prefill" {
                venuePrefillMessage = "Automatic address lookup was unavailable. Enter the venue manually or retry location."
            }
            errorMessage = Self.displayMessage(for: error, fallback: "Unable to continue the in-person session.")
        }

        activeAction = nil
    }

    private static func isoTimestamp() -> String {
        ISO8601DateFormatter().string(from: Date())
    }

    private static func isISODate(_ value: String) -> Bool {
        guard value.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil else {
            return false
        }
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.isLenient = false
        return formatter.date(from: value) != nil
    }

    private static func isCurrentCommission(_ value: String?) -> Bool {
        let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard trimmed.isEmpty == false else { return false }

        if isISODate(trimmed) {
            let formatter = DateFormatter()
            formatter.calendar = Calendar(identifier: .gregorian)
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.timeZone = TimeZone(secondsFromGMT: 0)
            formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
            guard let expiration = formatter.date(from: "\(trimmed) 23:59:59") else { return false }
            return expiration >= Date()
        }

        guard let expiration = ISO8601DateFormatter().date(from: trimmed) else { return false }
        return expiration >= Date()
    }

    private static func firstNonempty(_ values: [String?]) -> String? {
        values.compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { $0.isEmpty == false }
    }

    private static func documentTypeLabel(_ value: String?) -> String {
        let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
        switch normalized {
        case "poa", "poa_only", "power_of_attorney":
            return "POA"
        case "trust", "trust_bundle", "trust_registration":
            return "TRUST"
        case "notarize_document", "document_notarization", "uploaded_document":
            return "DOCUMENT"
        default:
            return normalized.isEmpty ? "DOCUMENT" : normalized.split(separator: "_").map { $0.uppercased() }.joined(separator: " ")
        }
    }

    private static func formatStatus(_ value: String) -> String {
        value.split(separator: "_").map { $0.capitalized }.joined(separator: " ")
    }

    private static func displayMessage(for error: Error, fallback: String) -> String {
        if let localizedError = error as? LocalizedError,
           let message = localizedError.errorDescription,
           message.isEmpty == false {
            return message
        }

        if let apiError = error as? AuthAPIError {
            switch apiError {
            case .wrongCode(let message),
                .unauthorized(let message),
                .validation(let message),
                .rateLimited(let message),
                .server(_, let message),
                .unexpectedStatus(_, let message):
                return message ?? fallback
            case .emptyResponse, .invalidResponse, .invalidURL:
                return fallback
            }
        }

        return fallback
    }
}

enum NotaryInPersonSessionError: LocalizedError {
    case missingContext
    case missingVenue
    case previewUnavailable

    var errorDescription: String? {
        switch self {
        case .missingContext:
            "This notary request is no longer available."
        case .missingVenue:
            "DARCi could not resolve an address from this location."
        case .previewUnavailable:
            "The session document preview is unavailable."
        }
    }
}

private extension String {
    var nilIfEmpty: String? {
        isEmpty ? nil : self
    }
}