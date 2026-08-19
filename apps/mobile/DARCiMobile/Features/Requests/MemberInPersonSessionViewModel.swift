import Foundation

struct MemberSessionTimelineItem: Identifiable, Equatable, Sendable {
    let id: String
    let label: String
    let description: String
    let isComplete: Bool
}

@MainActor
final class MemberInPersonSessionViewModel: ObservableObject {
    @Published private(set) var context: MemberInPersonSessionResponse?
    @Published private(set) var selectedDocument: NotaryReviewDocumentFile?
    @Published private(set) var pdfData: Data?
    @Published private(set) var isLoading = false
    @Published private(set) var isLoadingPreview = false
    @Published private(set) var isSharingLocation = false
    @Published private(set) var errorMessage: String?
    @Published private(set) var noticeMessage: String?
    @Published private(set) var noticeToken = 0
    @Published private(set) var shouldShowLocationSettingsAction = false
    @Published private(set) var realtimeState: NotarySessionRealtimeState = .idle

    let requestId: String

    private let apiClient: RequestsAPIProviding
    private let locationProvider: NotarySessionLocationProviding
    private let realtimeClient: NotarySessionRealtimeProviding
    private let urlSession: URLSession
    private var previewTask: Task<Void, Never>?
    private var pollTask: Task<Void, Never>?
    private var noticeDismissTask: Task<Void, Never>?
    private var loadedPreviewURL: String?
    private var didStartRealtime = false
    private var didAttemptAutomaticLocationShare = false

    init(
        requestId: String,
        apiClient: RequestsAPIProviding = RequestsAPIClient(),
        locationProvider: NotarySessionLocationProviding = CoreLocationNotarySessionProvider(),
        realtimeClient: NotarySessionRealtimeProviding = NotarySessionRealtimeCoordinator(),
        urlSession: URLSession = .shared
    ) {
        self.requestId = requestId
        self.apiClient = apiClient
        self.locationProvider = locationProvider
        self.realtimeClient = realtimeClient
        self.urlSession = urlSession
    }

    var reviewDocuments: [NotaryReviewDocumentFile] {
        context?.document.reviewDocuments ?? []
    }

    var screenTitle: String {
        "IN-PERSON SESSION"
    }

    var notaryName: String {
        context?.notary?.displayName?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
            ?? "Your Illuminotary"
    }

    var notaryEmail: String? {
        context?.notary?.email?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
    }

    var notaryPhone: String? {
        context?.notary?.phone?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
    }

    var isLiveSessionActive: Bool {
        let status = context?.meeting?.status?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return status == "in_progress" || status == "completed"
    }

    var shouldShowContactExchange: Bool {
        context != nil && isLiveSessionActive == false
    }

