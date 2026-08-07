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
    @Published private(set) var realtimeState: NotarySessionRealtimeState = .idle

    let requestId: String

    private let apiClient: RequestsAPIProviding
    private let locationProvider: NotarySessionLocationProviding
    private let realtimeClient: NotarySessionRealtimeProviding
    private let urlSession: URLSession
    private var previewTask: Task<Void, Never>?
    private var pollTask: Task<Void, Never>?
    private var loadedPreviewURL: String?
    private var didStartRealtime = false

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

    var hasMemberCheckIn: Bool {
        hasParticipantCheckedIn(role: "member")
    }

    var timeline: [MemberSessionTimelineItem] {
        let meeting = context?.meeting
        let finalization = context?.document.summary.finalization
        let hasNotaryCheckIn = hasParticipantCheckedIn(role: "notary")
        let isMeetingCompleted = meeting?.status == "completed"
        let isSessionStarted = meeting?.status == "in_progress" || isMeetingCompleted || hasNotaryCheckIn
        let hasSamePlace = meeting?.samePlaceStatus == "passed"
            || (meeting?.proximityEvaluations.contains { $0.evaluationKind == "same_place" && $0.status == "passed" } ?? false)
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
            MemberSessionTimelineItem(id: "start", label: "Session started", description: "Your Illuminotary opened the live session.", isComplete: isSessionStarted),
            MemberSessionTimelineItem(id: "member", label: "Location shared", description: "Your live location has been shared.", isComplete: hasMemberCheckIn),
            MemberSessionTimelineItem(id: "place", label: "Same-place confirmed", description: "Both live locations are together.", isComplete: hasSamePlace),
            MemberSessionTimelineItem(id: "identity", label: "Identity verified", description: "Your identity has been verified.", isComplete: hasIdentity),
            MemberSessionTimelineItem(id: "venue", label: "Venue recorded", description: "The venue details are recorded.", isComplete: hasVenue),
            MemberSessionTimelineItem(id: "seal", label: "Acknowledgment appended", description: "The notarial acknowledgment is on the document.", isComplete: hasAcknowledgment),
            MemberSessionTimelineItem(id: "complete", label: "Session completed", description: "The in-person session is closed.", isComplete: isMeetingCompleted),
            MemberSessionTimelineItem(id: "anchor", label: "Verification ready", description: "The final package is verification-ready.", isComplete: isVerificationReady),
        ]
    }

    func load(session: AuthSession?) async {
        await refresh(session: session, silent: false)
        startRealtimeIfNeeded(session: session)
    }

    func refreshFromForeground(session: AuthSession?) async {
        guard context != nil else { return }
        await refresh(session: session, silent: true)
    }

    func stop() {
        realtimeClient.stop()
        didStartRealtime = false
        pollTask?.cancel()
        pollTask = nil
        previewTask?.cancel()
        previewTask = nil
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
            noticeMessage = "Location shared. Your Illuminotary can continue the session."
            await refresh(session: session, silent: true)
        } catch {
            errorMessage = Self.displayMessage(for: error, fallback: "Unable to share your location.")
        }
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
                await self?.refresh(session: session, silent: true)
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
        return fallback
    }
}

private extension String {
    var nilIfEmpty: String? {
        isEmpty ? nil : self
    }
}