    var documentTypeLabel: String {
        let value = context?.document.documentType?
            .replacingOccurrences(of: "_", with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return value?.capitalized.nilIfEmpty ?? "Document"
    }

    var jurisdictionLabel: String {
        context?.document.jurisdiction?
            .replacingOccurrences(of: "-", with: "/")
            .uppercased() ?? ""
    }

    var documentCode: String {
        context?.document.idn?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
            ?? context?.document.id
            ?? "PENDING"
    }

    var publicVerificationURL: URL? {
        guard let path = context?.document.summary.finalization.publicVerifyPath?.trimmingCharacters(in: .whitespacesAndNewlines),
              path.isEmpty == false,
              context?.meeting?.status == "completed",
              context?.document.summary.finalization.isAnchored == true else {
            return nil
        }
        if let absoluteURL = URL(string: path), absoluteURL.scheme != nil {
            return absoluteURL
        }
        return URL(string: "https://app.staging.darciregistry.dev\(path.hasPrefix("/") ? path : "/\(path)")")
    }

    var statusLabel: String {
        let value = context?.meeting?.status
            ?? context?.request.meetingStatus
            ?? context?.request.status
            ?? context?.workflow?.latestStatus
            ?? "pending"
        return value.replacingOccurrences(of: "_", with: " ").capitalized
    }

    var canShareLocation: Bool {
        context?.meeting?.status == "in_progress" && isSharingLocation == false
    }

    var shareLocationButtonTitle: String {
        if isSharingLocation {
            return hasMemberCheckIn ? "Refreshing location..." : "Sharing location..."
        }

        return hasMemberCheckIn ? "Re-share location" : "Share location"
    }

    var hasMemberCheckIn: Bool {
        context?.meeting?.checkins?.contains {
            $0.participantRole == "member" && ["arrival", "proximity", "manual"].contains($0.checkinKind)
        } ?? false
    }

    var latestSamePlaceEvaluation: MemberSessionProximityEvaluation? {
        context?.meeting?.proximityEvaluations.last(where: { $0.evaluationKind == "same_place" })
    }

    var timeline: [MemberSessionTimelineItem] {
        let meeting = context?.meeting
        let finalization = context?.document.summary.finalization
        let hasNotaryCheckIn = hasParticipantCheckedIn(role: "notary")
        let isMeetingCompleted = meeting?.status == "completed"
        let isSessionStarted = meeting?.status == "in_progress" || isMeetingCompleted || hasNotaryCheckIn
        let hasSamePlace = meeting?.samePlaceStatus == "passed"
            || (meeting?.proximityEvaluations.contains { $0.evaluationKind == "same_place" && $0.status == "passed" } ?? false)
        let samePlaceDescription = self.samePlaceDescription(
            meetingStatus: meeting?.samePlaceStatus,
            evaluation: latestSamePlaceEvaluation,
            hasMemberCheckIn: hasMemberCheckIn
        )
        let hasIdentity = meeting?.identityVerifications.contains {
            ["member", "signer"].contains($0.participantRole) && $0.status == "verified"
        } ?? false
        let hasVenue = meeting?.artifacts.contains {
            $0.artifactKind == "venue_capture" && $0.status == "active"
        } ?? false
        let hasAcknowledgment = finalization?.history.contains { $0.status == "acknowledgment_appended" } ?? false
        let isVerificationReady = finalization?.isAnchored == true
            && context?.document.summary.verification.verifyPath?.nilIfEmpty != nil

        return [
            MemberSessionTimelineItem(id: "start", label: "Session started", description: isSessionStarted ? "Your Illuminotary opened the live session." : "Waiting for your Illuminotary to open the live session.", isComplete: isSessionStarted),
            MemberSessionTimelineItem(id: "member", label: "Location shared", description: hasMemberCheckIn ? "Your live location was shared." : "Share your live location so your Illuminotary can confirm you are together.", isComplete: hasMemberCheckIn),
            MemberSessionTimelineItem(id: "place", label: "Same-place confirmed", description: samePlaceDescription, isComplete: hasSamePlace),
            MemberSessionTimelineItem(id: "identity", label: "Identity verified", description: hasIdentity ? "Your identity has been verified." : "Your Illuminotary is recording the identity verification.", isComplete: hasIdentity),
            MemberSessionTimelineItem(id: "venue", label: "Venue recorded", description: hasVenue ? "The venue details are recorded." : "Your Illuminotary is recording the acknowledgment venue.", isComplete: hasVenue),
            MemberSessionTimelineItem(id: "seal", label: "Acknowledgment appended", description: hasAcknowledgment ? "The notarial acknowledgment is on the document." : "Your Illuminotary is appending the notarial acknowledgment.", isComplete: hasAcknowledgment),
            MemberSessionTimelineItem(id: "complete", label: "Session completed", description: isMeetingCompleted ? "The in-person session is closed." : "Your Illuminotary will close the session after evidence is complete.", isComplete: isMeetingCompleted),
            MemberSessionTimelineItem(id: "anchor", label: "Verification ready", description: isVerificationReady ? "The final package is verification-ready." : "DARCi is preparing the final public verification package.", isComplete: isVerificationReady),
        ]
    }
    private func samePlaceDescription(
        meetingStatus: String?,
        evaluation: MemberSessionProximityEvaluation?,
        hasMemberCheckIn: Bool
    ) -> String {
        if meetingStatus == "passed" || evaluation?.status == "passed" {
            return "Both live locations are together."
        }

        if meetingStatus == "failed" || evaluation?.status == "failed" {
            if let distance = evaluation?.observedDistanceMeters {
                return "Locations are \(Self.distanceLabel(for: distance)) apart. Your Illuminotary may need to refresh location."
            }
            return "Locations are not together yet. Your Illuminotary may need to refresh location."
        }

        if hasMemberCheckIn {
            return "DARCi is checking whether both live locations are together."
        }

        return "Waiting for your live location before DARCi checks same-place presence."
    }

    private static func distanceLabel(for meters: Double) -> String {
        if meters >= 1000 {
            return String(format: "%.2f km", meters / 1000)
        }
        if meters >= 10 {
            return "\(Int(meters.rounded())) m"
        }
        return String(format: "%.1f m", meters)
    }

    func load(session: AuthSession?) async {
        await refresh(session: session, silent: false)
        startRealtimeIfNeeded(session: session)
        prepareLocationIfHelpful()
        await shareLocationAutomaticallyIfNeeded(session: session)
    }

    func refreshFromForeground(session: AuthSession?) async {
        guard context != nil else { return }
        await refresh(session: session, silent: true)
        prepareLocationIfHelpful()
        await shareLocationAutomaticallyIfNeeded(session: session)
    }

    func stop() {
        realtimeClient.stop()
        didStartRealtime = false
        pollTask?.cancel()
        pollTask = nil
        previewTask?.cancel()
        previewTask = nil
        noticeDismissTask?.cancel()
        noticeDismissTask = nil
        locationProvider.stopPreparingLocationCapture()
    }

    func selectDocument(_ document: NotaryReviewDocumentFile) {
        selectedDocument = document
        loadPreview(for: document)
    }

    func shareLocation(session: AuthSession?) async {
        guard let accessToken = session?.accessToken else {
            errorMessage = "Sign in again to share your location."
            return
        }
        guard canShareLocation else { return }

        isSharingLocation = true
        errorMessage = nil
        noticeMessage = nil
        shouldShowLocationSettingsAction = false
        defer { isSharingLocation = false }

        do {
            let geolocation = try await locationProvider.currentGeolocation(captureStage: "member_check_in")
            _ = try await apiClient.recordMemberCheckIn(
                requestId: requestId,
                request: MemberMeetingCheckInRequest(
                    recordedAt: ISO8601DateFormatter().string(from: Date()),
                    notes: "Member checked in from the native member session.",
                    geolocation: geolocation
                ),
                accessToken: accessToken
            )
            showNotice("Location shared. Your Illuminotary can continue the session.")
            shouldShowLocationSettingsAction = false
            await refresh(session: session, silent: true)
            prepareLocationIfHelpful()
        } catch {
            errorMessage = Self.displayMessage(for: error, fallback: "Unable to share your location.")
            shouldShowLocationSettingsAction = (error as? NotarySessionLocationError) == .permissionDenied
        }
    }

    private func showNotice(_ message: String) {
        noticeDismissTask?.cancel()
        noticeMessage = message
        noticeToken += 1
        noticeDismissTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(4))
            guard Task.isCancelled == false else { return }
            await MainActor.run {
                self?.noticeMessage = nil
            }
        }
    }

    private func shareLocationAutomaticallyIfNeeded(session: AuthSession?) async {
        guard didAttemptAutomaticLocationShare == false,
              context?.meeting?.status == "in_progress",
              hasMemberCheckIn == false else { return }

        didAttemptAutomaticLocationShare = true
        await shareLocation(session: session)
    }

    private func prepareLocationIfHelpful() {
        guard context?.meeting?.status == "in_progress" else {
            locationProvider.stopPreparingLocationCapture()
            return
        }

        locationProvider.prepareForLocationCapture()
    }

    private func hasParticipantCheckedIn(role: String) -> Bool {
        guard let participant = context?.meeting?.participants.first(where: { $0.participantRole == role }) else {
            return false
        }
        return ["checked_in", "completed"].contains(participant.status) || participant.arrivedAt != nil
    }

    private func startRealtimeIfNeeded(session: AuthSession?) {
        guard didStartRealtime == false, let accessToken = session?.accessToken else { return }
        didStartRealtime = true
        realtimeClient.start(
            requestId: requestId,
            accessToken: accessToken,
            onStateChange: { [weak self] state in
                guard let self else { return }
                realtimeState = state
                if state == .degraded {
                    schedulePoll(session: session)
                } else if state == .live || state == .idle {
                    pollTask?.cancel()
                    pollTask = nil
                }
            },
            onInvalidate: { [weak self] in
                guard let self else { return }
                await refresh(session: session, silent: true)
                prepareLocationIfHelpful()
                await shareLocationAutomaticallyIfNeeded(session: session)
            }
        )
    }

    private func refresh(session: AuthSession?, silent: Bool) async {
        guard let accessToken = session?.accessToken else {
            errorMessage = "Sign in again to load this in-person session."
            return
        }

        if silent == false { isLoading = true }
        defer { if silent == false { isLoading = false } }

        do {
            let nextContext = try await apiClient.getMemberInPersonSession(requestId: requestId, accessToken: accessToken)
            context = nextContext
            selectDocumentAfterRefresh(nextContext.document.reviewDocuments)
            errorMessage = nil
        } catch {
            errorMessage = Self.displayMessage(for: error, fallback: "Unable to load this in-person session.")
        }

        schedulePoll(session: session)
    }

    private func selectDocumentAfterRefresh(_ documents: [NotaryReviewDocumentFile]) {
        guard documents.isEmpty == false else {
            selectedDocument = nil
            pdfData = nil
            loadedPreviewURL = nil
            return
        }

        let nextDocument = selectedDocument.flatMap { current in
            documents.first(where: { $0.id == current.id })
        } ?? documents.last(where: { $0.isFinal && $0.downloadUrl != nil })
            ?? documents.last(where: { $0.downloadUrl != nil })
            ?? documents[0]
        selectedDocument = nextDocument
        loadPreview(for: nextDocument)
    }

    private func loadPreview(for document: NotaryReviewDocumentFile) {
        guard let downloadURL = document.downloadUrl, let url = URL(string: downloadURL) else {
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
                    throw URLError(.badServerResponse)
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
        guard realtimeState == .degraded,
              context?.meeting?.status != "completed",
              context?.document.summary.finalization.isAnchored != true else {
            pollTask = nil
            return
        }

        pollTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(30))
            guard Task.isCancelled == false else { return }
            await self?.refresh(session: session, silent: true)
        }
    }

    private static func displayMessage(for error: Error, fallback: String) -> String {
        if let localizedError = error as? LocalizedError,
           let description = localizedError.errorDescription?.nilIfEmpty {
            return description
        }

        if let apiError = error as? AuthAPIError {
            switch apiError {
            case .wrongCode(let message),
                .unauthorized(let message),
                .validation(let message),
                .rateLimited(let message),
                .server(_, let message),
                .unexpectedStatus(_, let message):
                return message?.nilIfEmpty ?? fallback
            case .emptyResponse, .invalidResponse, .invalidURL:
                return fallback
            }
        }

        return fallback
    }
}

private extension String {
    var nilIfEmpty: String? {
        isEmpty ? nil : self
    }
}